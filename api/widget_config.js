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
    await sheet.loadCells();

    const defaultRow = 1; // строка 2

    // Ищем клиента
    let foundRow = null;
    for (let i = 0; i < sheet.rowCount; i++) {
      if (sheet.getCell(i, 0).value === clientId) {
        foundRow = i;
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    // Если пусто — берём из строки 2
    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // A=0 clientId, B=1 text1, C=2 text2, D=3 colorStart
    // E=4 colorEnd, F=5 avatarUrl, G=6 botName, H=7 bgColor, I=8 textColor
    return res.status(200).json({
      text1:      get(1) || '',
      text2:      get(2) || '',
      colorStart: get(3) || '#7c3aed',
      colorEnd:   get(4) || '#4f46e5',
      avatarUrl:  get(5) || '',
      botName:    get(6) || 'AI Mina',
      bgColor:    get(7) || '#ffffff',
      textColor:  get(8) || '#000000',
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
