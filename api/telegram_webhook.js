// ============================================================
// ФАЙЛ: api/telegram_webhook.js
// НАЗНАЧЕНИЕ: Принимает события из Телеграм:
// 1. Нажатие кнопок (включить/выключить ИИ, история)
// 2. Ответы менеджера юзеру через Reply
// ВАЖНО: Группа является форумом (is_forum: true)
// Поэтому все сообщения отправляются в General тему (thread_id: 1)
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
    // Срабатывает когда менеджер нажимает кнопку в чате
    // ====================================================
    if (callback_query) {
      const data = callback_query.data;
      const chatId = callback_query.message.chat.id;
      // ID темы General в форуме — всегда 1
      const threadId = callback_query.message.message_thread_id || 1;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      // Разбираем данные кнопки — формат: action|clientId|sessionId
      // Например: off|mina_001|user_abc123
      const parts = data.split('|');
      const action = parts[0];    // off, on, history, status
      const clientId = parts[1];  // ID клиента
      const sessionId = parts[2]; // ID сессии юзера

      console.log('✅ action:', action, 'clientId:', clientId, 'sessionId:', sessionId);
      console.log('💬 chatId:', chatId, 'threadId:', threadId);

      // Ссылка на статус ИИ в Firebase
      // Здесь хранится true/false — включён или выключен ИИ
      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      // ---- Кнопка "Выключить ИИ" ----
      // Менеджер хочет сам отвечать юзеру
      if (action === 'off') {
        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        // Показываем всплывающее уведомление менеджеру
        const answerRes = await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🔴 ИИ выключен!'
          })
        });
        const answerData = await answerRes.json();
        console.log('📨 answerCallbackQuery:', JSON.stringify(answerData));

        // Отправляем уведомление в General тему группы
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId, // Указываем тему форума
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
      // Менеджер передаёт управление обратно боту
      } else if (action === 'on') {
        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        // Показываем всплывающее уведомление менеджеру
        const answerRes = await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🟢 ИИ включён!'
          })
        });
        const answerData = await answerRes.json();
        console.log('📨 answerCallbackQuery:', JSON.stringify(answerData));

        // Отправляем уведомление в General тему группы
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId, // Указываем тему форума
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
      // Показывает последние 5 сообщений диалога
      } else if (action === 'history') {
        // Читаем историю из Firebase
        const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
        const snap = await historyRef.once('value');
        const val = snap.val();
        const history = Array.isArray(val) ? val : [];
        const last5 = history.slice(-5); // Берём только последние 5

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

        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId, // Указываем тему форума
            text: historyText
          })
        });
        const sendData = await sendRes.json();
        console.log('📨 История отправлена:', JSON.stringify(sendData));

      // ---- Кнопка "Статус" ----
      // Показывает текущий статус во всплывающем окне
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
    const managerText = message.text; // Текст ответа менеджера
    const tgToken = process.env.TG_BOT_TOKEN;
    const chatId = message.chat.id;

    const db = admin.database();

    // Читаем историю юзера из Firebase
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    const snapshot = await historyRef.once('value');
    const val = snapshot.val();
    const historyArray = Array.isArray(val) ? val : [];

    // Добавляем ответ менеджера в историю
    // fromManager: true — чтобы виджет показал его синим цветом
    historyArray.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    // Сохраняем обновлённую историю в Firebase
    // Виджет автоматически увидит новое сообщение и покажет юзеру
    await historyRef.set(historyArray);
    console.log('✅ Ответ менеджера сохранён в Firebase');

    // Подтверждаем менеджеру что сообщение отправлено
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
