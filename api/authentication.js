// ============================================================
// ФАЙЛ: api/authentication.js
// 
// НАЗНАЧЕНИЕ: Главный API обработки сообщений юзера
// 
// ЧТО ДЕЛАЕТ:
// 1. Получает сообщение от widget.js
// 2. Загружает конфиг клиента из Google Sheet
// 3. Отправляет сообщение юзера в Telegram менеджеру
// 4. Проверяет: ИИ включён или менеджер отвечает?
// 5. Если ИИ включён: отправляет в Claude, возвращает ответ
// 6. Если ИИ выключен: отправляет WARNING сообщение в Telegram
// 7. Считает и вычитает токены после ответа ИИ
// ============================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// ============================================================
// ИНИЦИАЛИЗАЦИЯ: Firebase Admin SDK
// ============================================================

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

module.exports = async (req, res) => {
  // ============================================================
  // ШАГ 1: CORS заголовки
  // ============================================================
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ============================================================
    // ШАГ 2: Получить данные от widget
    // ============================================================
    
    const { clientId, sessionId, messages } = req.body;
    
    console.log(`🔵 Запрос от ${clientId} | session: ${sessionId}`);

    if (!clientId || !messages) {
      return res.status(400).json({ 
        error: "clientId и messages обязательны",
        received: { clientId, messages: messages ? 'OK' : 'missing' }
      });
    }

    // ============================================================
    // ШАГ 3: Загрузить конфиг клиента из Google Sheet
    // v2.5 - fix row 5 with debug logs
    // ============================================================
    
    console.log('📊 Читаем Google Sheet...');

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
      ],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByTitle['Authentication'];
    if (!sheet) {
      return res.status(500).json({ error: "Таблица повреждена" });
    }

    await sheet.loadCells();

    // Найти строку клиента
    // ✅ Строки 1-4 = заметки (пропускаем)
    // ✅ Начинаем со строки 5 (первые реальные данные)
    // ✅ Пропускаем пустые и мусорные строки
    const defaultRow = 1;  // Строка 1 = шапка (заголовки)
    let foundRow = null;

    console.log(`🔍 Ищем клиента: ${clientId}`);
    console.log(`📊 Всего строк в листе: ${sheet.rowCount}`);

    for (let i = 5; i < sheet.rowCount; i++) {
      const cellValue = sheet.getCell(i, 0).value;
      console.log(`📍 Строка ${i}: cellValue="${cellValue}"`);
      
      // Пропускаем пустые строки и строки с текстом (не начинаются с mina_)
      if (cellValue && cellValue.startsWith('mina_')) {
        console.log(`✅ Найдена строка с mina_: "${cellValue}"`);
        
        if (cellValue === clientId) {
          console.log(`🎯 СОВПАДЕНИЕ! Строка ${i} = ${clientId}`);
          foundRow = i;
          break;
        }
      }
    }

    if (foundRow === null) {
      console.error(`❌ Клиент ${clientId} не найден в листе!`);
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // === Прочитать данные клиента ===
    // A(0)=clientId B(1)=botName C(2)=primaryColor D(3)=googleDocId E(4)=claudeKey
    // F(5)=tgToken G(6)=tgChatId H(7)=tgChatId (доп) I(8)=status J(9)=avatarUrl
    // K(10)=tokenBalance L(11)=tokenTariff M(12)=tokenSpent N(13)=resetDate
    
    const status = get(8);           // I: Статус (active/inactive)
    const claudeKey = get(4);        // E: API ключ Claude
    const googleDocId = get(3);      // D: Google Doc с промптом
    const tgToken = get(5);          // F: Telegram токен
    const tgChatId = get(6);         // G: Telegram группа ID
    const avatarUrl = get(9);        // J: Аватарка
    
    // Читаем токены для последующего использования в ШАГ 12
    const tokenBalance = get(10);    // K: Баланс (куплено токенов)
    const tokenTariff = get(11);     // L: Тариф (цена за 1 символ)
    let tokenSpent = get(12);        // M: Потрачено токенов

    console.log(`✅ Клиент найден в строке ${foundRow}`);
    console.log(`💰 Токены: баланс=${tokenBalance}, тариф=${tokenTariff}, потрачено=${tokenSpent}`);

    // === Проверка обязательных данных ===
    if (status !== 'active') {
      return res.status(403).json({ error: "Агент отключен" });
    }

    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ Claude не найден" });
    }

    // ============================================================
    // ШАГ 4: Получить статус ИИ из Firebase
    // ============================================================
 

    
    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;  // По умолчанию TRUE

    console.log(`🤖 ИИ включён: ${aiEnabled}`);

    // ============================================================
    // ШАГ 5: Создать уникальный номер диалога
    // ============================================================
    
    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();

    if (!dialogNum) {
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;
      await dialogNumRef.set(dialogNum);
      console.log(`🔢 Диалог №${dialogNum}`);
    }

    // ============================================================
    // ШАГ 6: Создать тему в Telegram (если нужна)
    // ============================================================
    
    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
        console.log('📱 Создаём тему в Telegram...');
        const topicRes = await fetch(`https://api.telegram.org/bot${tgToken}/createForumTopic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            name: `Диалог #${dialogNum} [${clientId}]`,
          })
        });
        const topicData = await topicRes.json();
        if (topicData.ok) {
          threadId = topicData.result.message_thread_id;
          await threadIdRef.set(threadId);
          console.log(`✅ Тема создана: ${threadId}`);
        }
      } catch (e) {
        console.error('❌ Ошибка создания темы:', e.message);
      }
    }

    // ============================================================
    // ШАГ 7: Отправить ПОЛНЫЙ ДИАЛОГ в Telegram менеджеру
    // ============================================================
    
    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg && lastMsg.role === 'user' ? lastMsg.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        console.log('📤 Отправляем ПОЛНЫЙ ДИАЛОГ в Telegram...');

        // ✅ Форматируем ВСЮ историю диалога
        let dialogText = '';
        messages.forEach(msg => {
          if (msg.role === 'user') {
            dialogText += `👤 Юзер: ${msg.content}\n`;
          } else if (msg.role === 'assistant') {
            dialogText += `🤖 Амина: ${msg.content}\n`;
          }
        });

        // ✅ Если ИИ ВЫКЛЮЧЕН - добавляем WARNING
        let statusText = '';
        if (!aiEnabled) {
          statusText = `🔴 ИИ ВЫК. Отвечай через Reply!`;
        } else {
          statusText = `🟢 ИИ активен`;
        }
        
        // ✅ Собираем сообщение с ПОЛНОЙ историей
        const tgText = `💬 Диалог #${dialogNum} [${clientId}]\n\n${dialogText}\n${statusText}\nsession: ${sessionId}`;

        // ✅ Создаём кнопки для управления ИИ
        const keyboard = aiEnabled ? [[
          { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]] : [[
          { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]];

        const msgBody = {
          chat_id: tgChatId,
          text: tgText,
          reply_markup: { inline_keyboard: keyboard }
        };

        if (threadId) msgBody.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody)
        });

        console.log('✅ ПОЛНЫЙ ДИАЛОГ отправлен в Telegram');

        // ✅ Если ИИ ВЫКЛЮЧЕН - возвращаем пусто
        if (!aiEnabled) {
          return res.status(200).json({
            text: null,
            aiDisabled: true,
            avatarUrl: avatarUrl
          });
        }

      } catch (e) {
        console.error('❌ Ошибка Telegram:', e.message);
      }
    }

    // ============================================================
    // ШАГ 9: Если ИИ включён - читаем промпт из Google Doc
    // ============================================================
    
    let systemPrompt = "Ты полезный помощник";

    if (googleDocId) {
      try {
        console.log('📄 Читаем промпт из Google Doc...');
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')
            .join(''))
          .join('')
          .trim();

        console.log(`✅ Промпт загружен (${systemPrompt.length} символов)`);

      } catch (e) {
        console.error('❌ Ошибка промпта:', e.message);
      }
    }

    // ============================================================
    // ШАГ 10: Очистить историю для Claude
    // Claude принимает только role и content
    // ============================================================
    
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // ============================================================
    // ШАГ 11: Отправить в Claude AI
    // ============================================================
    
    console.log('🚀 Отправляем в Claude...');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: cleanMessages
      })
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error('❌ Ошибка Claude:', claudeData);
      return res.status(claudeResponse.status).json({
        error: "Ошибка Claude API",
        details: claudeData
      });
    }

    const botText = claudeData.content[0].text;
    console.log('✅ Claude ответил');

