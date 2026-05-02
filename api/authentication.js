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
// 7. Сохраняет всё в Firebase
// 
// ПОЛУЧАЕТ от widget.js:
// {
//   "clientId": "mina_001",
//   "sessionId": "user_abc123_1609459200000",
//   "messages": [
//     { "role": "user", "content": "Привет!" },
//     ...
//   ]
// }
// 
// ОТПРАВЛЯЕТ widget.js:
// {
//   "text": "Привет! Чем помочь?",  (или null если ИИ выключен)
//   "aiDisabled": false,
//   "avatarUrl": "https://..."
// }
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
    const defaultRow = 1;
    let foundRow = null;

    for (let i = 0; i < sheet.rowCount; i++) {
      if (sheet.getCell(i, 0).value === clientId) {
        foundRow = i;
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // === Прочитать данные клиента ===
    // A(0)=clientId B(1) C(2) D(3)=googleDocId E(4)=claudeKey
    // F(5)=tgToken G(6)=tgChatId H(7)=status I(8)=avatarUrl
    const status = get(7);           // Статус (active/inactive)
    const claudeKey = get(4);        // API ключ Claude
    const googleDocId = get(3);      // Google Doc с промптом
    const tgToken = get(5);          // Telegram токен
    const tgChatId = get(6);         // Telegram группа ID
    const avatarUrl = get(8);        // Аватарка

    console.log(`✅ Клиент найден в строке ${foundRow}`);

    // === Проверка обязательных данных ===
    if (status !== 'active') {
      return res.status(403).json({ error: "Агент отключен" });
    }

    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ Claude не найден" });
    }


// ============================================================
    // ШАГ 3.5: Получить информацию о токенах из Google Sheet
    // ============================================================
    
    console.log('💰 Читаем информацию о токенах...');
    
    const tokenBalance = get(9);        // J: Баланс (куплено токенов)
    const tokenTariff = get(10);        // K: Тариф (цена за 1 символ)
    let tokenSpent = get(11);           // L: Потрачено токенов
    const resetDate = get(12);          // M: Дата скидания (когда обнулить)
    
    console.log(`💰 Токены: баланс=${tokenBalance}, тариф=${tokenTariff}, потрачено=${tokenSpent}, дата скидания=${resetDate}`);

    

   // ============================================================
    // ШАГ 3.6: Проверить дату скидания и обнулить если нужно
    // ============================================================
    
    console.log('🔄 Проверяем дату скидания...');
    
    const today = new Date();
    
    // ✅ Преобразуем дату из формата "01.06.2026" в "2026-06-01"
    let resetDateFormatted = '';
    if (resetDate && resetDate.includes('.')) {
      const parts = resetDate.split('.');  // ["01", "06", "2026"]
      resetDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;  // "2026-06-01"
      console.log(`📅 Дата скидания парсена: ${resetDate} → ${resetDateFormatted}`);
    } else {
      resetDateFormatted = resetDate;
      console.log(`📅 Дата скидания (формат ISO): ${resetDateFormatted}`);
    }
    
    const reset = new Date(resetDateFormatted);
    
    console.log(`📅 Сегодня: ${today.toLocaleDateString('ru-RU')}, Дата скидания: ${reset.toLocaleDateString('ru-RU')}`);
    
    // Проверяем: наступила ли дата скидания?
    if (today >= reset) {
      console.log('🔄 Дата скидания наступила - обнуляем токены');
      
      try {
        // ✅ ПИШЕМ 0 в колонку L (потрачено = 0)
        await sheet.getCell(foundRow, 11).setValue(0);
        console.log('✅ Потрачено обнулено (L = 0)');
        
        // ✅ ВЫЧИСЛЯЕМ новую дату (через месяц)
        const nextReset = new Date(reset);
        nextReset.setMonth(nextReset.getMonth() + 1);
        const newResetDate = nextReset.toLocaleDateString('ru-RU');  // формат "01.07.2026"
        
        console.log(`📅 Новая дата скидания: ${newResetDate}`);
        
        // ✅ ПИШЕМ новую дату в колонку M
        await sheet.getCell(foundRow, 12).setValue(newResetDate);
        console.log(`✅ Дата обновлена в M (${newResetDate})`);
        
        // ✅ СОХРАНЯЕМ изменения в Google Sheet
        await sheet.saveUpdatedCells();
        console.log('✅ Изменения сохранены в Google Sheet');
        
        // ✅ ОБНОВЛЯЕМ переменную
        tokenSpent = 0;
        
        console.log(`✅ Успешно! Токены обнулены. Новая дата скидания: ${newResetDate}`);
        
      } catch (e) {
        console.error('❌ Ошибка при обнулении токенов:', e.message);
        // Продолжаем работу, даже если ошибка при записи в Sheet
      }
    } else {
      console.log('✅ Дата скидания ещё не наступила');
    }

    // ============================================================
    // ШАГ 3.7: Проверить достаточно ли токенов
    // ============================================================
    
    const remaining = tokenBalance - tokenSpent;
    
    console.log(`💰 Расчёт остатка: ${tokenBalance} - ${tokenSpent} = ${remaining} токенов`);
    
    if (remaining < 0) {
      console.log(`⚠️ Остаток отрицательный! Токены закончились (остаток: ${remaining})`);
    } else if (remaining === 0) {
      console.log(`⚠️ Токены полностью использованы (остаток: 0)`);
    } else {
      console.log(`✅ Достаточно токенов (осталось: ${remaining})`);
    }
    
    // Если токенов нет - блокируем запрос
    if (remaining <= 0) {
      console.log('❌ ЗАПРОС ЗАБЛОКИРОВАН: Токены закончились!');
      return res.status(403).json({ 
        error: "Токены закончились",
        details: {
          balance: tokenBalance,
          spent: tokenSpent,
          remaining: remaining,
          resetDate: resetDate,
          message: `Баланс: ${tokenBalance}, Потрачено: ${tokenSpent}, Осталось: ${remaining}. Пополните баланс или дождитесь даты скидания (${resetDate})`
        }
      });
    }

    console.log(`✅ Проверка токенов пройдена успешно. Остаток: ${remaining}`);

    
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
    // ШАГ 12: НОВОЕ - Подсчитать и вычесть токены
    // ============================================================
    
    console.log('💰 Подсчитываем потраченные токены...');
    
    // ✅ Считаем символы в ответе ИИ
    const responseChars = botText.length;
    console.log(`📝 Символов в ответе ИИ: ${responseChars}`);
    
    // ✅ Считаем стоимость ответа
    const costResponse = responseChars * tokenTariff;
    console.log(`💸 Стоимость ответа: ${responseChars} символов × ${tokenTariff} = ${costResponse.toFixed(4)} токенов`);
    
    // ✅ Новый счётчик потрачено
    const newSpent = tokenSpent + costResponse;
    console.log(`📊 Новый счётчик: ${tokenSpent} + ${costResponse.toFixed(4)} = ${newSpent.toFixed(4)} токенов`);
    
    // ✅ Проверяем что не превышаем баланс
    const newRemaining = tokenBalance - newSpent;
    console.log(`💰 Остаток после ответа: ${tokenBalance} - ${newSpent.toFixed(4)} = ${newRemaining.toFixed(4)} токенов`);
    
    if (newRemaining < 0) {
      console.warn(`⚠️ ВНИМАНИЕ: Остаток стал отрицательным! ${newRemaining.toFixed(4)}`);
    }
    
    try {
      // ✅ ПИШЕМ новый счётчик в Google Sheet колонку L
      await sheet.getCell(foundRow, 11).setValue(newSpent.toFixed(4));
      console.log(`✅ Обновили колонку L (потрачено = ${newSpent.toFixed(4)})`);
      
      // ✅ СОХРАНЯЕМ изменения в Google Sheet
      await sheet.saveUpdatedCells();
      console.log('✅ Изменения сохранены в Google Sheet');
      
    } catch (e) {
      console.error('❌ Ошибка при записи токенов в Sheet:', e.message);
    }
    
    console.log(`✅ Успешно! Токены вычтены. Остаток: ${newRemaining.toFixed(4)}`);

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
