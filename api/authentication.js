// ============================================================
// ФАЙЛ: api/authentication.js (ИСПРАВЛЕННЫЙ)
// НАЗНАЧЕНИЕ: Главный API — обрабатывает сообщения юзера
// 1. Читает конфиг клиента из Google Sheets
// 2. Отправляет в Telegram (если включено)
// 3. Генерирует ответ через Claude AI
// 4. Возвращает ответ виджету
// ============================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// ============================================================
// БЛОК 1: Инициализация Firebase Admin SDK
// НАЗНАЧЕНИЕ: Подключаемся к Firebase для чтения/записи истории
// и управления статусом ИИ (включён/выключен)
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

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ: module.exports (обработчик HTTP запроса)
// ПАРАМЕТРЫ: req, res (стандартные Node.js параметры)
// ВОЗВРАЩАЕТ: JSON с ответом ИИ
// ============================================================

module.exports = async (req, res) => {
  // ============================================================
  // БЛОК 2: CORS заголовки
  // НАЗНАЧЕНИЕ: Разрешить запросы с любых сайтов
  // ============================================================
  res.setHeader('Access-Control-Allow-Origin', '*');  // Любой источник
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обрабатываем preflight запрос (браузер автоматически отправляет перед POST)
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ============================================================
    // БЛОК 3: Получаем данные от виджета
    // ============================================================
    const { clientId, sessionId, messages } = req.body;
    console.log('🔵 clientId:', clientId, 'sessionId:', sessionId);

    // Проверяем что все нужные данные пришли
    if (!clientId || !messages) {
      return res.status(400).json({ error: "clientId и messages обязательны" });
    }

    // ============================================================
    // БЛОК 4: Авторизация в Google Cloud
    // НАЗНАЧЕНИЕ: Подключаемся к Google Sheets и Google Docs
    // ============================================================
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',       // Доступ к таблице
        'https://www.googleapis.com/auth/documents.readonly'  // Доступ к промпту
      ],
    });

    // ============================================================
    // БЛОК 5: Загружаем конфиг клиента из Google Sheets
    // ============================================================
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();  // Загружаем информацию о таблице
    const sheet = doc.sheetsByTitle['Authentication'];  // Лист с ключами
    await sheet.loadCells();  // Загружаем все ячейки

    console.log('📊 Читаем таблицу...');

    // Строка 2 (индекс 1) содержит значения по умолчанию
    // Если у клиента поле пустое — берём значение из строки по умолчанию
    const defaultRow = 1;
    let foundRow = null;

    // ---- Ищем строку клиента по clientId в колонке A ----
    for (let i = 0; i < sheet.rowCount; i++) {
      const val = sheet.getCell(i, 0).value;  // Колонка A
      if (val === clientId) {
        foundRow = i;
        break;
      }
    }

    // Если клиента не нашли в таблице
    if (foundRow === null) {
      return res.status(404).json({ error: "Клиент не найден в таблице" });
    }

    console.log(`✅ Клиент найден в строке ${foundRow}`);

    // ---- Функция для чтения значений из таблицы ----
    // Если в строке клиента пусто — берём из строки по умолчанию
    const get = (col) => sheet.getCell(foundRow, col).value || sheet.getCell(defaultRow, col).value;

    // ============================================================
    // БЛОК 6: Читаем данные клиента из таблицы
    // ============================================================
    // Колонки (по буквам):
    // A (0) = clientId
    // B (1) = ?
    // C (2) = ?
    // D (3) = googleDocId (промпт)
    // E (4) = claudeKey (API ключ Claude)
    // F (5) = tgToken (токен Telegram)
    // G (6) = tgChatId (ID группы Telegram)
    // H (7) = status (active/inactive)
    // I (8) = avatarUrl (ссылка на аватарку)

    const status      = get(7);  // H — статус (active/inactive)
    const claudeKey   = get(4);  // E — API ключ Claude
    const googleDocId = get(3);  // D — ID Google Doc с промптом
    const avatarUrl   = get(8);  // I — ссылка на аватарку
    const tgToken     = get(5);  // F — токен Telegram
    const tgChatId    = get(6);  // G — ID Telegram группы

    console.log('📋 Данные клиента загружены');

    // ============================================================
    // БЛОК 7: Проверяем что клиент активен
    // ============================================================
    if (status !== 'active') {
      console.log('❌ Клиент не активен');
      return res.status(403).json({ error: "Агент не активен" });
    }

    // ============================================================
    // БЛОК 8: Проверяем наличие API ключа Claude
    // ============================================================
    if (!claudeKey) {
      console.log('❌ API ключ Claude не найден');
      return res.status(500).json({ error: "API ключ не найден" });
    }

    // ============================================================
    // БЛОК 9: Получаем статус ИИ из Firebase
    // НАЗНАЧЕНИЕ: Узнать включён ли ИИ для этого юзера
    // По умолчанию ИИ включён (true)
    // ============================================================
    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;  // Если null или undefined = true
    console.log('🤖 aiEnabled:', aiEnabled);

    // ============================================================
    // БЛОК 10: Получаем номер диалога (для Telegram)
    // НАЗНАЧЕНИЕ: Каждому диалогу даём уникальный номер
    // ============================================================
    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();

    // Если номера нет — создаём новый (счётчик всех диалогов)
    if (!dialogNum) {
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;  // Количество диалогов
      await dialogNumRef.set(dialogNum);
      console.log('🔢 Создан диалог № ' + dialogNum);
    }

    // ============================================================
    // БЛОК 11: Создаём или получаем тему в Telegram
    // НАЗНАЧЕНИЕ: Каждый юзер имеет свою тему в группе
    // Это нужно чтобы менеджер видел чаты по отдельности
    // ============================================================
    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    // Если темы нет и у нас есть данные Telegram
    if (!threadId && tgToken && tgChatId) {
      try {
        console.log('📱 Создаём новую тему в Telegram...');
        
        // Отправляем запрос в Telegram API
        const topicRes = await fetch(`https://api.telegram.org/bot${tgToken}/createForumTopic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            name: `Диалог #${dialogNum} [${clientId}]`,  // Название темы
          })
        });

        const topicData = await topicRes.json();
        
        // Если успешно создана
        if (topicData.ok) {
          threadId = topicData.result.message_thread_id;  // ID новой темы
          await threadIdRef.set(threadId);  // Сохраняем в Firebase
          console.log('✅ Создана тема:', threadId);
        } else {
          console.error('❌ Ошибка создания темы:', JSON.stringify(topicData));
          threadId = 1;  // Fallback - используем General тему
        }
      } catch (e) {
        console.error('❌ Ошибка создания темы:', e.message);
        threadId = 1;  // Fallback
      }
    }

    console.log('💬 threadId:', threadId);

    // ============================================================
    // БЛОК 12: Отправляем сообщение юзера в Telegram
    // НАЗНАЧЕНИЕ: Менеджер видит все сообщения юзеров
    // ============================================================

    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage && lastMessage.role === 'user' ? lastMessage.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        const statusText = aiEnabled ? '🟢 ИИ активен' : '🔴 Менеджер отвечает';
        const tgText = `👤 Юзер: ${userText}\n\n${statusText}\nsession: ${sessionId}`;

        // Кнопки для менеджера (зависят от статуса ИИ)
        const keyboard = aiEnabled ? [[
          { text: '🔴 Выключить ИИ', callback_data: `off|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]] : [[
          { text: '🟢 Включить ИИ', callback_data: `on|${clientId}|${sessionId}` },
          { text: '📜 История', callback_data: `history|${clientId}|${sessionId}` }
        ]];

        // Отправляем сообщение в тему юзера
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            message_thread_id: threadId,  // В ТЕМУ юзера
            text: tgText,
            reply_markup: { inline_keyboard: keyboard }
          })
        });
        console.log('✅ Сообщение отправлено в Telegram');
      } catch (e) {
        console.error('❌ Ошибка отправки в Telegram:', e.message);
      }
    }

    // ============================================================
    // БЛОК 13: Проверяем включён ли ИИ
    // Если ИИ выключен — менеджер ответит вручную
    // ============================================================
    if (!aiEnabled) {
      console.log('⏸️ ИИ выключен — менеджер отвечает вручную');
      return res.status(200).json({ 
        text: null,           // Нет ответа от ИИ
        aiDisabled: true,     // Флаг что ИИ выключен
        avatarUrl: avatarUrl  // Аватарка бота
      });
    }

    // ============================================================
    // БЛОК 14: Читаем промпт из Google Doc
    // НАЗНАЧЕНИЕ: Это инструкции для Claude (система)
    // ============================================================
    let systemPrompt = "Ты полезный ИИ ассистент";
    
    if (googleDocId) {
      try {
        console.log('📄 Загружаем промпт из Google Doc...');
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        
        // Извлекаем текст из документа
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)  // Только параграфы
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')  // Текст из элементов
            .join(''))
          .join('')  // Объединяем все параграфы
          .trim();
        
        console.log('✅ Промпт загружен, длина:', systemPrompt.length);
      } catch (e) {
        console.error('❌ Ошибка чтения промпта:', e.message);
        // Используем промпт по умолчанию
      }
    }

    // ============================================================
    // БЛОК 15: Очищаем историю перед отправкой в Claude
    // НАЗНАЧЕНИЕ: Claude принимает только role и content
    // ============================================================
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // ============================================================
    // БЛОК 16: Отправляем запрос в Claude AI
    // НАЗНАЧЕНИЕ: Генерируем ответ на основе истории и промпта
    // ============================================================
    console.log('🚀 Отправляем в Claude...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",  // Быстрая и дешёвая модель
        max_tokens: 1024,                     // Максимум 1024 символов в ответе
        system: systemPrompt,                 // Инструкции для Claude
        messages: cleanMessages               // История переписки
      })
    });

    const data = await response.json();

    // Проверяем успешность запроса
    if (!response.ok) {
      console.error('❌ Ошибка Claude:', data);
      return res.status(response.status).json({ 
        error: "Ошибка Claude API", 
        details: data 
      });
    }

    const botText = data.content[0].text;
    console.log('✅ Claude ответил:', botText.substring(0, 50) + '...');

    // ============================================================
    // БЛОК 17: Отправляем ответ ИИ в Telegram
    // НАЗНАЧЕНИЕ: Менеджер видит что ответил ИИ
    // ============================================================
    if (tgToken && tgChatId) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            message_thread_id: threadId,  // В тему юзера
            text: `🤖 ИИ ответил:\n${botText}`,
          })
        });
        console.log('✅ Ответ отправлен в Telegram');
      } catch (e) {
        console.error('❌ Ошибка отправки ответа:', e.message);
      }
    }

    // ============================================================
    // БЛОК 18: Возвращаем ответ виджету
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
