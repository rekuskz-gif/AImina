const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ error: "clientId обязателен" });
    }

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();

    // ⬇️ ЧИТАЕМ С ЛИСТА "Widget-Виджет-Зазывала"
    // startIndex: 3 = начинаем со строки 4 (где данные)
    const sheet = doc.sheetsByTitle['Widget-Виджет-Зазывала']; 
    const rows = await sheet.getRows({ startIndex: 3 });
    const config = rows.find(row => row.get('clientId') === clientId);

    if (!config) {
      return res.status(404).json({ error: "Конфиг не найден для этого clientId" });
    }

    return res.status(200).json({
      text1: config.get('text1') || 'Здравствуйте!',
      text2: config.get('text2') || 'Чем я могу помочь?',
      colorStart: config.get('colorStart') || '#7c3aed',
      colorEnd: config.get('colorEnd') || '#4f46e5',
      avatarUrl: config.get('avatarUrl') || 'https://via.placeholder.com/100',
      botName: config.get('botName') || 'AI Mina'
    });

  } catch (error) {
    console.error('Widget Config Error:', error);
    return res.status(500).json({ 
      error: "Ошибка при загрузке конфига", 
      message: error.message 
    });
  }
};
