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

    // Читаем ВСЕ ячейки
    await sheet.loadCells();

    const rowCount = sheet.rowCount;
    let foundRow = null;

    // Идём по каждой строке сверху вниз
    for (let i = 0; i < rowCount; i++) {
      const cell = sheet.getCell(i, 0); // Колонка A
      if (cell.value === clientId) {
        foundRow = i;
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    // Берём данные по номерам колонок A=0, B=1, C=2...
    res.status(200).json({
      clientId:   sheet.getCell(foundRow, 0).value,
      text1:      sheet.getCell(foundRow, 1).value,
      text2:      sheet.getCell(foundRow, 2).value,
      colorStart: sheet.getCell(foundRow, 3).value,
      colorEnd:   sheet.getCell(foundRow, 4).value,
      avatarUrl:  sheet.getCell(foundRow, 5).value,
      botName:    sheet.getCell(foundRow, 6).value,
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
