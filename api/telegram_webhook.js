// 2. Ответы менеджера юзеру через Reply
// ВАЖНО: Группа является форумом (is_forum: true)
// Поэтому все сообщения отправляются в General тему (thread_id: 1)
// ВАЖНО: answerCallbackQuery нужно вызывать ПЕРВЫМ —
// Телеграм даёт только 10 секунд на ответ!
// ============================================================

const admin = require('firebase-admin');
@@ -36,13 +38,12 @@ module.exports = async (req, res) => {
    if (callback_query) {
      const data = callback_query.data;
      const chatId = callback_query.message.chat.id;
      // ID темы General в форуме — всегда 1
      // ID темы в форуме — берём из сообщения или используем 1 (General)
      const threadId = callback_query.message.message_thread_id || 1;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      // Разбираем данные кнопки — формат: action|clientId|sessionId
      // Например: off|mina_001|user_abc123
      const parts = data.split('|');
      const action = parts[0];    // off, on, history, status
      const clientId = parts[1];  // ID клиента
@@ -51,35 +52,31 @@ module.exports = async (req, res) => {
      console.log('✅ action:', action, 'clientId:', clientId, 'sessionId:', sessionId);
      console.log('💬 chatId:', chatId, 'threadId:', threadId);

      // Ссылка на статус ИИ в Firebase
      // Здесь хранится true/false — включён или выключен ИИ
      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      // ---- Кнопка "Выключить ИИ" ----
      // Менеджер хочет сам отвечать юзеру
      // ВАЖНО: Сначала отвечаем на кнопку!
      // Телеграм ждёт ответ максимум 10 секунд
      // Если не ответить вовремя — будет 404
      if (action === 'off') {
        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        // Показываем всплывающее уведомление менеджеру
        const answerRes = await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
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
        // Потом меняем статус в Firebase
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        // Отправляем уведомление в группу
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId, // Указываем тему форума
            message_thread_id: threadId,
            text: `🔴 ИИ выключен для [${clientId}]\nМенеджер отвечает вручную`,
            reply_markup: {
              inline_keyboard: [[
@@ -92,31 +89,29 @@ module.exports = async (req, res) => {
        const sendData = await sendRes.json();
        console.log('📨 sendMessage ответ:', JSON.stringify(sendData));

      // ---- Кнопка "Включить ИИ" ----
      // Менеджер передаёт управление обратно боту
      } else if (action === 'on') {
        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        // Показываем всплывающее уведомление менеджеру
        const answerRes = await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
        // Сначала отвечаем на кнопку
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
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
        // Потом меняем статус в Firebase
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        // Отправляем уведомление в группу
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId, // Указываем тему форума
            message_thread_id: threadId,
            text: `🟢 ИИ включён для [${clientId}]\nБот отвечает автоматически`,
            reply_markup: {
              inline_keyboard: [[
@@ -129,10 +124,19 @@ module.exports = async (req, res) => {
        const sendData = await sendRes.json();
        console.log('📨 sendMessage ответ:', JSON.stringify(sendData));

      // ---- Кнопка "История" ----
      // Показывает последние 5 сообщений диалога
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
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
        const snap = await historyRef.once('value');
        const val = snap.val();
@@ -151,30 +155,21 @@ module.exports = async (req, res) => {
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
            message_thread_id: threadId,
            text: historyText
          })
        });
        const sendData = await sendRes.json();
        console.log('📨 История отправлена:', JSON.stringify(sendData));

      // ---- Кнопка "Статус" ----
      // Показывает текущий статус во всплывающем окне
      } else if (action === 'status') {
        // Сначала отвечаем на кнопку
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        const snap = await aiEnabledRef.once('value');
        const aiEnabled = snap.val() !== false;
