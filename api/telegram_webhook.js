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

    if (callback_query) {
      const data = callback_query.data;
      const chatId = callback_query.message.chat.id;
      const messageId = callback_query.message.message_id;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      const parts = data.split('|');
      const action = parts[0];
      const clientId = parts[1];
      const sessionId = parts[2];

      console.log('✅ action:', action, 'clientId:', clientId, 'sessionId:', sessionId);

      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      if (action === 'off') {
        await aiEnabledRef.set(false);

        // Отвечаем на нажатие
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🔴 ИИ выключен!'
          })
        });

        // Уведомление в чат
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔴 ИИ выключен для [${clientId}]\nМенеджер отвечает вручную`,
            reply_markup: {
              inline_keyboard: [[
                { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
                { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
              ]]
            }
          })
        });

        // Меняем кнопки на оригинальном сообщении
        await fetch(`https://api.telegram.org/bot${tgToken}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [[
                { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
                { text: '🔴 ✅ Менеджер', callback_data: `status|${clientId}|${sessionId}` },
                { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
              ]]
            }
          })
        });

      } else if (action === 'on') {
        await aiEnabledRef.set(true);

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🟢 ИИ включён!'
          })
        });

        // Уведомление в чат
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🟢 ИИ включён для [${clientId}]\nБот отвечает автоматически`,
            reply_markup: {
              inline_keyboard: [[
                { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
                { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
              ]]
            }
          })
        });

        // Меняем кнопки на оригинальном сообщении
        await fetch(`https://api.telegram.org/bot${tgToken}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ ИИ активен', callback_data: `status|${clientId}|${sessionId}` },
                { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
                { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
              ]]
            }
          })
        });

      } else if (action === 'history') {
        const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
        const snap = await historyRef.once('value');
        const val = snap.val();
        const history = Array.isArray(val) ? val : [];
        const last5 = history.slice(-5);

        let historyText = `📜 Последние сообщения [${clientId}]:\n\n`;
        last5.forEach(msg => {
          if (!msg) return;
          if (msg.role === 'user') {
            historyText += `👤 Юзер: ${msg.content}\n\n`;
          } else if (msg.fromManager) {
            historyText += `👨‍💼 Менеджер: ${msg.content}\n\n`;
          } else {
            historyText += `🤖 ИИ: ${msg.content}\n\n`;
          }
        });

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '📜 История загружена!'
          })
        });

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: historyText
          })
        });

      } else if (action === 'status') {
        const snap = await aiEnabledRef.once('value');
        const aiEnabled = snap.val() !== false;

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: aiEnabled ? '✅ ИИ сейчас активен' : '✅ Менеджер сейчас отвечает'
          })
        });
      }

      return res.status(200).json({ ok: true });
    }

    if (!message || !message.text) return res.status(200).end();
    if (message.from && message.from.is_bot) return res.status(200).end();
    if (!message.reply_to_message) return res.status(200).end();

    const originalText = message.reply_to_message.text || '';
    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    const sessionIdMatch = originalText.match(/session: ([^\s\n\r]+)/);

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
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    const snapshot = await historyRef.once('value');
    const val = snapshot.val();
    const historyArray = Array.isArray(val) ? val : [];

    historyArray.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    await historyRef.set(historyArray);
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
