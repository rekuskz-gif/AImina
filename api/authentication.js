const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

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

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();

    // ⬇️ ЧИТАЕМ С ЛИСТА "authentication"
    const sheet = doc.sheetsByTitle['authentication']; 
    const rows = await sheet.getRows();
    const config = rows.find(row => row.get('clientId') === clientId);

    if (!config) {
      return res.status(404).json({ error: "Клиент не найден" });
    }

    if (config.get('status') !== 'active') {
      return res.status(403).json({ error: "Агент не активен" });
    }

    const claudeKey = config.get('claudeKey');
    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ Claude не найден" });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        system: "Ты полезный ИИ ассистент",
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API Error:', data);
      return res.status(response.status).json({ error: "Ошибка Claude API", details: data });
    }

    const botMessage = data.content[0].text;

    return res.status(200).json({ 
      text: botMessage 
    });

  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({ 
      error: "Ошибка сервера", 
      message: error.message 
    });
  }
};