// ============================================================
    // ШАГ 12: Подсчитать и вычесть токены
    // v2.3 - fix cache
    // ============================================================
    
    // ✅ Убедимся что всё это числа (преобразуем строки в числа)
    const tokenBalanceNum = parseFloat(tokenBalance) || 0;
    const tokenTariffNum = parseFloat(tokenTariff) || 0;
    const tokenSpentNum = parseFloat(tokenSpent) || 0;
    
    console.log('💰 Подсчитываем потраченные токены...');
    console.log(`💰 Токены (преобразованы): баланс=${tokenBalanceNum}, тариф=${tokenTariffNum}, потрачено=${tokenSpentNum}`);
    
    // ✅ Считаем символы в ответе ИИ
    const responseChars = botText.length;
    console.log(`📝 Символов в ответе ИИ: ${responseChars}`);
    
    // ✅ Считаем стоимость ответа
    const costResponse = responseChars * tokenTariffNum;
    console.log(`💸 Стоимость ответа: ${responseChars} символов × ${tokenTariffNum} = ${costResponse.toFixed(4)} токенов`);
    
    // ✅ Новый счётчик потрачено
    const newSpent = tokenSpentNum + costResponse;
    console.log(`📊 Новый счётчик: ${tokenSpentNum} + ${costResponse.toFixed(4)} = ${newSpent.toFixed(4)} токенов`);
    
    // ✅ Проверяем остаток
    const newRemaining = tokenBalanceNum - newSpent;
    console.log(`💰 Остаток после ответа: ${tokenBalanceNum} - ${newSpent.toFixed(4)} = ${newRemaining.toFixed(4)} токенов`);
    
    if (newRemaining < 0) {
      console.warn(`⚠️ ВНИМАНИЕ: Остаток стал отрицательным! ${newRemaining.toFixed(4)}`);
    }
    
    try {
      // ✅ ПИШЕМ новый счётчик в Google Sheet колонку L (11)
      // ✅ Прямое присваивание значения
      sheet.getCell(foundRow, 11).value = newSpent.toFixed(4);
      console.log(`✅ Установили значение в колонку L: ${newSpent.toFixed(4)}`);
      
      // ✅ СОХРАНЯЕМ все изменения в Google Sheet
      await sheet.saveUpdatedCells();
      console.log('✅ Изменения сохранены в Google Sheet');
      
    } catch (e) {
      console.error('❌ Ошибка при записи токенов в Sheet:', e.message);
      console.error('❌ Stack trace:', e.stack);
    }
    
    console.log(`✅ Подсчёт токенов завершён. Новый остаток: ${newRemaining.toFixed(4)}`);

    // ============================================================
    // ШАГ 13: Отправить ответ ИИ в Telegram
    // ============================================================
    
    if (tgToken && tgChatId) {
      try {
        const replyBody = {
          chat_id: tgChatId,
          text: `🤖 ИИ ответил:\n${botText}`,
        };

        if (threadId) replyBody.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replyBody)
        });

        console.log('✅ Ответ ИИ отправлен в Telegram');

      } catch (e) {
        console.error('❌ Ошибка отправки ответа в Telegram:', e.message);
      }
    }

    // ============================================================
    // ШАГ 14: Вернуть ответ виджету и закрыть функцию
    // ============================================================
    
    console.log('📤 Возвращаем ответ виджету...');
    
    return res.status(200).json({
      text: botText,
      aiDisabled: false,
      avatarUrl: avatarUrl || null,
      tokenInfo: {
        spent: newSpent.toFixed(4),
        remaining: newRemaining.toFixed(4),
        balance: tokenBalance
      }
    });

  } catch (error) {
    console.error('❌ Auth Error:', error.message);
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
