const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { clientId, sessionId, messages } = req.body;
    console.log('🔵 clientId:', clientId, 'sessionId:', sessionId);

    if (!clientId || !messages) {
      return res.status(400).json({ error: "clientId и messages обязательны" });
    }

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
    await sheet.loadCells();

    const defaultRow = 1;
    let foundRow = null;

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

    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    const status      = get(7);
    const claudeKey   = get(4);
    const googleDocId = get(3);
    const avatarUrl   = get(8);
    const tgToken     = get(5);
    const tgChatId    = get(6);

    if (status !== 'active') {
      return res.status(403).json({ error: "Агент не активен" });
    }

    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ не найден" });
    }

    // Проверяем флаг aiEnabled в Firebase
    const db = admin.database();
    const sessionRef = db.ref(`chats/${clientId}/${sessionId}`);
    const sessionSnap = await sessionRef.once('value');
    const sessionData = sessionSnap.val() || {};
    const aiEnabled = sessionData.aiEnabled !== false;
    console.log('🤖 aiEnabled:', aiEnabled);

    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage && lastMessage.role === 'user' ? lastMessage.content : null;

    // Отправляем в Телеграм с двумя кнопками
    if (tgToken && tgChatId && userText) {
      try {
        const statusText = aiEnabled ? '🤖 ИИ сейчас отвечает' : '👤 Менеджер сейчас отвечает';
        const tgText = `👤 Юзер [${clientId}]:\n${userText}\n\n${statusText}\nsession: ${sessionId}`;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: tgText,
            reply_markup: {
              inline_keyboard: [[
                { text: '🤖 Включить ИИ', callback_data: `ai_on:${clientId}:${sessionId}` },
                { text: '👤 Выключить ИИ', callback_data: `ai_off:${clientId}:${sessionId}` }
              ]]
            }
          })
        });
        console.log('✅ Сообщение отправлено в Телеграм');
      } catch (e) {
        console.error('❌ Ошибка отправки в Телеграм:', e.message);
      }
    }

    // Если ИИ выключен — не отвечаем
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

    // Очищаем историю от лишних полей
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Ошибка Claude API", details: data });
    }

    const botText = data.content[0].text;

    // Ответ бота в Телеграм
    if (tgToken && tgChatId) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: `🤖 ИИ ответил:\n${botText}`,
          })
        });
      } catch (e) {
        console.error('❌ Ошибка отправки ответа в Телеграм:', e.message);
      }
    }

    return res.status(200).json({
      text: botText,
      avatarUrl: avatarUrl || null
    });

  } catch (error) {
    console.error('❌ Auth Error:', error.message);
    return res.status(500).json({ error: "Ошибка сервера", message: error.message });
  }
};
