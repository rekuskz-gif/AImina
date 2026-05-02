// ============================================================
// ФАЙЛ: api/authentication.js
// НАЗНАЧЕНИЕ: Главный файл — обрабатывает сообщения от юзера,
// читает настройки из Google Sheets, отправляет в Телеграм,
// и генерирует ответ через Claude AI
// ВАЖНО: Для каждого юзера создаётся отдельная тема в Телеграм группе
// Тема хранится в Firebase — settings/clientId/sessionId/threadId
// ============================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// Инициализация Firebase Admin — нужен для чтения/записи истории
// и управления статусом ИИ (включён/выключен)
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
  // Разрешаем запросы с любых сайтов (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обрабатываем preflight запрос браузера
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Получаем данные от виджета:
    // clientId — ID клиента (например mina_001)
    // sessionId — уникальный ID браузера юзера
    // messages — история переписки
    const { clientId, sessionId, messages } = req.body;
    console.log('🔵 clientId:', clientId, 'sessionId:', sessionId);

    if (!clientId || !messages) {
      return res.status(400).json({ error: "clientId и messages обязательны" });
    }

    // Авторизация в Google — нужна для чтения таблицы и Google Doc
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',       // Доступ к таблице
        'https://www.googleapis.com/auth/documents.readonly'  // Доступ к промпту
      ],
    });

    // Открываем Google таблицу и лист Authentication
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Authentication'];
    await sheet.loadCells();

    // Строка 2 (индекс 1) — значения по умолчанию
    // Если у клиента поле пустое — берём оттуда
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
      return res.status(404).json({ error: "Клиент не найден" });
    }

    // Если поле клиента пустое — берём из строки по умолчанию
    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // Читаем данные клиента из таблицы:
    const status      = get(7); // H — статус (active/inactive)
    const claudeKey   = get(4); // E — API ключ Claude
    const googleDocId = get(3); // D — ID Google Doc с промптом
    const avatarUrl   = get(8); // I — ссылка на аватарку бота
    const tgToken     = get(5); // F — токен Телеграм бота
    const tgChatId    = get(6); // G — ID Телеграм группы

    // Проверяем что клиент активен
    if (status !== 'active') {
      return res.status(403).json({ error: "Агент не активен" });
    }

    // Проверяем наличие API ключа Claude
    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ не найден" });
    }

    const db = admin.database();

    // Читаем статус ИИ из Firebase
    // По умолчанию ИИ включён (true)
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;
    console.log('🤖 aiEnabled:', aiEnabled);

    // Читаем номер диалога — показываем в Телеграм
    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();
    if (!dialogNum) {
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;
      await dialogNumRef.set(dialogNum);
    }

    // Читаем или создаём тему в Телеграм для этого юзера
    // Каждый юзер имеет свою тему в группе — чтобы не путаться
    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
        // Создаём новую тему в Телеграм группе
        // Название темы — номер диалога и sessionId
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
          // Сохраняем ID темы в Firebase
          threadId = topicData.result.message_thread_id;
          await threadIdRef.set(threadId);
          console.log('✅ Создана тема:', threadId);
        } else {
          console.error('❌ Ошибка создания темы:', JSON.stringify(topicData));
          threadId = 1; // Fallback — General тема
        }
      } catch (e) {
        console.error('❌ Ошибка создания темы:', e.message);
        threadId = 1;
      }
    }

    console.log('💬 threadId:', threadId);

    // Берём последнее сообщение юзера для отправки в Телеграм
    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage && lastMessage.role === 'user' ? lastMessage.content : null;

    // Отправляем сообщение юзера в его тему в Телеграм группе
    if (tgToken && tgChatId && userText) {
      try {
        const statusText = aiEnabled ? '🟢 ИИ активен' : '🔴 Менеджер отвечает';
        const tgText = `👤 Юзер: ${userText}\n\n${statusText}\nsession: ${sessionId}`;

        // Кнопки зависят от текущего статуса ИИ
        const keyboard = aiEnabled ? [[
          { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]] : [[
          { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]];

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            message_thread_id: threadId, // Отправляем в тему юзера
            text: tgText,
            reply_markup: { inline_keyboard: keyboard }
          })
        });
        console.log('✅ Сообщение отправлено в тему', threadId);
      } catch (e) {
        console.error('❌ Ошибка отправки в Телеграм:', e.message);
      }
    }

    // Если ИИ выключен — не отвечаем юзеру
    if (!aiEnabled) {
      console.log('⏸️ ИИ выключен — менеджер отвечает');
      return res.status(200).json({ text: null, aiDisabled: true });
    }

    // Читаем промпт из Google Doc
    let systemPrompt = "Ты полезный ИИ ассистент";
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
        console.log('✅ Промпт загружен, длина:', systemPrompt.length);
      } catch (e) {
        console.error('❌ Ошибка чтения промпта:', e.message);
      }
    }

    // Очищаем историю от лишних полей перед отправкой в Claude
    // Claude принимает только role и content
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Отправляем запрос в Claude AI
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Самая быстрая и дешёвая модель
        max_tokens: 1024,                    // Максимум символов в ответе
        system: systemPrompt,               // Промпт с инструкциями
        messages: cleanMessages             // История переписки
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Ошибка Claude API", details: data });
    }

    const botText = data.content[0].text;

    // Отправляем ответ ИИ в тему юзера чтобы менеджер видел
    if (tgToken && tgChatId) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            message_thread_id: threadId, // В тему юзера
            text: `🤖 ИИ ответил:\n${botText}`,
          })
        });
      } catch (e) {
        console.error('❌ Ошибка отправки ответа в Телеграм:', e.message);
      }
    }

    // Возвращаем ответ виджету на сайте
    return res.status(200).json({
      text: botText,
      avatarUrl: avatarUrl || null
    });

  } catch (error) {
    console.error('❌ Auth Error:', error.message);
    return res.status(500).json({ error: "Ошибка сервера", message: error.message });
  }
};
