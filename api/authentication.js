const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { clientId, messages } = req.body;

    if (!clientId || !messages) {
      return res.status(400).json({ error: "clientId и messages обязательны" });
    }

    // Подключаемся к таблице
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
    const rows = await sheet.getRows({ startIndex: 2 });

    const config = rows.find(row => row.get('clientId') === clientId);
    if (!config) {
      return res.status(404).json({ error: "Клиент не найден" });
    }

    if (config.get('status') !== 'active') {
      return res.status(403).json({ error: "Агент не активен" });
    }

    const claudeKey = config.get('claudeApiKey');
    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ не найден" });
    }

    // Читаем промпт из Google Doc
    let systemPrompt = "Ты полезный ИИ ассистент";
    const googleDocId = config.get('googleDocId');

    if (googleDocId) {
      try {
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        const content = docRes.data.body.content;
        systemPrompt = content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements.map(el => el.textRun?.content || '').join(''))
          .join('')
          .trim();
      } catch (e) {
        console.error('Ошибка чтения промпта:', e);
      }
    }

    // Отправляем в Claude
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
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API Error:', data);
      return res.status(response.status).json({ error: "Ошибка Claude API", details: data });
    }

    return res.status(200).json({ text: data.content[0].text });

  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
