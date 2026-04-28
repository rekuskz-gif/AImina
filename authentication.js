const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
  // Настройка CORS для безопасности
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { clientId, messages } = req.body;
    if (!clientId || !messages) return res.status(400).json({ error: "Данные не полные" });

    // 1. АВТОРИЗАЦИЯ В GOOGLE
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://googleapis.com'],
    });

    // ВСТАВЬТЕ ID ВАШЕЙ ТАБЛИЦЫ НИЖЕ
    const doc = new GoogleSpreadsheet('ID_ВАШЕЙ_ТАБЛИЦЫ', auth);
    await doc.loadInfo();

    // 2. ПОИСК КЛЮЧЕЙ КЛИЕНТА (Лист Authentication)
    const sheet = doc.sheetsByTitle['Authentication']; 
    const rows = await sheet.getRows();
    const config = rows.find(row => row.get('clientId') === clientId);

    if (!config || config.get('status') !== 'active') {
      return res.status(403).json({ error: "Агент не активен или не найден" });
    }

    // 3. ЗАПРОС К CLAUDE (Используем ключ этого конкретного клиента из таблицы)
    const response = await fetch('https://anthropic.com', {
      method: 'POST',
      headers: {
        'x-api-key': config.get('claudeKey'), // Ключ из таблицы
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        system: "Инструкция из Google Doc", // Тут можно добавить подгрузку промпта
        messages: messages
      })
    });

    const data = await response.json();
    
    // 4. ОТВЕТ НА САЙТ
    res.status(200).json({ text: data.content[0].text });

  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};
