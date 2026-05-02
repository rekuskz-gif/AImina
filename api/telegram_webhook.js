// ============================================================
// ФАЙЛ: api/telegram_webhook.js
// НАЗНАЧЕНИЕ: Принимает события из Телеграм:
// 1. Нажатие кнопок (включить/выключить ИИ, история)
// 2. Ответы менеджера юзеру через Reply
// ВАЖНО: answerCallbackQuery вызывается ПЕРВЫМ —
// Телеграм даёт только 10 секунд на ответ!
// ВАЖНО: General тема не имеет thread_id — отправляем без него
// ============================================================

const admin = require('firebase-admin');

// Инициализация Firebase Admin — нужен для:
// 1. Сохранения статуса ИИ (включён/выключен)
// 2. Сохранения ответов менеджера в историю
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

    // ====================================================
    // БЛОК 1: Обработка нажатия кнопок
    // ====================================================
    if (callback_query) {
      const data = callback_query.data;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      // Логируем полный объект callback_query для отладки
      console.log('🔍 callback_query.message.chat:', JSON.stringify(callback_query.message.chat));

      // chatId берём из callback_query
      const chatId = callback_query.message.chat.id;
      console.log('🔍 chatId:', chatId, 'type:', typeof chatId);

      // Разбираем данные кнопки — формат: action|clientId|sessionId
      const parts = data.split('|');
      const action = parts[0];    // off, on, history, status
      const clientId = parts[1];  // ID клиента
      const sessionId = parts[2]; // ID сессии юзера

      console.log('✅ action:', action, 'clientId:', clientId, 'sessionId:', sessionId);

      // Ссылка на статус ИИ в Firebase
      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      // ---- Кнопка "Выключить ИИ" ----
      if (action === 'off') {

        // Сначала отвечаем на кнопку — до 10 секунд!
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🔴 ИИ выключен!'
          })
        });

        // Меняем статус в Firebase
        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        // Отправляем уведомление в чат
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(chatId), // Конвертируем в строку на всякий случай
            text: `🔴 ИИ выключен для [${clientId}]\nМенеджер отвечает вручную`,
            reply_markup: {
              inline_keyboard: [[
                { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
                { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
              ]]
            }
          })
        });
        const sendData = await sendRes.json();
        console.log('📨 sendMessage ответ:', JSON.stringify(sendData));

      // ---- Кнопка "Включить ИИ" ----
      } else if (action === 'on') {

        // Сначала отвечаем на кнопку
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🟢 ИИ включён!'
          })
        });

        // Меняем статус в Firebase
        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        // Отправляем уведомление в чат
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(chatId),
            text: `🟢 ИИ включён для [${clientId}]\nБот отвечает автоматически`,
            reply_markup: {
              inline_keyboard: [[
                { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
                { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
              ]]
            }
          })
        });
        const sendData = await sendRes.json();
        console.log('📨 sendMessage ответ:', JSON.stringify(sendData));

      // ---- Кнопка "История" ----
      } else if (action === 'history') {

        // Сначала отвечаем на кнопку
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '📜 История загружена!'
          })
        });

        // Читаем историю из Firebase
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

        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(chatId),
            text: historyText
          })
        });
        const sendData = await sendRes.json();
        console.log('📨 История отправлена:', JSON.stringify(sendData));

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

    // Игнорируем сообщения от ботов
    if (message.from && message.from.is_bot) return res.status(200).end();

    // Только Reply сообщения — не обычные сообщения в чат
    if (!message.reply_to_message) return res.status(200).end();

    const originalText = message.reply_to_message.text || '';

    // Извлекаем clientId из текста — формат: [mina_001]
    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    // Извлекаем sessionId из текста — формат: session: user_xxx
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

    // Читаем историю юзера из Firebase
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    const snapshot = await historyRef.once('value');
    const val = snapshot.val();
    const historyArray = Array.isArray(val) ? val : [];

    // Добавляем ответ менеджера в историю
    // fromManager: true — виджет показывает синим цветом
    historyArray.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    // Сохраняем — виджет автоматически покажет юзеру
    await historyRef.set(historyArray);
    console.log('✅ Ответ менеджера сохранён в Firebase');

    // Подтверждаем менеджеру
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
