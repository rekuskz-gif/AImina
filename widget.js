// ============================================================
// ФАЙЛ: widget.js
// 
// НАЗНАЧЕНИЕ: Главный виджет - кнопка чата для сайта клиента
// 
// ЧТО ДЕЛАЕТ:
// 1. Загружает Firebase SDK
// 2. Запрашивает ВСЕ конфиги из /api/get_full_config
// 3. Создаёт круглую кнопку в правом нижнем углу
// 4. При клике открывает панель чата
// 5. Отправляет сообщения на сервер (/api/authentication)
// 6. Отображает ответы (ИИ или менеджера)
// 7. Синхронизирует историю через Firebase
// 
// КАК ИСПОЛЬЗУЕТ КЛИЕНТ:
// <script>
//   const CLIENT_ID = "mina_001";
// </script>
// <script src="https://ai--mina.vercel.app/widget.js"></script>
// 
// ПЕРЕМЕННЫЕ которые должны быть ПЕРЕД подключением widget.js:
// - CLIENT_ID (обязательно!)
// ============================================================

(function() {
  'use strict';

  // ============================================================
  // БЛОК 1: Получить CLIENT_ID из переменной на сайте
  // ============================================================
  
  // Проверяем что CLIENT_ID определен
  if (typeof CLIENT_ID === 'undefined') {
    console.error('❌ CLIENT_ID не определён! Добавьте перед widget.js:');
    console.error('   const CLIENT_ID = "mina_001";');
    return;
  }

  console.log(`🎯 Инициализируем widget для: ${CLIENT_ID}`);

  const clientId = CLIENT_ID;
  const backendUrl = 'https://ai--mina.vercel.app';

  // ============================================================
  // БЛОК 2: Переменные состояния
  // ============================================================
  
  let globalConfig = null;        // Конфиг загруженный с сервера
  let firebase = null;            // Firebase глобальный объект
  let db = null;                  // Firebase Realtime Database
  let sessionId = null;           // Уникальный ID браузера
  let chatHistory = [];           // История всех сообщений
  let isOpen = false;             // Открыта ли панель?
  let isLoading = false;          // Отправляется ли сообщение?
  let panel = null;               // Элемент панели чата
  let historyUnsubscribe = null;  // Функция отписки от Firebase слушателя

  // ============================================================
  // БЛОК 3: Функция getSessionId()
  // Создаёт уникальный ID для каждого браузера
  // ============================================================
  
  function getSessionId() {
    let id = localStorage.getItem(`aimina_session_${clientId}`);
    
    if (!id) {
      // Формат: user_abc123def456_1609459200000
      id = 'user_' + 
           Math.random().toString(36).substr(2, 9) + 
           '_' + 
           Date.now();
      localStorage.setItem(`aimina_session_${clientId}`, id);
      console.log(`✅ Создан новый sessionId: ${id}`);
    }
    
    return id;
  }

  // ============================================================
  // БЛОК 4: Функция loadScript()
  // Динамически загружает JavaScript файлы
  // ============================================================
  
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ============================================================
  // БЛОК 5: Функция addMsg()
  // Добавляет сообщение в чат
  // ============================================================
  
  function addMsg(text, type) {
    const msgs = document.getElementById('amina-messages');
    if (!msgs) return;
    
    const div = document.createElement('div');
    div.className = `amina-msg ${type}`;
    div.innerText = text;
    msgs.appendChild(div);
    
    // Прокручиваем вниз
    setTimeout(() => {
      msgs.scrollTop = msgs.scrollHeight;
    }, 10);
  }

  // ============================================================
  // БЛОК 6: Функция openPanel()
  // Открывает панель чата
  // ============================================================
  
  async function openPanel() {
    if (isOpen) return;
    isOpen = true;
    console.log('🔓 Открываем панель');

    // Скрываем красный значок уведомления
    const badge = document.getElementById('amina-badge');
    if (badge) badge.style.display = 'none';

    // Создаём HTML панели
    panel = document.createElement('div');
    panel.className = 'amina-panel';
    panel.innerHTML = `
      <div class="amina-panel-header">
        <img src="${globalConfig.widgetDesign.avatarUrl}" onerror="this.style.display='none'">
        <span class="amina-panel-header-name">${globalConfig.widgetDesign.botName}</span>
        <button class="amina-panel-close" id="amina-close">✕</button>
      </div>
      <div class="amina-messages" id="amina-messages"></div>
      <div class="amina-input-area">
        <input class="amina-input" id="amina-input" placeholder="Введите сообщение...">
        <button class="amina-send" id="amina-send">→</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Показываем историю или приветствие
    if (chatHistory.length > 0) {
      console.log(`📚 Показываем ${chatHistory.length} сообщений`);
      chatHistory.forEach(msg => {
        if (msg && msg.role !== 'system') {
          const type = msg.fromManager ? 'manager' : 
                      (msg.role === 'assistant' ? 'bot' : 'user');
          addMsg(msg.content, type);
        }
      });
    } else {
      // История пустая - показываем приветствие
      const welcome = globalConfig.chatDesign.welcomeMsg || 'Привет! Как дела?';
      addMsg(welcome, 'bot');
      // ❌ НЕ сохраняем приветствие в историю
      // chatHistory.push({ role: 'assistant', content: welcome });
      // saveHistory();
    }

    // Обработчики событий
    document.getElementById('amina-close').onclick = closePanel;
    document.getElementById('amina-send').onclick = sendMsg;
    document.getElementById('amina-input').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMsg();
    });

    // Слушаем обновления из Firebase (для ответов менеджера)
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    
    historyUnsubscribe = historyRef.on('value', (snap) => {
      if (!snap.exists()) return;
      
      const val = snap.val();
      const newHistory = Array.isArray(val) ? val : [];

      // Если появились новые сообщения
      if (newHistory.length > chatHistory.length) {
        const newMessages = newHistory.slice(chatHistory.length);
        chatHistory = newHistory;

        // Показываем только новые сообщения (от менеджера)
        newMessages.forEach(msg => {
          if (msg && msg.fromManager) {
            console.log('💬 Менеджер ответил');
            addMsg(msg.content, 'manager');
          }
        });
      }
    });
  }

  // ============================================================
  // БЛОК 7: Функция closePanel()
  // Закрывает панель чата
  // ============================================================
  
  function closePanel() {
    if (!panel) return;
    console.log('🔒 Закрываем панель');
    
    isOpen = false;
    panel.classList.add('closing');
    
    // Отписываемся от Firebase
    if (historyUnsubscribe) {
      historyUnsubscribe();
      historyUnsubscribe = null;
    }
    
    setTimeout(() => {
      panel.remove();
      panel = null;
    }, 300);
  }

  // ============================================================
  // БЛОК 8: Функция saveHistory()
  // Сохраняет историю в Firebase
  // ============================================================
  
  function saveHistory() {
    const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
    historyRef.set(chatHistory).catch(err => {
      console.error('❌ Ошибка сохранения:', err);
    });
  }

  // ============================================================
  // БЛОК 9: Функция sendMsg()
  // ГЛАВНАЯ: Отправляет сообщение юзера
  // ============================================================
  
  async function sendMsg() {
    if (isLoading) return;
    
    const input = document.getElementById('amina-input');
    const sendBtn = document.getElementById('amina-send');
    const text = input.value.trim();
    
    if (!text) return;
    
    console.log('✉️ Отправляем:', text.substring(0, 50));

    // ❌ НЕ ПОКАЗЫВАЕМ сообщение юзера в чате!
    // Оно отправляется менеджеру в Telegram
    
    input.value = '';
    
    // Сохраняем в историю
    chatHistory.push({ role: 'user', content: text });
    saveHistory();

    // Показываем анимацию печати
    const typingDiv = document.createElement('div');
    typingDiv.className = 'amina-typing';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    document.getElementById('amina-messages').appendChild(typingDiv);
    document.getElementById('amina-messages').scrollTop = 
      document.getElementById('amina-messages').scrollHeight;

    // Блокируем кнопку
    isLoading = true;
    sendBtn.disabled = true;
    input.disabled = true;

    try {
      console.log('🚀 Отправляем на сервер...');
      
      const response = await fetch(`${backendUrl}/api/authentication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId, 
          sessionId, 
          messages: chatHistory 
        })
      });

      typingDiv.remove();
      const result = await response.json();

      // ✅ Если ИИ выключен - менеджер отвечает
      if (result.aiDisabled) {
        console.log('⏸️ ИИ выключен, ожидаем ответа менеджера');
        // ❌ НЕ показываем сообщение на сайте!
        // addMsg('🔴 Менеджер ответит вам в ближайшее время...', 'bot');
        
        // ✅ ПРОСТО ЖДЁМ ответа менеджера в Firebase (он придёт через Reply)
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'API error');
      }

      // ✅ Показываем ТОЛЬКО ОТВЕТ ИИ
      if (result.text) {
        console.log('🤖 ИИ ответил');
        addMsg(result.text, 'bot');
        chatHistory.push({ role: 'assistant', content: result.text });
        saveHistory();
      }

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      typingDiv.remove();
      addMsg(`❌ Ошибка: ${error.message}`, 'bot');
      chatHistory.pop(); // Удаляем неудачное сообщение
      
    } finally {
      typingDiv.remove();
      isLoading = false;
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  // ============================================================
  // БЛОК 10: Функция applyStyles()
  // Создаёт CSS стили для виджета
  // ============================================================
  
  function applyStyles() {
    const style = document.createElement('style');
    const c = globalConfig;
    
    style.textContent = `
      /* Анимация пульса кнопки */
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 ${c.widgetDesign.colorStart}B3; }
        70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
        100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
      }

      /* Панель входит справа */
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      /* Панель выходит справа */
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }

      /* Сообщение появляется */
      @keyframes fadeInMsg {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Анимация печати */
      @keyframes typingDot {
        0%, 60%, 100% { opacity: 0.3; }
        30% { opacity: 1; }
      }

      /* Контейнер виджета (кнопка + лейбл) */
      .amina-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      /* Круглая кнопка */
      .amina-btn {
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${c.widgetDesign.colorStart}, ${c.widgetDesign.colorEnd});
        border: none;
        cursor: pointer;
        padding: 0;
        animation: pulse 2s infinite;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        position: relative;
        transition: transform 0.2s;
        flex-shrink: 0;
      }

      .amina-btn:hover {
        transform: scale(1.05);
      }

      .amina-btn img {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        object-fit: cover;
      }

      /* Красный значок уведомления */
      .amina-badge {
        position: absolute;
        top: 0;
        right: 0;
        background: red;
        color: white;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 12px;
        font-weight: bold;
        display: none;
        align-items: center;
        justify-content: center;
      }

      /* Текст рядом с кнопкой */
      .amina-label {
        background: #ffffff;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: bold;
        color: #333333;
        max-width: 200px;
        opacity: 0;
        transition: all 0.5s;
        cursor: pointer;
        flex-shrink: 0;
      }

      .amina-label.visible {
        opacity: 1;
      }

      /* Панель чата (основное окно) */
      .amina-panel {
        position: fixed;
        bottom: 0;
        right: 0;
        width: 380px;
        height: 580px;
        background: white;
        border-radius: 16px 16px 0 0;
        box-shadow: 0 -4px 30px rgba(0,0,0,0.15);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideIn 0.3s ease;
        font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      }

      .amina-panel.closing {
        animation: slideOut 0.3s ease forwards;
      }

      /* Шапка панели */
      .amina-panel-header {
        padding: 14px 16px;
        background: linear-gradient(135deg, ${c.widgetDesign.colorStart}, ${c.widgetDesign.colorEnd});
        color: white;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }

      .amina-panel-header img {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.4);
        object-fit: cover;
      }

      .amina-panel-header-name {
        font-weight: bold;
        font-size: 15px;
        flex: 1;
      }

      /* Кнопка закрытия */
      .amina-panel-close {
        background: none;
        border: none;
        color: white;
        font-size: 22px;
        cursor: pointer;
        padding: 0;
        opacity: 0.8;
        transition: opacity 0.2s;
      }

      .amina-panel-close:hover {
        opacity: 1;
      }

      /* Область сообщений */
      .amina-messages {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: #f0f2f5;
      }

      /* Одно сообщение */
      .amina-msg {
        padding: 10px 14px;
        border-radius: 18px;
        max-width: 80%;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
        animation: fadeInMsg 0.3s ease;
      }

      /* Сообщение бота (белое, слева) */
      .amina-msg.bot {
        align-self: flex-start;
        background: white;
        color: #333;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
      }

      /* Сообщение менеджера (синее, слева) */
      .amina-msg.manager {
        align-self: flex-start;
        background: #e3f2fd;
        color: #333;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        border-left: 3px solid #2196F3;
      }

      /* Анимация печати */
      .amina-typing {
        display: flex;
        gap: 4px;
        align-self: flex-start;
        padding: 12px 16px;
        background: white;
        border-radius: 18px;
        border-bottom-left-radius: 4px;
      }

      .amina-typing span {
        width: 7px;
        height: 7px;
        background: #999;
        border-radius: 50%;
        animation: typingDot 1.4s infinite;
      }

      .amina-typing span:nth-child(2) { animation-delay: 0.2s; }
      .amina-typing span:nth-child(3) { animation-delay: 0.4s; }

      /* Область ввода */
      .amina-input-area {
        padding: 12px;
        background: white;
        display: flex;
        gap: 8px;
        border-top: 1px solid #eee;
        flex-shrink: 0;
      }

      /* Инпут */
      .amina-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #ddd;
        border-radius: 22px;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        transition: border-color 0.2s;
      }

      .amina-input:focus {
        border-color: ${c.widgetDesign.colorStart};
      }

      /* Кнопка отправки */
      .amina-send {
        border: none;
        background: linear-gradient(135deg, ${c.widgetDesign.colorStart}, ${c.widgetDesign.colorEnd});
        color: white;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        transition: opacity 0.2s;
      }

      .amina-send:hover {
        opacity: 0.9;
      }

      .amina-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    
    document.head.appendChild(style);
    console.log('✅ Стили применены');
  }

  // ============================================================
  // БЛОК 11: Главная функция инициализации initWidget()
  // ============================================================
  
  async function initWidget() {
    try {
      console.log('📦 Инициализируем виджет...');

      // === ШАГ 1: Запрашиваем ВСЮ конфигурацию с сервера ===
      console.log('⚙️ Загружаем конфиг...');
      
      const configResponse = await fetch(`${backendUrl}/api/get_full_config?clientId=${clientId}`);
      
      if (!configResponse.ok) {
        const error = await configResponse.json();
        throw new Error(error.error || 'Ошибка загрузки конфига');
      }

      globalConfig = await configResponse.json();
      console.log('✅ Конфиг загружен:', globalConfig);

      // === ШАГ 2: Загружаем Firebase ===
      console.log('📦 Загружаем Firebase...');
      
      await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(globalConfig.firebase);
      }
      
      db = window.firebase.database();
      console.log('✅ Firebase инициализирован');

      // === ШАГ 3: Создаём sessionId ===
      sessionId = getSessionId();
      const historyRef = db.ref(`chats/${clientId}/${sessionId}`);

      // === ШАГ 4: Загружаем историю из Firebase ===
      console.log('📚 Загружаем историю...');
      
      const snapshot = await historyRef.once('value');
      if (snapshot.exists()) {
        const val = snapshot.val();
        chatHistory = Array.isArray(val) ? val : [];
        console.log(`✅ История загружена (${chatHistory.length} сообщений)`);
      } else {
        console.log('📭 История пустая');
      }

      // === ШАГ 5: Применяем стили ===
      applyStyles();

      // === ШАГ 6: Создаём HTML виджета ===
      const widget = document.createElement('div');
      widget.className = 'amina-widget';

      const label = document.createElement('div');
      label.className = 'amina-label';
      label.innerHTML = `<span id="amina-text"></span><div class="amina-name" id="amina-name"></div>`;

      const btn = document.createElement('button');
      btn.className = 'amina-btn';
      btn.innerHTML = `<img src="${globalConfig.widgetDesign.avatarUrl}" alt="avatar" onerror="this.style.display='none'"><span class="amina-badge" id="amina-badge">!</span>`;

      widget.appendChild(label);
      widget.appendChild(btn);
      document.body.appendChild(widget);

      console.log('✅ Виджет добавлен на страницу');

      // === ШАГ 7: Анимация печати текста ===
      async function typeText() {
        label.classList.add('visible');
        const textEl = document.getElementById('amina-text');
        const nameEl = document.getElementById('amina-name');
        
        const text1 = globalConfig.widgetDesign.text1 || 'Привет!';
        const text2 = globalConfig.widgetDesign.text2 || 'Помогу вам';
        const name = globalConfig.widgetDesign.botName || 'AI Mina';

        // Печатаем первый текст
        for (let char of text1) {
          textEl.textContent += char;
          await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
        }

        await new Promise(r => setTimeout(r, 2000));

        textEl.textContent = '';

        // Печатаем второй текст
        for (let char of text2) {
          textEl.textContent += char;
          await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
        }

        nameEl.textContent = name;
      }

      typeText();

      // === ШАГ 8: Обработчики кнопки ===
      btn.onclick = () => isOpen ? closePanel() : openPanel();
      label.onclick = () => isOpen ? closePanel() : openPanel();

      console.log('✅ Виджет полностью инициализирован!');

    } catch (error) {
      console.error('❌ Widget Error:', error.message);
    }
  }

  // ============================================================
  // БЛОК 12: Запуск инициализации когда DOM готов
  // ============================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

})();
