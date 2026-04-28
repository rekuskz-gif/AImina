const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
  // ⬇️ CORS ЗАГОЛОВКИ (ОБЯЗАТЕЛЬНО В НАЧАЛЕ)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Если браузер проверяет доступ (OPTIONS запрос)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ error: "clientId обязателен" });
    }

    // 1. АВТОРИЗАЦИЯ В GOOGLE
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // ИСПОЛЬЗУЕМ ID ТАБЛИЦЫ ИЗ ПЕРЕМЕННОЙ ОКРУЖЕНИЯ
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();

    // 2. ИЩЕМ НА ЛИСТЕ "Chat window-Окно переписки"
    const sheet = doc.sheetsByTitle['Chat window-Окно переписки']; 
    const rows = await sheet.getRows();
    const config = rows.find(row => row.get('clientId') === clientId);

    if (!config) {
      return res.status(404).json({ error: "Конфиг не найден для этого clientId" });
    }

    // 3. ВОЗВРАЩАЕМ ДАННЫЕ ДЛЯ ДИЗАЙНА
    return res.status(200).json({
      headerColor: config.get('headerColor') || '#7c3aed',
      botBubbleColor: config.get('botBubbleColor') || '#e9e9eb',
      userBubbleColor: config.get('userBubbleColor') || '#7c3aed',
      botName: config.get('botName') || 'AI Mina',
      welcomeMsg: config.get('welcomeMsg') || 'Здравствуйте! Чем я могу помочь?'
    });

  } catch (error) {
    console.error('Chat Config Error:', error);
    return res.status(500).json({ 
      error: "Ошибка при загрузке конфига", 
      message: error.message 
    });
  }
};
