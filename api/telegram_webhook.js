const admin = require('firebase-admin');

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
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const { message } = req.body;
    if (!message || !message.text) return res.status(200).end();
    if (message.from && message.from.is_bot) return res.status(200).end();

    // Только ответы на сообщения
    if (!message.reply_to_message) return res.status(200).end();

    const originalText = message.reply_to_message.text || '';
    console.log('📨 Оригинальное сообщение:', originalText);

    // Извлекаем clientId из [mina_001]
    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    // Извлекаем sessionId — любое слово после "session: "
    const sessionIdMatch = originalText.match(/session: (\S+)/);

    console.log('🔍 clientId:', clientIdMatch?.[1]);
    console.log('🔍 sessionId:', sessionIdMatch?.[1]);

    if (!clientIdMatch || !sessionIdMatch) {
      console.log('❌ Не найден clientId или sessionId');
      return res.status(200).end();
    }

    const clientId = clientIdMatch[1];
    const sessionId = sessionIdMatch[1];
    const managerText = message.text;
    const tgToken = process.env.TG_BOT_TOKEN;
    const chatId = message.chat.id;

    console.log('✅ clientId:', clientId, 'sessionId:', sessionId);

    // Сохраняем в Firebase
    const db = admin.database();
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);

    const snapshot = await historyRef.once('value');
    const chatHistory = snapshot.val() || [];

    chatHistory.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    await historyRef.set(chatHistory);
    console.log('✅ Ответ менеджера сохранён в Firebase');

    // Подтверждение менеджеру
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
    console.error('❌ Webhook error:', error.message);
    return res.status(200).end();
  }
};
