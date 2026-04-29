const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { clientId, messages } = req.body;
    console.log('🔵 clientId:', clientId);

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
      console.log(`🔍 Строка ${i}: "${val}"`);
      if (val === clientId) {
        foundRow = i;
        break;
      }
    }

    console.log('✅ foundRow:', foundRow);
    console.log('📋 defaultRow:', defaultRow);

    if (foundRow === null) {
      return res.status(404).json({ error: "Клиент не найден" });
    }

    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    const status      = get(7);
    const claudeKey   = get(4);
    const googleDocId = get(3);
    const avatarUrl   = get(8);

    console.log('📊 status:', status);
    console.log('🔑 claudeKey:', claudeKey ? 'есть' : 'НЕТ');
    console.log('📄 googleDocId:', googleDocId);
    console.log('🖼️ avatarUrl:', avatarUrl);

    if (status !== 'active') {
      return res.status(403).json({ error: "Агент не активен" });
    }

    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ не найден" });
    }

    let systemPrompt = "Ты полезный ИИ ассистент";
    if (googleDocId) {
      try {
        console.log('📖 Читаем Google Doc:', googleDocId);
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')
            .join(''))
          .join('')
          .trim();
        console.log('✅ Промпт загружен, длина:', systemPrompt.length, 'символов');
        console.log('📝 Начало промпта:', systemPrompt.substring(0, 100));
      } catch (e) {
        console.error('❌ Ошибка чтения промпта:', e.message);
      }
    } else {
      console.log('⚠️ googleDocId пустой — промпт по умолчанию');
    }

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
    console.log('🤖 Claude ответил:', response.ok ? 'OK' : 'ОШИБКА');

    if (!response.ok) {
      console.error('❌ Claude error:', data);
      return res.status(response.status).json({ error: "Ошибка Claude API", details: data });
    }

    return res.status(200).json({ 
      text: data.content[0].text,
      avatarUrl: avatarUrl || null
    });

  } catch (error) {
    console.error('❌ Auth Error:', error.message);
    return res.status(500).json({ error: "Ошибка сервера", message: error.message });
  }
};
