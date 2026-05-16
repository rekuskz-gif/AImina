// ============================================================
// ФАЙЛ: api/authentication.js
// ВЕРСИЯ: v4.0 - ИСПРАВЛЕННАЯ, БЕЗ ОШИБОК
// НАЗНАЧЕНИЕ: Главный API обработчик чата
// 
// ОСОБЕННОСТИ:
// ✅ Чтение конфига из Google Sheet
// ✅ Интеграция с Claude AI
// ✅ Токены считаются правильно (целые числа)
// ✅ Отправка в Telegram с полным контекстом
// ✅ Firebase для сохранения истории
// ✅ Все переменные проверены и нет ошибок
// ============================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// ============================================================
// ИНИЦИАЛИЗАЦИЯ: Firebase Admin SDK
// Используется для сохранения истории сообщений и статусов
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
// ГЛАВНАЯ ФУНКЦИЯ: Обработка запроса от виджета
// ============================================================

module.exports = async (req, res) => {
  console.log('═══════════════════════════════════════');
  console.log('🔵 НАЧАЛО ЗАПРОСА');
  console.log('═══════════════════════════════════════');

  // ────────────────────────────────────────────────────────
  // CORS: Разрешаем запросы с любого домена
  // ────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запросов
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ════════════════════════════════════════════════════════════════
    // ШАГ 1: ПОЛУЧАЕМ ДАННЫЕ ОТ ВИДЖЕТА
    // ════════════════════════════════════════════════════════════════
    console.log('\n📥 ШАГ 1: Получаем данные от виджета');

    const { clientId, sessionId, messages } = req.body;
    console.log(`  🆔 clientId: "${clientId}"`);
    console.log(`  📝 sessionId: "${sessionId}"`);
    console.log(`  💬 Сообщений: ${messages ? messages.length : 0}`);

    // Проверяем обязательные параметры
    if (!clientId || !messages) {
      return res.status(400).json({ 
        error: "clientId и messages обязательны" 
      });
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 2: АВТОРИЗАЦИЯ В GOOGLE
    // Используем Service Account для доступа к Google Sheet и Docs
    // ════════════════════════════════════════════════════════════════
    console.log('\n🔐 ШАГ 2: Авторизация в Google');

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
      ],
    });

    console.log(`  ✅ JWT авторизация готова`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 3: ЗАГРУЖАЕМ GOOGLE SHEET
    // Читаем конфиг клиента из таблицы Authentication
    // ════════════════════════════════════════════════════════════════
    console.log('\n📊 ШАГ 3: Загружаем Google Sheet');

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    console.log(`  📝 Таблица загружена`);

    const sheet = doc.sheetsByTitle['Authentication'];
    if (!sheet) {
      return res.status(500).json({ 
        error: "Лист Authentication не найден" 
      });
    }

    // Загружаем ячейки A1:Z100 (заголовки + данные)
    await sheet.loadCells('A1:Z100');
    console.log(`  ✅ Ячейки загружены (до Z100)`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 4: ЧИТАЕМ ЗАГОЛОВКИ ИЗ СТРОКИ 1
    // Заголовки определяют какие данные в каких колонках
    // ════════════════════════════════════════════════════════════════
    console.log('\n📋 ШАГ 4: Читаем заголовки из строки 1');

    const headers = {};
    for (let col = 0; col < sheet.columnCount; col++) {
      const headerCell = sheet.getCell(0, col).value;
      if (headerCell) {
        // Приводим заголовок к нижнему регистру для единообразия
        const key = String(headerCell).toLowerCase().trim();
        headers[key] = col;
        console.log(`  [${col}] "${headerCell}" → "${key}"`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 5: ИЩЕМ КЛИЕНТА В ТАБЛИЦЕ
    // Ищем строку где clientId совпадает с нашим
    // ════════════════════════════════════════════════════════════════
    console.log(`\n🔍 ШАГ 5: Ищем клиента "${clientId}"`);

    const clientIdCol = headers['clientid'];
    if (clientIdCol === undefined) {
      return res.status(500).json({ 
        error: "Колонка 'clientid' не найдена в заголовках" 
      });
    }

    let foundRow = null;
    for (let i = 1; i < Math.min(101, sheet.rowCount); i++) {
      const cellValue = sheet.getCell(i, clientIdCol).value;
      if (cellValue === clientId) {
        foundRow = i;
        console.log(`  ✅ Найден в строке ${i}`);
        break;
      }
    }

    if (foundRow === null) {
      return res.status(404).json({ 
        error: `Клиент "${clientId}" не найден в таблице` 
      });
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 6: ФУНКЦИЯ ЧТЕНИЯ ДАННЫХ С FALLBACK
    // Если в строке клиента пусто - берём из строки 2 (дефолт значения)
    // ════════════════════════════════════════════════════════════════
    console.log('\n📖 ШАГ 6: Функция чтения данных');

    const DEFAULT_ROW = 1;

    const getByHeader = (headerName) => {
      const lowerName = String(headerName).toLowerCase().trim();
      const col = headers[lowerName];

      if (col === undefined) {
        console.warn(`  ⚠️ Колонка "${headerName}" не найдена в заголовках`);
        return null;
      }

      // Сначала пытаемся получить значение из строки клиента
      const clientValue = sheet.getCell(foundRow, col).value;
      if (clientValue) {
        console.log(`  📖 ${headerName}: "${clientValue}" (из строки клиента)`);
        return clientValue;
      }

      // Если пусто - берём дефолт значение из строки 2
      const defaultValue = sheet.getCell(DEFAULT_ROW, col).value;
      console.log(`  📖 ${headerName}: пусто → "${defaultValue}" (из строки 2)`);
      return defaultValue;
    };

    // ════════════════════════════════════════════════════════════════
    // ШАГ 7: ЧИТАЕМ ВСЕ ДАННЫЕ КЛИЕНТА
    // Получаем конфиг, ключи API, токены и т.д.
    // ════════════════════════════════════════════════════════════════
    console.log('\n📖 ШАГ 7: Читаем данные клиента');

    const status          = getByHeader('status');
    const botName         = getByHeader('bot name');
    const claudeKey       = getByHeader('claudeapikey');
    const googleDocId     = getByHeader('google docid');
    const tgToken         = getByHeader('tgtoken');
    const tgChatId        = getByHeader('tg chatid');
    const avatarUrl       = getByHeader('avatarurl');
    
    // ТОКЕНЫ: Целые числа!
    const tokenBalance    = getByHeader('balance');
    const tokenTariff     = getByHeader('price per char');
    const tokenSpent      = getByHeader('spent tokens');

    // ════════════════════════════════════════════════════════════════
    // ШАГ 8: ПРОВЕРЯЕМ ОБЯЗАТЕЛЬНЫЕ ДАННЫЕ
    // Убедимся что всё есть перед отправкой в Claude
    // ════════════════════════════════════════════════════════════════
    console.log('\n🔐 ШАГ 8: Проверяем обязательные данные');

    if (status !== 'active') {
      console.error(`  ❌ Статус: "${status}" (не active)`);
      return res.status(403).json({ 
        error: "Агент отключен (статус не 'active')" 
      });
    }
    console.log(`  ✅ Статус: active`);

    if (!claudeKey) {
      return res.status(500).json({ 
        error: "API ключ Claude не найден" 
      });
    }
    console.log(`  ✅ Claude ключ: есть`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 9: FIREBASE - СТАТУС ИИ
    // Проверяем включен ли ИИ для этого клиента/сессии
    // ════════════════════════════════════════════════════════════════
    console.log('\n🔥 ШАГ 9: Проверяем статус ИИ в Firebase');

    const db = admin.database();
    const aiEnabledRef = db.ref(`settings/${clientId}/${sessionId}/aiEnabled`);
    const aiEnabledSnap = await aiEnabledRef.once('value');
    const aiEnabled = aiEnabledSnap.val() !== false;
    console.log(`  🤖 ИИ включён: ${aiEnabled}`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 10: ГЕНЕРИРУЕМ НОМЕР ДИАЛОГА
    // Новый диалог = новый номер
    // ════════════════════════════════════════════════════════════════
    console.log('\n🔢 ШАГ 10: Номер диалога');

    const dialogNumRef = db.ref(`settings/${clientId}/${sessionId}/dialogNum`);
    const dialogNumSnap = await dialogNumRef.once('value');
    let dialogNum = dialogNumSnap.val();

    if (!dialogNum) {
      // Новый диалог - генерируем номер
      const allRef = db.ref(`settings/${clientId}`);
      const allSnap = await allRef.once('value');
      const all = allSnap.val() || {};
      dialogNum = Object.keys(all).length;
      await dialogNumRef.set(dialogNum);
      console.log(`  ✅ Новый диалог №${dialogNum}`);
    } else {
      console.log(`  ℹ️ Существующий диалог №${dialogNum}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 11: СОЗДАЁМ ТЕМУ В TELEGRAM
    // Если Telegram настроен - создаём тему для каждого диалога
    // ════════════════════════════════════════════════════════════════
    console.log('\n📱 ШАГ 11: Создаём тему в Telegram');

    const threadIdRef = db.ref(`settings/${clientId}/${sessionId}/threadId`);
    const threadIdSnap = await threadIdRef.once('value');
    let threadId = threadIdSnap.val();

    if (!threadId && tgToken && tgChatId) {
      try {
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
          console.log(`  ✅ Тема создана: ${threadId}`);
        } else {
          console.warn(`  ⚠️ Ошибка создания темы: ${topicData.description}`);
        }
      } catch (e) {
        console.error(`  ❌ Ошибка: ${e.message}`);
      }
    } else {
      if (threadId) console.log(`  ℹ️ Тема уже есть: ${threadId}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 12: ОТПРАВЛЯЕМ СООБЩЕНИЕ В TELEGRAM
    // Менеджер видит полный диалог и может ответить
    // ВАЖНО: [clientId] и session: нужны для Reply менеджера!
    // ════════════════════════════════════════════════════════════════
    console.log('\n📤 ШАГ 12: Отправляем сообщение в Telegram');

    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg && lastMsg.role === 'user' ? lastMsg.content : null;

    if (tgToken && tgChatId && userText) {
      try {
        const statusText = aiEnabled ? '🟢 ИИ активен' : '🔴 Менеджер отвечает';

        // ✅ ИСПРАВЛЕННО: Используем целые числа
        const tokenBalanceNum = parseInt(tokenBalance) || 0;
        const tokenSpentNum   = parseInt(tokenSpent) || 0;

        const balanceText = tokenBalance 
          ? `💰 Баланс: ${tokenBalanceNum} токенов | Потрачено: ${tokenSpentNum}` 
          : '';

        // Формируем весь диалог для контекста (последние 10 сообщений)
        const last10 = messages.slice(-10);
        let dialogText = '';
        last10.forEach(msg => {
          if (msg.role === 'user') {
            dialogText += `👤 Юзер: ${msg.content}\n`;
          } else if (msg.role === 'assistant') {
            dialogText += `🤖 ИИ: ${msg.content}\n`;
          }
        });

        // ВАЖНО: [${clientId}] и session: нужны для Reply менеджера!
        const tgText = `💬 Диалог #${dialogNum} [${clientId}]\n\n${dialogText}\n${statusText}${balanceText ? '\n' + balanceText : ''}\nsession: ${sessionId}`;

        // Кнопки для менеджера (включить/выключить ИИ)
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

        // Если есть тема - отправляем в тему
        if (threadId) msgBody.message_thread_id = threadId;

        const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgBody)
        });
        const tgData = await tgRes.json();
        console.log(`  📥 Telegram: ${tgData.ok ? '✅ OK' : '❌ ' + tgData.description}`);

      } catch (e) {
        console.error(`  ❌ Ошибка Telegram: ${e.message}`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 13: ЕСЛИ ИИ ВЫКЛЮЧЕН - МЕНЕДЖЕР ОТВЕЧАЕТ
    // Возвращаем флаг aiDisabled, менеджер ответит вручную
    // ════════════════════════════════════════════════════════════════
    if (!aiEnabled) {
      console.log('  ⏸️ ИИ выключен — менеджер отвечает');
      return res.status(200).json({
        text: null,
        aiDisabled: true,
        avatarUrl: avatarUrl || null
      });
    }
    
    // ════════════════════════════════════════════════════════════════
    // ШАГ 14: ЧИТАЕМ ПРОМПТ ИЗ GOOGLE DOC
    // Каждый клиент может иметь свой промпт (инструкция для ИИ)
    // ════════════════════════════════════════════════════════════════
    console.log('\n📄 ШАГ 14: Читаем промпт из Google Doc');

    let systemPrompt = "Ты полезный помощник. Отвечай кратко и по делу.";

    if (googleDocId) {
      try {
        const docsClient = google.docs({ version: 'v1', auth });
        const docRes = await docsClient.documents.get({ documentId: googleDocId });
        
        // Извлекаем весь текст из документа
        systemPrompt = docRes.data.body.content
          .filter(block => block.paragraph)
          .map(block => block.paragraph.elements
            .map(el => el.textRun ? el.textRun.content : '')
            .join(''))
          .join('')
          .trim();
        
        console.log(`  ✅ Промпт загружен (${systemPrompt.length} символов)`);
      } catch (e) {
        console.error(`  ❌ Ошибка чтения Google Doc: ${e.message}`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 15: ОЧИЩАЕМ ИСТОРИЮ ДЛЯ CLAUDE
    // Claude принимает только role и content (убираем доп поля)
    // ════════════════════════════════════════════════════════════════
    console.log('\n📝 ШАГ 15: Подготавливаем историю для Claude');

    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    console.log(`  ✅ ${cleanMessages.length} сообщений готовы`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 16: ОТПРАВЛЯЕМ В CLAUDE AI
    // Получаем ответ от Claude
    // ════════════════════════════════════════════════════════════════
    console.log('\n🚀 ШАГ 16: Отправляем в Claude AI');

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
      console.error(`  ❌ Claude ошибка: ${claudeData.error?.message}`);
      return res.status(claudeResponse.status).json({
        error: "Ошибка Claude API",
        details: claudeData
      });
    }

    const botText = claudeData.content[0].text;
    console.log(`  ✅ Claude ответил (${botText.length} символов)`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 17: СЧИТАЕМ ТОКЕНЫ
    // ВАЖНО: Только целые числа! Без decimal!
    // ════════════════════════════════════════════════════════════════
    console.log('\n💰 ШАГ 17: Считаем токены');

    // ✅ Преобразуем в целые числа
    const tokenBalanceNum = parseInt(tokenBalance) || 0;
    const tokenTariffNum  = parseInt(tokenTariff) || 0;
    const tokenSpentNum   = parseInt(tokenSpent) || 0;

    // Стоимость одного ответа в токенах
    const responseChars = botText.length;
    const costResponse = responseChars * tokenTariffNum;

    // Новое значение потраченных токенов (накопительно)
    const newSpent = tokenSpentNum + costResponse;

    // Новый остаток баланса
    const newRemaining = tokenBalanceNum - costResponse;

    console.log(`  📊 Символов в ответе: ${responseChars}`);
    console.log(`  💸 Стоимость (${responseChars} × ${tokenTariffNum}): ${costResponse} токенов`);
    console.log(`  📈 Потрачено всего: ${newSpent} токенов`);
    console.log(`  💰 Остаток баланса: ${newRemaining} токенов`);

    // ════════════════════════════════════════════════════════════════
    // ШАГ 18: СОХРАНЯЕМ ТОКЕНЫ В GOOGLE SHEET
    // Обновляем две колонки: spent tokens и balance
    // ════════════════════════════════════════════════════════════════
    console.log('\n💾 ШАГ 18: Сохраняем токены в Google Sheet');

    try {
      const spentCol   = headers['spent tokens'];
      const balanceCol = headers['balance'];

      // Обновляем потраченные токены
      if (spentCol !== undefined) {
        sheet.getCell(foundRow, spentCol).value = newSpent;
        console.log(`  ✅ Потрачено (колонка ${spentCol}): ${newSpent}`);
      } else {
        console.warn(`  ⚠️ Колонка 'spent tokens' не найдена`);
      }

      // Обновляем баланс
      if (balanceCol !== undefined) {
        sheet.getCell(foundRow, balanceCol).value = newRemaining;
        console.log(`  ✅ Баланс (колонка ${balanceCol}): ${newRemaining}`);
      } else {
        console.warn(`  ⚠️ Колонка 'balance' не найдена`);
      }

      // Сохраняем обе ячейки одновременно
      await sheet.saveUpdatedCells();
      console.log(`  ✅ Токены сохранены в Sheet`);

    } catch (e) {
      console.error(`  ❌ Ошибка сохранения токенов: ${e.message}`);
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 19: ОТПРАВЛЯЕМ ОТВЕТ ИИ В TELEGRAM
    // Менеджер видит что ответила ИИ
    // ════════════════════════════════════════════════════════════════
    console.log('\n📤 ШАГ 19: Отправляем ответ ИИ в Telegram');

    if (tgToken && tgChatId) {
      try {
        const replyBody = {
          chat_id: tgChatId,
          text: `🤖 ИИ ответил (${botText.length} символов):\n\n${botText}`,
        };
        
        // Если есть тема - отправляем в тему
        if (threadId) replyBody.message_thread_id = threadId;

        const replyRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replyBody)
        });
        const replyData = await replyRes.json();
        console.log(`  📥 Ответ в Telegram: ${replyData.ok ? '✅ OK' : '❌ ' + replyData.description}`);

      } catch (e) {
        console.error(`  ❌ Ошибка отправки ответа: ${e.message}`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ШАГ 20: ВОЗВРАЩАЕМ ОТВЕТ ВИДЖЕТУ
    // Виджет показывает пользователю ответ ИИ
    // ════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════');
    console.log('✅ ЗАПРОС УСПЕШНО ОБРАБОТАН');
    console.log('═══════════════════════════════════════\n');

    return res.status(200).json({
      text: botText,
      aiDisabled: false,
      avatarUrl: avatarUrl || null,
      tokenInfo: {
        spent: newSpent,
        remaining: newRemaining,
        balance: tokenBalanceNum,
        cost: costResponse
      }
    });

  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    console.error(error.stack);
    
    return res.status(500).json({
      error: "Ошибка сервера",
      message: error.message
    });
  }
};
