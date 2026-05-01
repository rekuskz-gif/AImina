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
    const { message, callback_query } = req.body;

    // Обработка нажатия кнопок
    if (callback_query) {
      const data = callback_query.data;
      const chatId = callback_query.message.chat.id;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      const parts = data.split(':');
      const action = parts[0];
      const clientId = parts[1];
      const sessionId = parts[2];

      console.log('🔘 Кнопка:', action, clientId, sessionId);

      // Сохраняем aiEnabled отдельно
      const aiEnabledRef = db.ref(`chats/${clientId}/${sessionId}/aiEnabled`);

      if (action === 'ai_off') {
        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '⏸️ ИИ выключен! Теперь вы отвечаете.'
          })
        });

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⏸️ ИИ выключен для [${clientId}]\nТеперь менеджер отвечает юзеру вручную.`
          })
        });

      } else if (action === 'ai_on') {
        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '▶️ ИИ включён!'
          })
        });

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `▶️ ИИ включён для [${clientId}]\nБот снова отвечает автоматически.`
          })
        });
      }

      return res.status(200).json({ ok: true });
    }

    // Обработка обычных сообщений
    if (!message || !message.text) return res.status(200).end();
    if (message.from && message.from.is_bot) return res.status(200).end();
    if (!message.reply_to_message) return res.status(200).end();

    const originalText = message.reply_to_message.text || '';
    console.log('📨 Оригинальное сообщение:', originalText);

    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    const sessionIdMatch = originalText.match(/session: ([^\s\n\r]+)/);

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

    const db = admin.database();

    // Читаем историю из messages
    const messagesRef = db.ref(`chats/${clientId}/${sessionId}/messages`);
    const snapshot = await messagesRef.once('value');
    const chatHistory = snapshot.val() || [];

    chatHistory.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    await messagesRef.set(chatHistory);
    console.log('✅ Ответ менеджера сохранён в Firebase');

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
