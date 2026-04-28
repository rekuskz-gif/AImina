const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { clientId } = req.query;

  try {
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://googleapis.com'],
    });

    // ЗАМЕНИТЕ НА ВАШ ID ТАБЛИЦЫ
    const doc = new GoogleSpreadsheet('ВАШ_ID_ТАБЛИЦЫ', auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle['Chat window-Окно чата']; 
    const rows = await sheet.getRows();
    const config = rows.find(row => row.get('clientId') === clientId);

    if (!config) return res.status(404).json({ error: "Config not found" });

    res.status(200).json({
      headerColor: config.get('headerColor'),
      botBubbleColor: config.get('botBubbleColor'),
      userBubbleColor: config.get('userBubbleColor'),
      botName: config.get('botName'),
      welcomeMsg: config.get('welcomeMsg')
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
