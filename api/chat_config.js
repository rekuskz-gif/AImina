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
    const sheet = doc.sheetsByTitle['Chat window'];
    const rows = await sheet.getRows({ startIndex: 2 });

    const config = rows.find(row => row.get('clientId') === clientId);
    if (!config) {
      return res.status(404).json({ error: "Конфиг не найден для этого clientId" });
    }

    return res.status(200).json({
      headerColor:     config.get('headerColor')     || '#7c3aed',
      botBubbleColor:  config.get('botBubbleColor')  || '#e9e9eb',
      userBubbleColor: config.get('userBubbleColor') || '#7c3aed',
      botName:         config.get('botName')         || 'AI Mina',
      welcomeMsg:      config.get('welcomeMsg')      || 'Здравствуйте! Чем я могу помочь?',
      placeholder:     config.get('placeholder')     || 'Введите сообщение...',
      promptDocId:     config.get('promptDocId')     || null,
    });

  } catch (error) {
    console.error('Chat Config Error:', error);
    return res.status(500).json({
      error: "Ошибка при загрузке конфига",
      message: error.message
    });
  }
};
