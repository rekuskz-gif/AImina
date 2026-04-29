const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

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

    await doc.sheetsByTitle['Chat window'].loadCells();
    await doc.sheetsByTitle['Authentication'].loadCells();

    const chatSheet = doc.sheetsByTitle['Chat window'];
    const authSheet = doc.sheetsByTitle['Authentication'];

    const defaultRow = 1; // строка 2

    // Ищем клиента в Chat window
    let chatRow = null;
    for (let i = 0; i < chatSheet.rowCount; i++) {
      if (chatSheet.getCell(i, 0).value === clientId) {
        chatRow = i;
        break;
      }
    }
    if (chatRow === null) {
      return res.status(404).json({ error: "Конфиг не найден" });
    }

    // Ищем клиента в Authentication
    let authRow = null;
    for (let i = 0; i < authSheet.rowCount; i++) {
      if (authSheet.getCell(i, 0).value === clientId) {
        authRow = i;
        break;
      }
    }

    // Функции — если пусто берём из строки 2
    const chat = (col) => chatSheet.getCell(chatRow, col).value || chatSheet.getCell(defaultRow, col).value;
    const auth2 = (col) => authRow !== null
      ? (authSheet.getCell(authRow, col).value || authSheet.getCell(defaultRow, col).value)
      : authSheet.getCell(defaultRow, col).value;

    return res.status(200).json({
      headerColor:     chat(1)  || '#7c3aed',
      botBubbleColor:  chat(2)  || '#e9e9eb',
      userBubbleColor: chat(3)  || '#7c3aed',
      botName:         chat(4)  || 'AI Mina',
      welcomeMsg:      chat(5)  || 'Здравствуйте! Чем я могу помочь?',
      placeholder:     chat(6)  || 'Введите сообщение...',
      customCSS:       chat(7)  || '',
      footerText:      chat(8)  || '',
      footerColor:     chat(9)  || '#999999',
      footerUrl:       chat(10) || '#',
      avatarUrl:       auth2(8) || null,
    });

  } catch (error) {
    console.error('Chat Config Error:', error);
    return res.status(500).json({ error: "Ошибка при загрузке конфига", message: error.message });
  }
};
