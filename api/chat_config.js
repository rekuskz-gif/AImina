// ============================================================
// ФАЙЛ: api/chat_config.js
// НАЗНАЧЕНИЕ: Читает конфиг чата из Google Sheets
// Читает по НАЗВАНИЮ колонки — не по номеру!
// Если поле пустое — берёт из строки 2 (defaultRow)
// ============================================================

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

    // Загружаем оба листа
    const chatSheet = doc.sheetsByTitle['Chat window'];
    const authSheet = doc.sheetsByTitle['Authentication'];

    if (!chatSheet) {
      return res.status(500).json({ error: "Лист 'Chat window' не найден" });
    }
    if (!authSheet) {
      return res.status(500).json({ error: "Лист 'Authentication' не найден" });
    }

    await chatSheet.loadCells('A1:Z100');
    await authSheet.loadCells('A1:Z100');

    // ============================================================
    // Читаем заголовки из строки 1 — Chat window
    // ============================================================
    const chatHeaders = {};
    for (let col = 0; col < chatSheet.columnCount; col++) {
      const val = chatSheet.getCell(0, col).value;
      if (val) {
        chatHeaders[String(val).toLowerCase().trim()] = col;
      }
    }
    console.log('📋 Chat window заголовки:', chatHeaders);

    // ============================================================
    // Читаем заголовки из строки 1 — Authentication
    // ============================================================
    const authHeaders = {};
    for (let col = 0; col < authSheet.columnCount; col++) {
      const val = authSheet.getCell(0, col).value;
      if (val) {
        authHeaders[String(val).toLowerCase().trim()] = col;
      }
    }

    // ============================================================
    // Ищем клиента в Chat window
    // ============================================================
    const clientIdCol = chatHeaders['clientid'];
    if (clientIdCol === undefined) {
      return res.status(500).json({ error: "Колонка 'clientid' не найдена в Chat window" });
    }

    let chatRow = null;

    for (let i = 1; i < chatSheet.rowCount; i++) {
      if (chatSheet.getCell(i, clientIdCol).value === clientId) {
        chatRow = i;
        break;
      }
    }

    if (chatRow === null) {
      return res.status(404).json({ error: `Конфиг для клиента ${clientId} не найден в Chat window` });
    }

    // ============================================================
    // Ищем клиента в Authentication
    // ============================================================
    const authClientIdCol = authHeaders['clientid'];
    if (authClientIdCol === undefined) {
      return res.status(500).json({ error: "Колонка 'clientid' не найдена в Authentication" });
    }

    let authRow = null;

    for (let i = 1; i < authSheet.rowCount; i++) {
      if (authSheet.getCell(i, authClientIdCol).value === clientId) {
        authRow = i;
        break;
      }
    }

    // ============================================================
    // Функции чтения по названию колонки
    // Если пусто — берём из строки 2 (индекс 1)
    // ============================================================
    const DEFAULT_ROW = 1; // Строка 2 = индекс 1

    const getChat = (headerName) => {
      const col = chatHeaders[headerName.toLowerCase().trim()];
      if (col === undefined) return null;
      const clientVal = chatSheet.getCell(chatRow, col).value;
      if (clientVal) return clientVal;
      return chatSheet.getCell(DEFAULT_ROW, col).value;
    };

    const getAuth = (headerName) => {
      const col = authHeaders[headerName.toLowerCase().trim()];
      if (col === undefined) return null;
      if (authRow !== null) {
        const clientVal = authSheet.getCell(authRow, col).value;
        if (clientVal) return clientVal;
      }
      return authSheet.getCell(DEFAULT_ROW, col).value;
    };

    // ============================================================
    // Возвращаем конфиг по названиям колонок
    // ============================================================
    return res.status(200).json({
      headerColor:     getChat('headercolor')     || '#7c3aed',
      botBubbleColor:  getChat('botbubblecolor')  || '#e9e9eb',
      userBubbleColor: getChat('userbubblecolor') || '#7c3aed',
      botName:         getChat('botname')         || 'AI Mina',
      welcomeMsg:      getChat('welcomemsg')      || 'Здравствуйте! Чем я могу помочь?',
      placeholder:     getChat('placeholder')     || 'Введите сообщение...',
      customCSS:       getChat('customcss')       || '',
      footerText:      getChat('footertext')      || '',
      footerColor:     getChat('footercolor')     || '#999999',
      footerUrl:       getChat('footerurl')       || '#',
      avatarUrl:       getAuth('avatarurl')       || null,
    });

  } catch (error) {
    console.error('Chat Config Error:', error);
    return res.status(500).json({ error: "Ошибка при загрузке конфига", message: error.message });
  }
};
