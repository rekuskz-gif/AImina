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

    // Загружаем все ячейки
    await doc.sheetsByTitle['Chat window'].loadCells();
    await doc.sheetsByTitle['Authentication'].loadCells();

    const chatSheet = doc.sheetsByTitle['Chat window'];
    const authSheet = doc.sheetsByTitle['Authentication'];

    // Ищем clientId в Chat window
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

    // Ищем clientId в Authentication
    let authRow = null;
    for (let i = 0; i < authSheet.rowCount; i++) {
      if (authSheet.getCell(i, 0).value === clientId) {
        authRow = i;
        break;
      }
    }

    // Берём аватарку из Authentication колонка I=8
    const avatarUrl = authRow !== null ? authSheet.getCell(authRow, 8).value : null;

    // A=0 clientId, B=1 headerColor, C=2 botBubbleColor, D=3 userBubbleColor
    // E=4 botName, F=5 welcomeMsg, G=6 placeholder, H=7 customCSS
    // I=8 footerText, J=9 footerColor, K=10 footerUrl
    return res.status(200).json({
      headerColor:     chatSheet.getCell(chatRow, 1).value || '#7c3aed',
      botBubbleColor:  chatSheet.getCell(chatRow, 2).value || '#e9e9eb',
      userBubbleColor: chatSheet.getCell(chatRow, 3).value || '#7c3aed',
      botName:         chatSheet.getCell(chatRow, 4).value || 'AI Mina',
      welcomeMsg:      chatSheet.getCell(chatRow, 5).value || 'Здравствуйте! Чем я могу помочь?',
      placeholder:     chatSheet.getCell(chatRow, 6).value || 'Введите сообщение...',
      customCSS:       chatSheet.getCell(chatRow, 7).value || '',
      footerText:      chatSheet.getCell(chatRow, 8).value || '',
      footerColor:     chatSheet.getCell(chatRow, 9).value || '#999999',
      footerUrl:       chatSheet.getCell(chatRow, 10).value || '#',
      avatarUrl:       avatarUrl || null,
    });

  } catch (error) {
    console.error('Chat Config Error:', error);
    return res.status(500).json({
      error: "Ошибка при загрузке конфига",
      message: error.message
    });
  }
};
