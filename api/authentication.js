// ============================================================
// ФАЙЛ: api/authentication.js
// НАЗНАЧЕНИЕ: Главный API — обрабатывает сообщения юзера
// 1. Читает конфиг клиента из Google Sheets
// 2. Отправляет в Telegram (если включено)
// 3. Генерирует ответ через Claude AI
// 4. Возвращает ответ виджету
// ============================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// ============================================================
// БЛОК 1: Инициализация Firebase Admin SDK
// НАЗНАЧЕНИЕ: Подключаемся к Firebase для чтения/записи истории
// и управления статусом ИИ (включён/выключен)
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
  // БЛОК 2: CORS заголовки
  // НАЗНАЧЕНИЕ: Разрешить запросы с любых сайтов
  // ============================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ============================================================
    // БЛОК 3: Получаем данные от виджета
    // clientId — ID клиента (например mina_001)
    // sessionId — уникальный ID браузера юзера
    // messages — история переписки
    // ============================================================
    const { clientId, sessionId, messages } = req.body;
    console.log('🔵 clientId:', clientId, 'sessionId:', sessionId);

    if (!clientId || !messages) {
      return res.status(400).json({ error: "clientId и messages обязательны" });
    }

    // ============================================================
    // БЛОК 4: Авторизация в Google Cloud
    // НАЗНАЧЕНИЕ: Подключаемся к Google Sheets и Google Docs
    // ============================================================
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
      ],
    });

    // ============================================================
    // БЛОК 5: Загружаем конфиг клиента из Google Sheets
    // ============================================================
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Authentication'];
    await sheet.loadCells();

    console.log('📊 Читаем таблицу...');

    // Строка 2 (индекс 1) — значения по умолчанию
    const defaultRow = 1;
    let foundRow = null;

    // Ищем строку клиента по clientId в колонке A
    for (let i = 0; i < sheet.rowCount; i++) {
      const val = sheet.getCell(i, 0).value;
      if (val === clientId) {
        foundRow = i;
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ error: "Клиент не найден в таблице" });
    }

    console.log(`✅ Клиент найден в строке ${foundRow}`);

    // Если поле пустое — берём из строки по умолчанию
    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // ============================================================
    // БЛОК 6: Читаем данные клиента
    // A(0)=clientId B(1) C(2) D(3)=googleDocId E(4)=claudeKey
    // F(5)=tgToken G(6)=tgChatId H(7)=status I(8)=avatarUrl
    // ============================================================
    const status      = get(7); // H — статус (active/inactive)
    const claudeKey   = get(4); // E — API ключ Claude
    const googleDocId = get(3); // D — ID Google Doc с промптом
    const avatarUrl   = get(8); // I — ссылка на аватарку
    const tgToken     = get(5); // F — токен Telegram бота
    const tgChatId    = get(6); // G — ID Telegram группы

    console.log('📋 Данные клиента загружены');

    // ============================================================
    // БЛОК 7: Проверяем что клиент активен
    // ============================================================
    if (status !== 'active') {
      console.log('❌ Клиент не активен');
      return res.status(403).json({ error: "Агент не активен" });
    }

    if (!claudeKey) {
      console.log('❌ API ключ Claude не найден');
      return res.status(500).json({ error: "API ключ не найден" });
    }

    // ============================================================
    // БЛОК 8: Получаем статус ИИ из Firebase
    // По умолчанию ИИ включён (true)
    // ============================================================
    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;
    console.log('🤖 aiEnabled:', aiEnabled);

    // ============================================================
    // БЛОК 9: Получаем номер диалога
    // НАЗНАЧЕНИЕ: Каждому диалогу даём уникальный номер
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
      console.log('🔢 Создан диалог №' + dialogNum);
    }

    // ============================================================
    // БЛОК 10: Создаём или получаем тему в Telegram
    // НАЗНАЧЕНИЕ: Каждый юзер имеет свою тему в группе
    // ============================================================
    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
        console.log('📱 Создаём новую тему в Telegram...');
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
          console.log('✅ Создана тема:', threadId);
        } else {
          console.error('❌ Ошибка создания темы:', JSON.stringify(topicData));
          threadId = null; // Без темы — General
        }
      } catch (e) {
        console.error('❌ Ошибка создания темы:', e.message);
        threadId = null;
      }
    }

    console.log('💬 threadId:', threadId);

    // ============================================================
    // БЛОК 11: Отправляем сообщение юзера в Telegram
    // ВАЖНО: В тексте ОБЯЗАТЕЛЬНО должен быть [clientId] и session:
    // Это нужно чтобы менеджер мог сделать Reply и ответить юзеру
    // ============================================================
    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage && lastMessage.role === 'user' ? lastMessage.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        const statusText = aiEnabled ? '🟢 ИИ активен' : '🔴 Менеджер отвечает';

        // ВАЖНО: [${clientId}] и session: нужны для парсинга Reply!
        const tgText = `💬 Диалог #${dialogNum} [${clientId}]\n👤 Юзер: ${userText}\n\n${statusText}\nsession: ${sessionId}`;

        const keyboard = aiEnabled ? [[
          { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]] : [[
          { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]];

        // Собираем тело запроса
        const msgBody = {
          chat_id: tgChatId,
          text: tgText,
          reply_markup: { inline_keyboard: keyboard }
        };

        // Добавляем threadId только если есть тема
        if (threadId) msgBody.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody)
        });
        console.log('✅ Сообщение отправлено в Telegram');
      } catch (e) {
        console.error('❌ Ошибка отправки в Telegram:', e.message);
      }
    }

    // ============================================================
    // БЛОК 12: Если ИИ выключен — не отвечаем
    // Менеджер ответит вручную через Telegram Reply
    // ============================================================
    if (!aiEnabled) {
      console.log('⏸️ ИИ выключен — менеджер отвечает вручную');
      return res.status(200).json({
        text: null,
        aiDisabled: true,
        avatarUrl: avatarUrl
      });
    }

    // ============================================================
    // БЛОК 13: Читаем промпт из Google Doc
    // НАЗНАЧЕНИЕ: Инструкции для Claude как себя вести
    // ============================================================
    let systemPrompt = "Ты полезный ИИ ассистент";

    if (googleDocId) {
      try {
        console.log('📄 Загружаем промпт из Google Doc...');
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')
            .join(''))
          .join('')
          .trim();
        console.log('✅ Промпт загружен, длина:', systemPrompt.length);
      } catch (e) {
        console.error('❌ Ошибка чтения промпта:', e.message);
      }
    }

    // ============================================================
    // БЛОК 14: Очищаем историю перед отправкой в Claude
    // Claude принимает только role и content — убираем fromManager
    // ============================================================
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // ============================================================
    // БЛОК 15: Отправляем запрос в Claude AI
    // ============================================================
    console.log('🚀 Отправляем в Claude...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Быстрая и дешёвая модель
        max_tokens: 1024,                    // Максимум символов в ответе
        system: systemPrompt,               // Инструкции для Claude
        messages: cleanMessages             // История переписки
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Ошибка Claude:', data);
      return res.status(response.status).json({
        error: "Ошибка Claude API",
        details: data
      });
    }

    const botText = data.content[0].text;
    console.log('✅ Claude ответил');

    // ============================================================
    // БЛОК 16: Отправляем ответ ИИ в Telegram
    // ============================================================
    if (tgToken && tgChatId) {
      try {
        const replyBody = {
          chat_id: tgChatId,
          text: `🤖 ИИ ответил:\n${botText}`,
        };

        // Добавляем threadId только если есть тема
        if (threadId) replyBody.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replyBody)
        });
        console.log('✅ Ответ отправлен в Telegram');
      } catch (e) {
        console.error('❌ Ошибка отправки ответа:', e.message);
      }
    }

    // ============================================================
    // БЛОК 17: Возвращаем ответ виджету на сайте
    // ============================================================
    return res.status(200).json({
      text: botText,
      aiDisabled: false,
      avatarUrl: avatarUrl || null
    });

  } catch (error) {
    console.error('❌ Auth Error:', error.message);
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
