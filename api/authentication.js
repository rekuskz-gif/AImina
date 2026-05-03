// ============================================================
// ФАЙЛ: api/authentication.js
// ВЕРСИЯ: v3.4 - ИСПРАВЛЕННЫЙ, БЕЗ ДУБЛИРОВАНИЯ
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
  
  console.log('═════════════════════════════════════════════════════');
  console.log('🔵 НАЧАЛО ЗАПРОСА');
  console.log('═════════════════════════════════════════════════════');
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('⚙️ CORS preflight запрос');
    return res.status(200).end();
  }

  try {
    // ============================================================
    // ШАГ 2: Получить данные от widget
    // ============================================================
    
    console.log('\n📥 ШАГ 2: Получаем данные от widget');
    
    const { clientId, sessionId, messages } = req.body;
    
    console.log(`  🆔 clientId: "${clientId}"`);
    console.log(`  📝 sessionId: "${sessionId}"`);
    console.log(`  💬 Сообщений в истории: ${messages ? messages.length : 0}`);

    if (!clientId || !messages) {
      console.error('❌ Ошибка: отсутствуют обязательные данные');
      return res.status(400).json({ 
        error: "clientId и messages обязательны",
        received: { clientId, messages: messages ? 'OK' : 'missing' }
      });
    }

    // ============================================================
    // ШАГ 3: Загрузить конфиг клиента из Google Sheet
    // ============================================================
    
    console.log('\n📊 ШАГ 3: Загружаем Google Sheet');

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
      ],
    });

    console.log(`  🔐 JWT инициализирован`);

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    console.log(`  📄 Загружаем документ: ${process.env.GOOGLE_SHEET_ID}`);
    
    await doc.loadInfo();
    console.log(`  ✅ Документ загружен`);
    console.log(`  📋 Листы: ${Object.keys(doc.sheetsByTitle).join(', ')}`);
    
    const sheet = doc.sheetsByTitle['Authentication'];
    if (!sheet) {
      console.error('❌ Лист "Authentication" не найден!');
      console.error(`  📋 Доступные листы: ${Object.keys(doc.sheetsByTitle).join(', ')}`);
      return res.status(500).json({ error: "Таблица повреждена" });
    }

    console.log(`  ✅ Лист "Authentication" найден`);
    console.log(`  📏 Размер: ${sheet.rowCount} строк × ${sheet.columnCount} колонок`);

    await sheet.loadCells('A1:Z100');
    console.log(`  ✅ Ячейки загружены (первые 100 строк)`);

    // ============================================================
    // ЧИТАЕМ ЗАГОЛОВКИ ИЗ СТРОКИ 1
    // ============================================================
    
    console.log('\n📋 Читаем заголовки (строка 1):');
    console.log(`  📏 Максимально колонок в таблице: ${sheet.columnCount}`);
    
    const headers = {};
    for (let col = 0; col < sheet.columnCount; col++) {
      const headerCell = sheet.getCell(0, col).value;
      if (headerCell) {
        const headerKey = String(headerCell).toLowerCase().trim();
        headers[headerKey] = col;
        console.log(`  [${col}] "${headerCell}" → "${headerKey}"`);
      }
    }
    console.log(`\n✅ Всего заголовков: ${Object.keys(headers).length}`);

    // ============================================================
    // ИЩЕМ КЛИЕНТА В ПЕРВЫХ 100 СТРОКАХ
    // ============================================================
    
    console.log(`\n🔍 ШАГ 3b: Ищем клиента "${clientId}"`);
    
    let foundRow = null;
    const clientIdCol = headers['clientid'];

    if (clientIdCol === undefined) {
      console.error(`❌ ОШИБКА: Колонка 'clientid' не найдена!`);
      console.error(`📋 Доступные ключи: ${Object.keys(headers).join(', ')}`);
      return res.status(500).json({ 
        error: "Колонка clientid не найдена",
        availableHeaders: Object.keys(headers)
      });
    }

    console.log(`  ✅ Колонка clientId в позиции ${clientIdCol}`);
    console.log(`  🔎 Ищем во ВСЕХ строках от 1 до 100:\n`);

    for (let i = 1; i < Math.min(101, sheet.rowCount); i++) {
      const cellValue = sheet.getCell(i, clientIdCol).value;
      const match = cellValue === clientId;
      
      if (match || i <= 20) {
        console.log(`    Строка ${i}: "${cellValue}" ${match ? '✅✅✅ НАЙДЕН!' : ''}`);
      }
      
      if (match) {
        foundRow = i;
        console.log(`\n  🎯 КЛИЕНТ "${clientId}" НАЙДЕН В СТРОКЕ ${i}!`);
        break;
      }
    }

    if (foundRow === null) {
      console.error(`\n❌ Клиент "${clientId}" не найден в первых 100 строках!`);
      return res.status(404).json({ 
        error: `Клиент ${clientId} не найден`,
        searchedColumn: clientIdCol,
        searchedRows: '1-100'
      });
    }

    console.log(`\n✅ Готовим данные из строки ${foundRow}`);

    // ============================================================
    // ФУНКЦИЯ ЧТЕНИЯ ПО НАЗВАНИЮ КОЛОНКИ
    // ============================================================
    
    const getByHeader = (headerName) => {
      const lowerName = String(headerName).toLowerCase().trim();
      const col = headers[lowerName];
      
      if (col === undefined) {
        console.warn(`  ⚠️ Колонка "${headerName}" не найдена`);
        return null;
      }
      
      if (col >= sheet.columnCount) {
        console.error(`  ❌ Колонка ${col} выходит за границы (макс ${sheet.columnCount})`);
        return null;
      }
      
      const value = sheet.getCell(foundRow, col).value;
      console.log(`  📖 ${headerName} (col ${col}): ${value}`);
      return value;
    };

    // ============================================================
    // ЧИТАЕМ ДАННЫЕ КЛИЕНТА
    // ============================================================
    
    console.log(`\n📖 Читаем данные клиента:`);
    
    const status = getByHeader('status');
    const botName = getByHeader('bot name');
    const claudeKey = getByHeader('claudeapikey');
    const googleDocId = getByHeader('google docid');
    const tgToken = getByHeader('tgtoken');
    const tgChatId = getByHeader('tg chatid');
    const avatarUrl = getByHeader('avatarurl');
    const tokenBalance = getByHeader('баланс/токены');
    const tokenTariff = getByHeader('цена 1 символа');
    let tokenSpent = getByHeader('потрачено токенов');

    console.log(`\n✅ Данные загружены`);

    // ============================================================
    // ПРОВЕРКА ОБЯЗАТЕЛЬНЫХ ДАННЫХ
    // ============================================================
    
    console.log(`\n🔐 Проверяем обязательные данные:`);
    
    if (status !== 'active') {
      console.error(`  ❌ Status неправильный: "${status}" !== "active"`);
      return res.status(403).json({ 
        error: "Агент отключен",
        actualStatus: status
      });
    }
    console.log(`  ✅ Status: active`);

    if (!claudeKey) {
      console.error(`  ❌ Claude API ключ не найден!`);
      return res.status(500).json({ error: "API ключ Claude не найден" });
    }
    console.log(`  ✅ Claude API ключ: есть`);

    // ============================================================
    // ШАГ 4: Firebase - проверить ИИ включен
    // ============================================================

    console.log(`\n🔥 ШАГ 4: Firebase - проверяем статус ИИ`);
    
    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    console.log(`  📍 Firebase путь: settings/${clientId}/${sessionId}/aiEnabled`);
    
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;
    
    console.log(`  🤖 ИИ включен: ${aiEnabled}`);

    // ============================================================
    // ШАГ 5: Создать номер диалога
    // ============================================================
    
    console.log(`\n🔢 ШАГ 5: Создаем номер диалога`);
    
    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();

    if (!dialogNum) {
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;
      await dialogNumRef.set(dialogNum);
      console.log(`  ✅ Новый диалог: №${dialogNum}`);
    } else {
      console.log(`  ℹ️ Существующий диалог: №${dialogNum}`);
    }

    // ============================================================
    // ШАГ 6: Создать тему в Telegram
    // ============================================================
    
    console.log(`\n📱 ШАГ 6: Создаем тему в Telegram`);
    
    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
        console.log(`  🔗 Отправляем запрос к Telegram API...`);
        const topicRes = await fetch(`https://api.telegram.org/bot${tgToken}/createForumTopic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            name: `Диалог #${dialogNum} [${clientId}]`,
          })
        });
        
        const topicData = await topicRes.json();
        console.log(`  📥 Ответ Telegram: ${topicData.ok ? '✅' : '❌'}`);
        
        if (topicData.ok) {
          threadId = topicData.result.message_thread_id;
          await threadIdRef.set(threadId);
          console.log(`  ✅ Тема создана: ${threadId}`);
        } else {
          console.warn(`  ⚠️ Telegram вернул ошибку: ${topicData.description}`);
        }
      } catch (e) {
        console.error(`  ❌ Ошибка Telegram: ${e.message}`);
      }
    } else {
      console.log(`  ℹ️ Тема уже существует или нет Telegram токена`);
    }

    // ============================================================
    // ШАГ 7: Отправить ПОЛНЫЙ ДИАЛОГ в Telegram
    // ============================================================
    
    console.log(`\n📤 ШАГ 7: Отправляем диалог в Telegram`);
    
    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg && lastMsg.role === 'user' ? lastMsg.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        console.log(`  📝 Форматируем диалог (${messages.length} сообщений)...`);

        let dialogText = '';
        messages.forEach((msg, idx) => {
          if (msg.role === 'user') {
            dialogText += `👤 Юзер: ${msg.content}\n`;
          } else if (msg.role === 'assistant') {
            dialogText += `🤖 Амина: ${msg.content}\n`;
          }
        });

        const statusText = !aiEnabled ? `🔴 ИИ ВЫК. Отвечай через Reply!` : `🟢 ИИ активен`;
        const tgText = `💬 Диалог #${dialogNum} [${clientId}]\n\n${dialogText}\n${statusText}\nsession: ${sessionId}`;

        console.log(`  📊 Размер сообщения: ${tgText.length} символов`);

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

        console.log(`  🔗 Отправляем в Telegram...`);
        const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody)
        });

        const tgData = await tgRes.json();
        console.log(`  📥 Ответ Telegram: ${tgData.ok ? '✅ OK' : '❌ ОШИБКА'}`);

        if (!aiEnabled) {
          console.log(`  ⏸️ ИИ выключен - возвращаем null`);
          return res.status(200).json({
            text: null,
            aiDisabled: true,
            avatarUrl: avatarUrl
          });
        }

      } catch (e) {
        console.error(`  ❌ Ошибка Telegram: ${e.message}`);
      }
    } else {
      console.log(`  ⚠️ Нет Telegram токена или сообщения`);
    }

    // ============================================================
    // ШАГ 9: Читаем промпт из Google Doc
    // ============================================================
    
    console.log(`\n📄 ШАГ 9: Читаем промпт из Google Doc`);
    
    let systemPrompt = "Ты полезный помощник";

    if (googleDocId) {
      try {
        console.log(`  🔗 Google Doc ID: ${googleDocId.substring(0, 20)}...`);
        const docsClient = google.docs({ version: 'v1', auth });
        
        console.log(`  📥 Загружаем документ...`);
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')
            .join(''))
          .join('')
          .trim();

        console.log(`  ✅ Промпт загружен (${systemPrompt.length} символов)`);

      } catch (e) {
        console.error(`  ❌ Ошибка Google Doc: ${e.message}`);
      }
    } else {
      console.log(`  ⚠️ Google Doc ID не найден`);
    }

    // ============================================================
    // ШАГ 10: Очистить историю для Claude
    // ============================================================
    
    console.log(`\n📝 ШАГ 10: Готовим историю для Claude`);
    
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    console.log(`  ✅ История очищена (${cleanMessages.length} сообщений)`);

    // ============================================================
    // ШАГ 11: Отправить в Claude AI
    // ============================================================
    
    console.log(`\n🚀 ШАГ 11: Отправляем в Claude API`);
    
    console.log(`  🔐 Claude ключ: ${claudeKey.substring(0, 10)}...`);
    console.log(`  📊 Model: claude-haiku-4-5-20251001`);
    console.log(`  📝 Max tokens: 1024`);
    console.log(`  💬 Сообщений: ${cleanMessages.length}`);

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

    console.log(`  📥 Статус Claude: ${claudeResponse.status}`);

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error(`  ❌ Claude ошибка: ${claudeData.error?.message || 'unknown'}`);
      return res.status(claudeResponse.status).json({
        error: "Ошибка Claude API",
        details: claudeData
      });
    }

    const botText = claudeData.content[0].text;
    console.log(`  ✅ Claude ответил (${botText.length} символов)`);

    // ============================================================
    // ШАГ 12: Подсчитать и записать токены
    // ============================================================
    
    console.log(`\n💰 ШАГ 12: Подсчитываем токены`);
    
    const tokenBalanceNum = parseFloat(tokenBalance) || 0;
    const tokenTariffNum = parseFloat(tokenTariff) || 0;
    const tokenSpentNum = parseFloat(tokenSpent) || 0;
    
    console.log(`  💾 До: баланс=${tokenBalanceNum}, тариф=${tokenTariffNum}, потрачено=${tokenSpentNum}`);
    
    const responseChars = botText.length;
    const costResponse = responseChars * tokenTariffNum;
    const newSpent = tokenSpentNum + costResponse;
    const newRemaining = tokenBalanceNum - newSpent;
    
    console.log(`  📝 Ответ: ${responseChars} символов × ${tokenTariffNum} = ${costResponse.toFixed(4)}`);
    console.log(`  📊 После: потрачено=${newSpent.toFixed(4)}, остаток=${newRemaining.toFixed(4)}`);

    try {
      const tokenSpentCol = headers['потрачено токенов'];
      if (tokenSpentCol !== undefined) {
        sheet.getCell(foundRow, tokenSpentCol).value = newSpent.toFixed(4);
        console.log(`  🔗 Записываем в колонку ${tokenSpentCol}...`);
        await sheet.saveUpdatedCells();
        console.log(`  ✅ Токены сохранены в Google Sheet`);
      } else {
        console.warn(`  ⚠️ Колонка "потрачено токенов" не найдена`);
      }
    } catch (e) {
      console.error(`  ❌ Ошибка при сохранении токенов: ${e.message}`);
    }

    // ============================================================
    // ШАГ 13: Отправить ответ в Telegram
    // ============================================================
    
    console.log(`\n📤 ШАГ 13: Отправляем ответ в Telegram`);
    
    if (tgToken && tgChatId) {
      try {
        console.log(`  📝 Размер ответа: ${botText.length} символов`);
        const replyBody = {
          chat_id: tgChatId,
          text: `🤖 ИИ ответил:\n${botText}`,
        };

        if (threadId) replyBody.message_thread_id = threadId;

        console.log(`  🔗 Отправляем в Telegram...`);
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replyBody)
        });

        console.log(`  ✅ Ответ отправлен в Telegram`);

      } catch (e) {
        console.error(`  ❌ Ошибка Telegram: ${e.message}`);
      }
    }

    // ============================================================
    // ШАГ 14: Вернуть ответ виджету
    // ============================================================
    
    console.log(`\n📤 ШАГ 14: Возвращаем ответ виджету`);
    console.log(`  ✅ Текст: ${botText.substring(0, 50)}...`);
    console.log(`  💾 Token info: spent=${newSpent.toFixed(4)}, remaining=${newRemaining.toFixed(4)}`);
    
    console.log('\n═════════════════════════════════════════════════════');
    console.log('✅ ЗАПРОС УСПЕШНО ОБРАБОТАН');
    console.log('═════════════════════════════════════════════════════\n');
    
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
    console.error('\n❌ ===== КРИТИЧЕСКАЯ ОШИБКА =====');
    console.error(`📛 Сообщение: ${error.message}`);
    console.error(`📍 Stack: ${error.stack}`);
    console.error('════════════════════════════════\n');
    
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
