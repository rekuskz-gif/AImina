const admin = require('firebase-admin');

// Инициализация Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const { message } = req.body;
    if (!message || !message.text) return res.status(200).end();

    // Игнорируем сообщения от бота
    if (message.from && message.from.is_bot) return res.status(200).end();

    const text = message.text;
    const chatId = message.chat.id;

    // Ищем sessionId из текста или reply
    // Формат: менеджер отвечает на сообщение юзера
    if (!message.reply_to_message) {
      return res.status(200).end(); // Только ответы на сообщения
    }

    const originalText = message.reply_to_message.text || '';
    
    // Извлекаем clientId и sessionId из оригинального сообщения
    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    const sessionIdMatch = originalText.match(/session: (.+?)(\n|$)/);

    if (!clientIdMatch) return res.status(200).end();

    const clientId = clientIdMatch[1];
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (!sessionId) return res.status(200).end();

    // Сохраняем ответ менеджера в Firebase
    const db = admin.database();
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    
    const snapshot = await historyRef.once('value');
    const chatHistory = snapshot.val() || [];
    
    chatHistory.push({
      role: 'assistant',
      content: `👤 Менеджер: ${text}`,
      fromManager: true
    });
    
    await historyRef.set(chatHistory);

    // Подтверждаем менеджеру
    const tgToken = process.env.TG_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ Ответ отправлен юзеру!'
      })
    });

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).end();
  }
};
