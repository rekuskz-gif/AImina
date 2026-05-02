// НАЗНАЧЕНИЕ: Принимает события из Телеграм:
// 1. Нажатие кнопок (включить/выключить ИИ, история)
// 2. Ответы менеджера юзеру через Reply
// ВАЖНО: Группа является форумом (is_forum: true)
// Поэтому все сообщения отправляются в General тему (thread_id: 1)
// ВАЖНО: answerCallbackQuery нужно вызывать ПЕРВЫМ —
// ВАЖНО: answerCallbackQuery вызывается ПЕРВЫМ —
// Телеграм даёт только 10 секунд на ответ!
// ВАЖНО: Уведомления о статусе отправляются БЕЗ message_thread_id
// потому что General тема не имеет thread_id
// ============================================================

const admin = require('firebase-admin');
@@ -38,8 +38,6 @@ module.exports = async (req, res) => {
    if (callback_query) {
      const data = callback_query.data;
      const chatId = callback_query.message.chat.id;
      // ID темы в форуме — берём из сообщения или используем 1 (General)
      const threadId = callback_query.message.message_thread_id || 1;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

@@ -50,12 +48,14 @@ module.exports = async (req, res) => {
      const sessionId = parts[2]; // ID сессии юзера

      console.log('✅ action:', action, 'clientId:', clientId, 'sessionId:', sessionId);
      console.log('💬 chatId:', chatId, 'threadId:', threadId);

      // ВАЖНО: Сначала отвечаем на кнопку!
      // Телеграм ждёт ответ максимум 10 секунд
      // Если не ответить вовремя — будет 404
      // Ссылка на статус ИИ в Firebase
      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      // ---- Кнопка "Выключить ИИ" ----
      if (action === 'off') {

        // Сначала отвечаем на кнопку — до 10 секунд!
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
@@ -66,17 +66,16 @@ module.exports = async (req, res) => {
        });

        // Потом меняем статус в Firebase
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        await aiEnabledRef.set(false);
        console.log('⏸️ ИИ выключен для', clientId, sessionId);

        // Отправляем уведомление в группу
        // Отправляем уведомление БЕЗ message_thread_id
        // General тема не имеет thread_id
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId,
            text: `🔴 ИИ выключен для [${clientId}]\nМенеджер отвечает вручную`,
            reply_markup: {
              inline_keyboard: [[
@@ -89,7 +88,9 @@ module.exports = async (req, res) => {
        const sendData = await sendRes.json();
        console.log('📨 sendMessage ответ:', JSON.stringify(sendData));

      // ---- Кнопка "Включить ИИ" ----
      } else if (action === 'on') {

        // Сначала отвечаем на кнопку
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
@@ -101,17 +102,15 @@ module.exports = async (req, res) => {
        });

        // Потом меняем статус в Firebase
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        await aiEnabledRef.set(true);
        console.log('▶️ ИИ включён для', clientId, sessionId);

        // Отправляем уведомление в группу
        // Отправляем уведомление БЕЗ message_thread_id
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: threadId,
            text: `🟢 ИИ включён для [${clientId}]\nБот отвечает автоматически`,
            reply_markup: {
              inline_keyboard: [[
@@ -124,7 +123,10 @@ module.exports = async (req, res) => {
        const sendData = await sendRes.json();
        console.log('📨 sendMessage ответ:', JSON.stringify(sendData));

      // ---- Кнопка "История" ----
      // Показывает последние 5 сообщений диалога
      } else if (action === 'history') {

        // Сначала отвечаем на кнопку
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
@@ -136,7 +138,6 @@ module.exports = async (req, res) => {
        });

        // Читаем историю из Firebase
        const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
        const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
        const snap = await historyRef.once('value');
        const val = snap.val();
@@ -155,21 +156,21 @@ module.exports = async (req, res) => {
          }
        });

        // Отправляем историю БЕЗ message_thread_id
        const sendRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
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

@@ -232,8 +233,7 @@ module.exports = async (req, res) => {
      fromManager: true
    });

    // Сохраняем обновлённую историю в Firebase
    // Виджет автоматически увидит новое сообщение и покажет юзеру
    // Сохраняем обновлённую историю — виджет автоматически покажет юзеру
    await historyRef.set(historyArray);
    console.log('✅ Ответ менеджера сохранён в Firebase');
