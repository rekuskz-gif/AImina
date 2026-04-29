const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const clientId = req.query.clientId || 'mina_001';
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Widget'];
    const allRows = await sheet.getRows();

    if (!allRows || allRows.length === 0) {
      return res.status(404).json({ error: "Нет данных на листе" });
    }

    const config = allRows.find(row => row.get('clientId') === clientId);
    if (!config) {
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    res.status(200).json({
      text1:      config.get('text1'),
      text2:      config.get('text2'),
      colorStart: config.get('colorStart'),
      colorEnd:   config.get('colorEnd'),
      avatarUrl:  config.get('avatarUrl'),
      botName:    config.get('botName'),
      bgColor:    config.get('bgColor')   || '#ffffff',
      textColor:  config.get('textColor') || '#000000',
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
