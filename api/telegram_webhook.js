// ============================================================
// ФАЙЛ: api/telegram_webhook.js
// НАЗНАЧЕНИЕ: Принимает события из Телеграм:
// 1. Нажатие кнопок (включить/выключить ИИ, история)
// 2. Ответы менеджера юзеру через Reply
// ВАЖНО: answerCallbackQuery вызывается ПЕРВЫМ —
// Телеграм даёт только 10 секунд на ответ!
// ============================================================

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

// Вспомогательная функция отправки сообщения в Телеграм
async function sendTgMessage(tgToken, body) {
  console.log('📤 Отправляем в Телеграм:', JSON.stringify(body));
  const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('📨 Ответ Телеграм:', JSON.stringify(data));
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const { message, callback_query } = req.body;

    // ====================================================
    // БЛОК 1: Обработка нажатия кнопок
    // ====================================================
    if (callback_query) {
      const data = callback_query.data;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      console.log('🔍 chat:', JSON.stringify(callback_query.message.chat));

      const chatId = String(callback_query.message.chat.id);
      console.log('🔍 chatId:', chatId);

      // Разбираем данные кнопки — формат: action|clientId|sessionId
      const parts = data.split('|');
      const action = parts[0];
      const clientId = parts[1];
      const sessionId = parts[2];

      console.log('✅ action:', action, 'clientId:', clientId, 'sessionId:', sessionId);

      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      // ---- Кнопка "Выключить ИИ" ----
      if (action === 'off') {

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🔴 ИИ выключен!'
          })
        });

        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        await sendTgMessage(tgToken, {
          chat_id: chatId,
          text: `🔴 ИИ выключен для [${clientId}]\nМенеджер отвечает вручную`,
          reply_markup: {
            inline_keyboard: [[
              { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
              { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
            ]]
          }
        });

      // ---- Кнопка "Включить ИИ" ----
      } else if (action === 'on') {

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🟢 ИИ включён!'
          })
        });

        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        await sendTgMessage(tgToken, {
          chat_id: chatId,
          text: `🟢 ИИ включён для [${clientId}]\nБот отвечает автоматически`,
          reply_markup: {
            inline_keyboard: [[
              { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
              { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
            ]]
          }
        });

      // ---- Кнопка "История" ----
      } else if (action === 'history') {

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '📜 История загружена!'
          })
        });

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

        await sendTgMessage(tgToken, {
          chat_id: chatId,
          text: historyText
        });

      // ---- Кнопка "Статус" ----
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

    // ====================================================
    // БЛОК 2: Обработка ответов менеджера юзеру
    // Срабатывает когда менеджер делает Reply на сообщение юзера
    // ====================================================
    if (!message || !message.text) return res.status(200).end();

    // 🔧 FIX: Пропускаем анонимные ответы от имени группы
    // Раньше: is_bot блокировал анонимных админов группы
    // Теперь: блокируем только настоящих ботов у которых нет sender_chat
    if (message.from && message.from.is_bot && !message.sender_chat) return res.status(200).end();

    // Только Reply сообщения
    if (!message.reply_to_message) return res.status(200).end();

    const originalText = message.reply_to_message.text || '';
    console.log('📨 Reply на:', originalText.substring(0, 100));

    // Извлекаем clientId из текста — формат: [mina_001]
    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    // Извлекаем sessionId из текста — формат: session: user_xxx
    const sessionIdMatch = originalText.match(/session: ([^\s\n\r]+)/);

    console.log('🔍 clientId:', clientIdMatch?.[1], 'sessionId:', sessionIdMatch?.[1]);

    if (!clientIdMatch || !sessionIdMatch) {
      console.log('❌ Не найден clientId или sessionId');
      return res.status(200).end();
    }

    const clientId = clientIdMatch[1];
    const sessionId = sessionIdMatch[1];
    const managerText = message.text;
    const tgToken = process.env.TG_BOT_TOKEN;
    const chatId = String(message.chat.id);

    const db = admin.database();

    // Читаем историю юзера из Firebase
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    const snapshot = await historyRef.once('value');
    const val = snapshot.val();
    const historyArray = Array.isArray(val) ? val : [];

    // Добавляем ответ менеджера
    // fromManager: true — виджет показывает синим цветом
    historyArray.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    // Сохраняем — виджет автоматически покажет юзеру
    await historyRef.set(historyArray);
    console.log('✅ Ответ менеджера сохранён');

    // Подтверждаем менеджеру
    await sendTgMessage(tgToken, {
      chat_id: chatId,
      text: '✅ Ответ отправлен юзеру!'
    });

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    return res.status(200).end();
  }
};
