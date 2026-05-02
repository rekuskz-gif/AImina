// ============================================================
// ФАЙЛ: api/authentication.js
// 
// НАЗНАЧЕНИЕ: Главный API обработки сообщений юзера
// 
// ЧТО ДЕЛАЕТ:
// 1. Получает сообщение от widget.js
// 2. Загружает конфиг клиента из Google Sheet
// 3. Отправляет сообщение юзера в Telegram менеджеру
// 4. Проверяет: ИИ включён или менеджер отвечает?
// 5. Если ИИ включён: отправляет в Claude, возвращает ответ
// 6. Если ИИ выключен: отправляет WARNING сообщение в Telegram
// 7. Сохраняет всё в Firebase
// 
// ПОЛУЧАЕТ от widget.js:
// {
//   "clientId": "mina_001",
//   "sessionId": "user_abc123_1609459200000",
//   "messages": [
//     { "role": "user", "content": "Привет!" },
//     ...
//   ]
// }
// 
// ОТПРАВЛЯЕТ widget.js:
// {
//   "text": "Привет! Чем помочь?",  (или null если ИИ выключен)
//   "aiDisabled": false,
//   "avatarUrl": "https://..."
// }
// ============================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// ============================================================
// ИНИЦИАЛИЗАЦИЯ: Firebase Admin SDK
// ============================================================

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
  // ============================================================
  // ШАГ 1: CORS заголовки
  // ============================================================
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ============================================================
    // ШАГ 2: Получить данные от widget
    // ============================================================
    
    const { clientId, sessionId, messages } = req.body;
    
    console.log(`🔵 Запрос от ${clientId} | session: ${sessionId}`);

    if (!clientId || !messages) {
      return res.status(400).json({ 
        error: "clientId и messages обязательны",
        received: { clientId, messages: messages ? 'OK' : 'missing' }
      });
    }

    // ============================================================
    // ШАГ 3: Загрузить конфиг клиента из Google Sheet
    // ============================================================
    
    console.log('📊 Читаем Google Sheet...');

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
      ],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByTitle['Authentication'];
    if (!sheet) {
      return res.status(500).json({ error: "Таблица повреждена" });
    }

    await sheet.loadCells();

    // Найти строку клиента
    const defaultRow = 1;
    let foundRow = null;

    for (let i = 0; i < sheet.rowCount; i++) {
      if (sheet.getCell(i, 0).value === clientId) {
        foundRow = i;
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ error: `Клиент ${clientId} не найден` });
    }

    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // === Прочитать данные клиента ===
    // A(0)=clientId B(1) C(2) D(3)=googleDocId E(4)=claudeKey
    // F(5)=tgToken G(6)=tgChatId H(7)=status I(8)=avatarUrl
    const status = get(7);           // Статус (active/inactive)
    const claudeKey = get(4);        // API ключ Claude
    const googleDocId = get(3);      // Google Doc с промптом
    const tgToken = get(5);          // Telegram токен
    const tgChatId = get(6);         // Telegram группа ID
    const avatarUrl = get(8);        // Аватарка

    console.log(`✅ Клиент найден в строке ${foundRow}`);

    // === Проверка обязательных данных ===
    if (status !== 'active') {
      return res.status(403).json({ error: "Агент отключен" });
    }

    if (!claudeKey) {
      return res.status(500).json({ error: "API ключ Claude не найден" });
    }

    // ============================================================
    // ШАГ 4: Получить статус ИИ из Firebase
    // ============================================================
    
    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;  // По умолчанию TRUE

    console.log(`🤖 ИИ включён: ${aiEnabled}`);

    // ============================================================
    // ШАГ 5: Создать уникальный номер диалога
    // ============================================================
    
    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();

    if (!dialogNum) {
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;
      await dialogNumRef.set(dialogNum);
      console.log(`🔢 Диалог №${dialogNum}`);
    }

    // ============================================================
    // ШАГ 6: Создать тему в Telegram (если нужна)
    // ============================================================
    
    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
        console.log('📱 Создаём тему в Telegram...');
        const topicRes = await fetch(`https://api.telegram.org/bot${tgToken}/createForumTopic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            name: `Диалог #${dialogNum} [${clientId}]`,
          })
        });
        const topicData = await topicRes.json();
        if (topicData.ok) {
          threadId = topicData.result.message_thread_id;
          await threadIdRef.set(threadId);
          console.log(`✅ Тема создана: ${threadId}`);
        }
      } catch (e) {
        console.error('❌ Ошибка создания темы:', e.message);
      }
    }

    // ============================================================
    // ШАГ 7: Отправить сообщение юзера в Telegram менеджеру
    // ============================================================
    
    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg && lastMsg.role === 'user' ? lastMsg.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        console.log('📤 Отправляем в Telegram...');

        const statusText = aiEnabled ? '🟢 ИИ активен' : '🔴 Менеджер отвечает';
        const tgText = `💬 Диалог #${dialogNum} [${clientId}]\n👤 Юзер: ${userText}\n\n${statusText}\nsession: ${sessionId}`;

        const keyboard = aiEnabled ? [[
          { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]] : [[
          { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]];

        const msgBody = {
          chat_id: tgChatId,
          text: tgText,
          reply_markup: { inline_keyboard: keyboard }
        };

        if (threadId) msgBody.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody)
        });

        console.log('✅ Сообщение в Telegram отправлено');

      } catch (e) {
        console.error('❌ Ошибка Telegram:', e.message);
      }
    }

    // ============================================================
    // ШАГ 8: Если ИИ выключен - отправляем WARNING в Telegram
    // ============================================================
    
    if (!aiEnabled) {
      console.log('⏸️ ИИ выключен, отправляем WARNING менеджеру');
      
      // НОВОЕ: Отправляем отдельное сообщение что ИИ ВЫКЛЮЧЕН
      if (tgToken && tgChatId) {
        try {
          const warningText = `⚠️ ВАЖНО! ИИ ВЫК.\n\n💬 Диалог #${dialogNum} [${clientId}]\n👤 Посититель пишет: ${userText}\n\n🔴 Отвечай через Reply!\nsession: ${sessionId}`;

          const warningBody = {
            chat_id: tgChatId,
            text: warningText,
          };

          if (threadId) warningBody.message_thread_id = threadId;

          await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(warningBody)
          });

          console.log('✅ WARNING об отключении ИИ отправлен в Telegram');

        } catch (e) {
          console.error('❌ Ошибка отправки WARNING:', e.message);
        }
      }
      
      // Возвращаем пусто - виджет будет ждать Reply менеджера
      return res.status(200).json({
        text: null,           // ← ПУСТО!
        aiDisabled: true,
        avatarUrl: avatarUrl
      });
    }

    // ============================================================
    // ШАГ 9: Если ИИ включён - читаем промпт из Google Doc
    // ============================================================
    
    let systemPrompt = "Ты полезный помощник";

    if (googleDocId) {
      try {
        console.log('📄 Читаем промпт из Google Doc...');
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')
            .join(''))
          .join('')
          .trim();

        console.log(`✅ Промпт загружен (${systemPrompt.length} символов)`);

      } catch (e) {
        console.error('❌ Ошибка промпта:', e.message);
      }
    }

    // ============================================================
    // ШАГ 10: Очистить историю для Claude
    // Claude принимает только role и content
    // ============================================================
    
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // ============================================================
    // ШАГ 11: Отправить в Claude AI
    // ============================================================
    
    console.log('🚀 Отправляем в Claude...');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: cleanMessages
      })
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error('❌ Ошибка Claude:', claudeData);
      return res.status(claudeResponse.status).json({
        error: "Ошибка Claude API",
        details: claudeData
      });
    }

    const botText = claudeData.content[0].text;
    console.log('✅ Claude ответил');

    // ============================================================
    // ШАГ 12: Отправить ответ ИИ в Telegram
    // ============================================================
    
    if (tgToken && tgChatId) {
      try {
        const replyBody = {
          chat_id: tgChatId,
          text: `🤖 ИИ ответил:\n${botText}`,
        };

        if (threadId) replyBody.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replyBody)
        });

        console.log('✅ Ответ в Telegram отправлен');

      } catch (e) {
        console.error('❌ Ошибка отправки ответа:', e.message);
      }
    }

    // ============================================================
    // ШАГ 13: Вернуть ответ виджету
    // ============================================================
    
    return res.status(200).json({
      text: botText,
      aiDisabled: false,
      avatarUrl: avatarUrl || null
    });

  } catch (error) {
    console.error('❌ Auth Error:', error.message);
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
