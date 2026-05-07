// ============================================================
// ФАЙЛ: api/authentication.js
// ВЕРСИЯ: v3.5 - С FALLBACK НА СТРОКУ 2
// НАЗНАЧЕНИЕ: Если поле клиента пустое — берём из строки 2
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
  console.log('═══════════════════════════════════════');
  console.log('🔵 НАЧАЛО ЗАПРОСА');
  console.log('═══════════════════════════════════════');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ============================================================
    // ШАГ 1: Получаем данные от виджета
    // ============================================================
    console.log('\n📥 ШАГ 1: Данные от виджета');

    const { clientId, sessionId, messages } = req.body;
    console.log(`  🆔 clientId: "${clientId}"`);
    console.log(`  📝 sessionId: "${sessionId}"`);
    console.log(`  💬 Сообщений: ${messages ? messages.length : 0}`);

    if (!clientId || !messages) {
      return res.status(400).json({ error: "clientId и messages обязательны" });
    }

    // ============================================================
    // ШАГ 2: Подключаемся к Google
    // ============================================================
    console.log('\n🔐 ШАГ 2: Авторизация Google');

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
      ],
    });

    // ============================================================
    // ШАГ 3: Загружаем Google Sheet
    // ============================================================
    console.log('\n📊 ШАГ 3: Загружаем Google Sheet');

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle['Authentication'];
    if (!sheet) {
      return res.status(500).json({ error: "Лист Authentication не найден" });
    }

    await sheet.loadCells('A1:Z100');
    console.log(`  ✅ Ячейки загружены`);

    // ============================================================
    // ШАГ 4: Читаем заголовки из строки 1
    // ============================================================
    console.log('\n📋 ШАГ 4: Читаем заголовки');

    const headers = {};
    for (let col = 0; col < sheet.columnCount; col++) {
      const headerCell = sheet.getCell(0, col).value;
      if (headerCell) {
        const key = String(headerCell).toLowerCase().trim();
        headers[key] = col;
        console.log(`  [${col}] "${headerCell}"`);
      }
    }

    // ============================================================
    // ШАГ 5: Ищем клиента
    // ============================================================
    console.log(`\n🔍 ШАГ 5: Ищем клиента "${clientId}"`);

    const clientIdCol = headers['clientid'];
    if (clientIdCol === undefined) {
      return res.status(500).json({ error: "Колонка clientid не найдена" });
    }

    let foundRow = null;
    for (let i = 1; i < Math.min(101, sheet.rowCount); i++) {
      const cellValue = sheet.getCell(i, clientIdCol).value;
      if (cellValue === clientId) {
        foundRow = i;
        console.log(`  ✅ Найден в строке ${i}`);
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    // ============================================================
    // ШАГ 6: Функция чтения с fallback на строку 2
    // ВАЖНО: Строка 2 (индекс 1) — значения по умолчанию
    // Если поле клиента пустое — берём оттуда
    // ============================================================
    const DEFAULT_ROW = 1; // Строка 2 в таблице = индекс 1

    const getByHeader = (headerName) => {
      const lowerName = String(headerName).toLowerCase().trim();
      const col = headers[lowerName];

      if (col === undefined) {
        console.warn(`  ⚠️ Колонка "${headerName}" не найдена`);
        return null;
      }

      // Сначала берём значение из строки клиента
      const clientValue = sheet.getCell(foundRow, col).value;

      if (clientValue) {
        // Значение есть у клиента — используем его
        console.log(`  📖 ${headerName}: "${clientValue}" (из строки клиента)`);
        return clientValue;
      }

      // Значение пустое — берём из строки 2 (по умолчанию)
      const defaultValue = sheet.getCell(DEFAULT_ROW, col).value;
      console.log(`  📖 ${headerName}: пусто → "${defaultValue}" (из строки 2)`);
      return defaultValue;
    };

    // ============================================================
    // ШАГ 7: Читаем данные клиента
    // ============================================================
    console.log('\n📖 ШАГ 7: Читаем данные клиента');

    const status        = getByHeader('status');
    const botName       = getByHeader('bot name');
    const claudeKey     = getByHeader('claudeapikey');
    const googleDocId   = getByHeader('google docid');
    const tgToken       = getByHeader('tgtoken');
    const tgChatId      = getByHeader('tg chatid');
    const avatarUrl     = getByHeader('avatarurl');
    const tokenBalance  = getByHeader('balance');
    const tokenTariff   = getByHeader('price per char');
    let tokenSpent      = getByHeader('spent tokens');

    // ============================================================
    // ШАГ 8: Проверяем обязательные данные
    // ============================================================
    console.log('\n🔐 ШАГ 8: Проверяем данные');

    if (status !== 'active') {
      console.error(`  ❌ Статус: "${status}"`);
      return res.status(403).json({ error: "Агент отключен" });
    }
    console.log(`  ✅ Статус: active`);

    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ Claude не найден" });
    }
    console.log(`  ✅ Claude ключ: есть`);

    // ============================================================
    // ШАГ 9: Firebase — статус ИИ
    // ============================================================
    console.log('\n🔥 ШАГ 9: Firebase — статус ИИ');

    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;
    console.log(`  🤖 ИИ включён: ${aiEnabled}`);

    // ============================================================
    // ШАГ 10: Номер диалога
    // ============================================================
    console.log('\n🔢 ШАГ 10: Номер диалога');

    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();

    if (!dialogNum) {
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;
      await dialogNumRef.set(dialogNum);
      console.log(`  ✅ Новый диалог №${dialogNum}`);
    } else {
      console.log(`  ℹ️ Диалог №${dialogNum}`);
    }

    // ============================================================
    // ШАГ 11: Тема в Telegram
    // ============================================================
    console.log('\n📱 ШАГ 11: Тема в Telegram');

    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
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
          console.log(`  ✅ Тема создана: ${threadId}`);
        } else {
          console.warn(`  ⚠️ Ошибка создания темы: ${topicData.description}`);
        }
      } catch (e) {
        console.error(`  ❌ Ошибка: ${e.message}`);
      }
    } else {
      console.log(`  ℹ️ threadId: ${threadId}`);
    }

   // ============================================================
    // ШАГ 12: Отправляем сообщение в Telegram
    // ВАЖНО: В тексте ОБЯЗАТЕЛЬНО [clientId] и session:
    // Это нужно чтобы менеджер мог сделать Reply юзеру!
    // ============================================================
    console.log('\n📤 ШАГ 12: Отправляем в Telegram');

    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg && lastMsg.role === 'user' ? lastMsg.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        const statusText = aiEnabled ? '🟢 ИИ активен' : '🔴 Менеджер отвечает';

        // Баланс клиента — показываем менеджеру чтобы знал когда заканчивается
        const balanceNum = parseFloat(tokenBalance) || 0;
        const balanceText = tokenBalance ? `💰 Баланс: т.{balanceNum.toFixed(2)}$` : '';

        // ВАЖНО: [${clientId}] и session: нужны для Reply менеджера!
        const tgText = `💬 Диалог #${dialogNum} [${clientId}]\n👤 Юзер: ${userText}\n\n${statusText}${balanceText ? '\n' + balanceText : ''}\nsession: ${sessionId}`;

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

        // Добавляем тему только если есть
        if (threadId) msgBody.message_thread_id = threadId;

        const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody)
        });
        const tgData = await tgRes.json();
        console.log(`  📥 Telegram: ${tgData.ok ? '✅ OK' : '❌ ' + tgData.description}`);

      } catch (e) {
        console.error(`  ❌ Ошибка Telegram: ${e.message}`);
      }
    }

    // Если ИИ выключен — возвращаем null — менеджер ответит вручную
    if (!aiEnabled) {
      console.log('  ⏸️ ИИ выключен — менеджер отвечает');
      return res.status(200).json({
        text: null,
        aiDisabled: true,
        avatarUrl: avatarUrl
      });
    }

    // ============================================================
    // ШАГ 13: Читаем промпт из Google Doc
    // ============================================================
    console.log('\n📄 ШАГ 13: Читаем промпт');

    let systemPrompt = "Ты полезный помощник";

    if (googleDocId) {
      try {
        const docsClient = google.docs({ version: 'v1', auth });
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
        console.error(`  ❌ Ошибка: ${e.message}`);
      }
    }

    // ============================================================
    // ШАГ 14: Очищаем историю для Claude
    // Claude принимает только role и content
    // ============================================================
    console.log('\n📝 ШАГ 14: Готовим историю для Claude');

    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    console.log(`  ✅ ${cleanMessages.length} сообщений`);

    // ============================================================
    // ШАГ 15: Отправляем в Claude AI
    // ============================================================
    console.log('\n🚀 ШАГ 15: Отправляем в Claude');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Быстрая и дешёвая модель
        max_tokens: 1024,
        system: systemPrompt,
        messages: cleanMessages
      })
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error(`  ❌ Claude ошибка: ${claudeData.error?.message}`);
      return res.status(claudeResponse.status).json({
        error: "Ошибка Claude API",
        details: claudeData
      });
    }

    const botText = claudeData.content[0].text;
    console.log(`  ✅ Claude ответил (${botText.length} символов)`);

    // ============================================================
    // ШАГ 16: Считаем токены
    // ============================================================
    console.log('\n💰 ШАГ 16: Токены');

    const tokenBalanceNum = parseFloat(tokenBalance) || 0;
    const tokenTariffNum = parseFloat(tokenTariff) || 0;
    const tokenSpentNum = parseFloat(tokenSpent) || 0;
    const costResponse = botText.length * tokenTariffNum;
    const newSpent = tokenSpentNum + costResponse;
    const newRemaining = tokenBalanceNum - newSpent;

    console.log(`  📊 Потрачено: ${newSpent.toFixed(4)}, Остаток: ${newRemaining.toFixed(4)}`);

    try {
      const spentCol = headers['spent tokens'];
      const balanceCol = headers['balance'];

      if (spentCol !== undefined) {
        sheet.getCell(foundRow, spentCol).value = newSpent.toFixed(4);
      }
      if (balanceCol !== undefined) {
        sheet.getCell(foundRow, balanceCol).value = newRemaining.toFixed(4);
      }
      await sheet.saveUpdatedCells();
      console.log(`  ✅ Токены сохранены`);
    } catch (e) {
      console.error(`  ❌ Ошибка сохранения токенов: ${e.message}`);
    }

    // ============================================================
    // ШАГ 17: Отправляем ответ ИИ в Telegram
    // ============================================================
    console.log('\n📤 ШАГ 17: Ответ ИИ в Telegram');

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
        console.log(`  ✅ Ответ отправлен`);
      } catch (e) {
        console.error(`  ❌ Ошибка: ${e.message}`);
      }
    }

    // ============================================================
    // ШАГ 18: Возвращаем ответ виджету
    // ============================================================
    console.log('\n═══════════════════════════════════════');
    console.log('✅ ЗАПРОС УСПЕШНО ОБРАБОТАН');
    console.log('═══════════════════════════════════════\n');

    return res.status(200).json({
      text: botText,
      aiDisabled: false,
      avatarUrl: avatarUrl || null,
      tokenInfo: {
        spent: newSpent.toFixed(4),
        remaining: newRemaining.toFixed(4),
        balance: tokenBalanceNum
      }
    });

  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
