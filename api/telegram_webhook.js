// ============================================================
// ФАЙЛ: api/telegram_webhook.js
// ВЕРСИЯ: v2.0 - С ДЕБАГ ЛОГАМИ И ИСПРАВЛЕНИЯМИ
// НАЗНАЧЕНИЕ: Принимает события из Телеграм:
// 1. Нажатие кнопок (включить/выключить ИИ, история)
// 2. Ответы менеджера юзеру через Reply
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
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🔵 TELEGRAM WEBHOOK НАЧАТ');
  console.log('═══════════════════════════════════════════════════');
  
  if (req.method !== 'POST') {
    console.log('❌ Не POST запрос');
    return res.status(200).end();
  }

  try {
    const { message, callback_query } = req.body;
    
    console.log('📥 Получено от Телеграм:');
    console.log('  callback_query:', !!callback_query);
    console.log('  message:', !!message);

    // ====================================================
    // БЛОК 1: Обработка нажатия кнопок
    // ====================================================
    if (callback_query) {
      console.log('\n🔘 БЛОК 1: Нажата кнопка');
      
      const data = callback_query.data;
      const tgToken = process.env.TG_BOT_TOKEN;
      const db = admin.database();

      console.log(`  callback_data: "${data}"`);
      console.log(`  chat_id: ${callback_query.message.chat.id}`);

      const chatId = String(callback_query.message.chat.id);

      // Разбираем данные кнопки — формат: action|clientId|sessionId
      const parts = data.split('|');
      const action = parts[0];
      const clientId = parts[1];
      const sessionId = parts[2];

      console.log(`  action: "${action}", clientId: "${clientId}", sessionId: "${sessionId}"`);

      const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);

      // ---- Кнопка "Выключить ИИ" ----
      if (action === 'off') {
        console.log('  ➜ Выключаем ИИ');

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🔴 ИИ выключен!'
          })
        });

        await aiEnabledRef.set(false);
        console.log('  ✅ Firebase обновлён: aiEnabled = false');

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
        console.log('  ➜ Включаем ИИ');

        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callback_query.id,
            text: '🟢 ИИ включён!'
          })
        });

        await aiEnabledRef.set(true);
        console.log('  ✅ Firebase обновлён: aiEnabled = true');

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
        console.log('  ➜ Загружаем историю');

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

        console.log(`  ✅ История загружена: ${last5.length} сообщений`);

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
      }

      console.log('═══════════════════════════════════════════════════\n');
      return res.status(200).json({ ok: true });
    }

    // ====================================================
    // БЛОК 2: Обработка ответов менеджера юзеру
    // ====================================================
    if (!message || !message.text) {
      console.log('  ❌ Нет message или text');
      return res.status(200).end();
    }

    console.log('\n💬 БЛОК 2: Обработка Reply от менеджера');
    console.log(`  message.text: "${message.text.substring(0, 50)}..."`);

    // Пропускаем ботов
    if (message.from && message.from.is_bot && !message.sender_chat) {
      console.log('  ❌ Это бот - пропускаем');
      return res.status(200).end();
    }

    // Только Reply сообщения
    if (!message.reply_to_message) {
      console.log('  ❌ Это не Reply - пропускаем');
      return res.status(200).end();
    }

    console.log('  ✅ Это Reply сообщение');

    const originalText = message.reply_to_message.text || '';
    console.log(`  Ответ на: "${originalText.substring(0, 80)}..."`);

    // ✅ ИСПРАВЛЕННАЯ ИЗВЛЕЧЕНИЕ
    // Извлекаем clientId из текста — формат: [mina_001]
    const clientIdMatch = originalText.match(/\[(.+?)\]/);
    
    // Извлекаем sessionId из текста — формат: session: user_xxx
    // Допускаем пробелы после "session:"
    const sessionIdMatch = originalText.match(/session:\s*([^\s\n\r]+)/);
    
    console.log(`  🔍 clientIdMatch: ${clientIdMatch ? clientIdMatch[1] : 'НЕ НАЙДЕН'}`);
    console.log(`  🔍 sessionIdMatch: ${sessionIdMatch ? sessionIdMatch[1] : 'НЕ НАЙДЕН'}`);
    console.log(`  🔍 Полный текст для парсинга:\n${originalText}`);

    if (!clientIdMatch || !sessionIdMatch) {
      console.log('  ❌ Не найден clientId или sessionId - пропускаем');
      return res.status(200).end();
    }

    const clientId = clientIdMatch[1];
    const sessionId = sessionIdMatch[1];
    const managerText = message.text;
    const tgToken = process.env.TG_BOT_TOKEN;
    const chatId = String(message.chat.id);

    console.log(`  ✅ Найдено! clientId: "${clientId}", sessionId: "${sessionId}"`);
    console.log(`  📝 Ответ менеджера: "${managerText}"`);

    const db = admin.database();

    // Читаем историю юзера из Firebase
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    const snapshot = await historyRef.once('value');
    const val = snapshot.val();
    const historyArray = Array.isArray(val) ? val : [];

    console.log(`  📖 История загружена: ${historyArray.length} сообщений`);

    // Добавляем ответ менеджера
    // fromManager: true — виджет показывает синим цветом
    historyArray.push({
      role: 'assistant',
      content: managerText,
      fromManager: true
    });

    // Сохраняем — виджет автоматически покажет юзеру
    await historyRef.set(historyArray);
    console.log('  ✅ Ответ менеджера сохранён в Firebase');

    // Подтверждаем менеджеру
    await sendTgMessage(tgToken, {
      chat_id: chatId,
      text: '✅ Ответ отправлен юзеру!'
    });

    console.log('═══════════════════════════════════════════════════\n');
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ WEBHOOK ERROR:', error.message);
    console.error(error.stack);
    return res.status(200).end();
  }
};
