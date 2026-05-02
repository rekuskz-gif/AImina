// ============================================================
// ФАЙЛ: widget.js (ИСПРАВЛЕННЫЙ)
// НАЗНАЧЕНИЕ: Виджет чата на сайте клиента
// Загружает конфиг, показывает кнопку, открывает чат окно
// ИСПРАВЛЕНЫ: дублирование истории, Firebase слушатель,
// уведомление когда ИИ выключен
// ============================================================

(function() {
    // ============================================================
    // БЛОК 1: Инициализация переменных и конфиг
    // ============================================================
    
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    const backendUrl = 'https://ai--mina.vercel.app';

    // Firebase конфиг — один для всех клиентов
    const firebaseConfig = {
        apiKey: "AIzaSyBgXvb4GLdtaZlw5dgnYKGddOIpFYIXXAU",
        databaseURL: "https://aimina-d3597-default-rtdb.firebaseio.com",
        projectId: "aimina-d3597",
        appId: "1:590164687607:web:c9f97739c0358dfd2571f2"
    };

    // ============================================================
    // ФУНКЦИЯ: getSessionId()
    // НАЗНАЧЕНИЕ: Получить или создать уникальный ID браузера
    // ВОЗВРАЩАЕТ: строку типа "user_abc123_1609459200000"
    // ПОЧЕМУ НУЖНА: Чтобы каждый браузер имел свою историю чата
    // ============================================================
    function getSessionId() {
        // Проверяем есть ли уже sessionId в localStorage
        let sessionId = localStorage.getItem(`aimina_session_${clientId}`);
        
        if (!sessionId) {
            // Создаём новый ID: user_ + случайные символы + время
            sessionId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            // Сохраняем в localStorage чтобы не забыть при следующем открытии
            localStorage.setItem(`aimina_session_${clientId}`, sessionId);
        }
        return sessionId;
    }

    // ============================================================
    // ФУНКЦИЯ: loadScript(src)
    // НАЗНАЧЕНИЕ: Динамически загрузить скрипт (Firebase)
    // ПАРАМЕТР: src - ссылка на скрипт
    // ВОЗВРАЩАЕТ: Promise (когда скрипт загрузился)
    // ПОЧЕМУ НУЖНА: Чтобы не грузить Firebase в документе
    // ============================================================
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;  // Вызовется когда скрипт загрузился
            script.onerror = reject;   // Вызовется если ошибка
            document.head.appendChild(script);
        });
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ: initMina()
    // НАЗНАЧЕНИЕ: Инициализировать весь виджет
    // ЧТО ДЕЛАЕТ:
    // 1. Загружает Firebase
    // 2. Загружает конфиг из Google Таблицы
    // 3. Создаёт кнопку и панель чата
    // 4. Устанавливает слушатели событий
    // ============================================================
    async function initMina() {
        try {
            // --------------------------------------------------------
            // ЭТАП 1: Загружаем Firebase скрипты
            // --------------------------------------------------------
            console.log('📦 Загружаем Firebase...');
            await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
            await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

            // Инициализируем Firebase (если не инициализирован)
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            console.log('✅ Firebase загружен');

            // --------------------------------------------------------
            // ЭТАП 2: Получаем sessionId и ссылку на историю в Firebase
            // --------------------------------------------------------
            const db = firebase.database();
            const sessionId = getSessionId();
            const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
            console.log('📝 Session ID:', sessionId);

            // --------------------------------------------------------
            // ЭТАП 3: Загружаем конфиг кнопки из API
            // --------------------------------------------------------
            console.log('⚙️ Загружаем конфиг...');
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            const config = await response.json();
            console.log('✅ Конфиг загружен:', config);

            // --------------------------------------------------------
            // ЭТАП 4: Загружаем историю сообщений из Firebase
            // --------------------------------------------------------
            console.log('📚 Загружаем историю...');
            let chatHistory = [];
            const snapshot = await historyRef.once('value');
            if (snapshot.exists()) {
                const val = snapshot.val();
                chatHistory = Array.isArray(val) ? val : [];
                console.log(`✅ История загружена (${chatHistory.length} сообщений)`);
            } else {
                console.log('📭 История пустая');
            }

            // ============================================================
            // ЭТАП 5: Создаём CSS стили для виджета
            // ============================================================
            const style = document.createElement('style');
            style.textContent = `
                /* Анимация пульса для кнопки */
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
                    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
                }

                /* Анимация входа панели справа */
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                /* Анимация выхода панели вправо */
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }

                /* Появление сообщения в чате */
                @keyframes fadeInMsg {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Пульс уведомления (красный значок) */
                @keyframes notifyPulse {
                    0% { box-shadow: 0 0 0 0 rgba(255,0,0,0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(255,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(255,0,0,0); }
                }

                /* Контейнер виджета (кнопка + лейбл) */
                .amina-widget {
                    position: fixed; bottom: 20px; right: 20px;
                    z-index: 9999; display: flex; align-items: center; gap: 10px;
                }

                /* Сама кнопка (круглая) */
                .amina-btn {
                    width: 70px; height: 70px; border-radius: 50%;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    border: none; cursor: pointer; padding: 0;
                    animation: pulse 2s infinite; display: flex;
                    align-items: center; justify-content: center;
                    transition: transform 0.2s;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    position: relative;
                }

                .amina-btn:hover { transform: scale(1.05); }
                .amina-btn img { width: 58px; height: 58px; border-radius: 50%; }

                /* Когда есть новое сообщение - пульсирует красным */
                .amina-btn.has-message { animation: notifyPulse 1s infinite !important; }

                /* Красный значок (!) с количеством сообщений */
                .amina-badge {
                    position: absolute; top: 0; right: 0;
                    background: red; color: white;
                    width: 20px; height: 20px; border-radius: 50%;
                    font-size: 12px; font-weight: bold;
                    align-items: center; justify-content: center;
                    display: none;
                }

                /* Лейбл (текст возле кнопки) */
                .amina-label {
                    background: ${config.bgColor || '#ffffff'};
                    padding: 12px 16px; border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    font-family: Arial, sans-serif; font-size: 13px; font-weight: bold;
                    color: ${config.textColor || '#333333'};
                    max-width: 200px; opacity: 0;
                    transition: all 0.5s; cursor: pointer;
                }

                .amina-label.visible { opacity: 1; }
                .amina-name { font-size: 12px; color: ${config.textColor || '#666666'}; margin-top: 6px; }

                /* Панель чата (основное окно) */
                .amina-panel {
                    position: fixed; bottom: 0; right: 0;
                    width: 380px; height: 580px;
                    background: white; border-radius: 16px 16px 0 0;
                    box-shadow: 0 -4px 30px rgba(0,0,0,0.15);
                    z-index: 99999; display: flex; flex-direction: column;
                    overflow: hidden; animation: slideIn 0.3s ease;
                    font-family: 'Segoe UI', Roboto, Arial, sans-serif;
                }

                .amina-panel.closing { animation: slideOut 0.3s ease forwards; }

                /* Шапка панели (с ником и аватарой) */
                .amina-panel-header {
                    padding: 14px 16px;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white; display: flex; align-items: center; gap: 10px; flex-shrink: 0;
                }

                .amina-panel-header img {
                    width: 36px; height: 36px; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.4); object-fit: cover;
                }

                .amina-panel-header-name { font-weight: bold; font-size: 15px; flex: 1; }

                /* Кнопка закрытия (X) */
                .amina-panel-close {
                    background: none; border: none; color: white;
                    font-size: 22px; cursor: pointer; padding: 0;
                    line-height: 1; opacity: 0.8; transition: opacity 0.2s;
                    width: auto; height: auto;
                }

                .amina-panel-close:hover { opacity: 1; }

                /* Контейнер с сообщениями */
                .amina-messages {
                    flex: 1; overflow-y: auto; padding: 15px;
                    display: flex; flex-direction: column; gap: 10px; background: #f0f2f5;
                }

                /* Одно сообщение в чате */
                .amina-msg {
                    padding: 10px 14px; border-radius: 18px;
                    max-width: 80%; font-size: 14px; line-height: 1.4;
                    word-wrap: break-word; animation: fadeInMsg 0.3s ease;
                }

                /* Сообщение бота (слева) */
                .amina-msg.bot {
                    align-self: flex-start; background: white; color: #333;
                    border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                /* Сообщение юзера (справа) */
                .amina-msg.user {
                    align-self: flex-end;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white; border-bottom-right-radius: 4px;
                }

                /* Сообщение менеджера (слева, синее) */
                .amina-msg.manager {
                    align-self: flex-start; background: #e3f2fd; color: #333;
                    border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    border-left: 3px solid #2196F3;
                }

                /* Анимация печати (три точки) */
                .amina-typing {
                    display: flex; gap: 4px; align-self: flex-start;
                    padding: 12px 16px; background: white;
                    border-radius: 18px; border-bottom-left-radius: 4px;
                }

                .amina-typing span {
                    width: 7px; height: 7px; background: #999;
                    border-radius: 50%; animation: typingDot 1.4s infinite;
                }

                .amina-typing span:nth-child(2) { animation-delay: 0.2s; }
                .amina-typing span:nth-child(3) { animation-delay: 0.4s; }

                @keyframes typingDot {
                    0%, 60%, 100% { opacity: 0.3; }
                    30% { opacity: 1; }
                }

                /* Поле ввода и кнопка отправки */
                .amina-input-area {
                    padding: 12px; background: white;
                    display: flex; gap: 8px; border-top: 1px solid #eee; flex-shrink: 0;
                }

                .amina-input {
                    flex: 1; padding: 10px 14px; border: 1px solid #ddd;
                    border-radius: 22px; outline: none; font-size: 14px;
                    font-family: inherit; transition: border-color 0.2s;
                }

                .amina-input:focus { border-color: ${config.colorStart}; }

                /* Кнопка отправки (стрелка) */
                .amina-send {
                    border: none;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white; width: 38px; height: 38px;
                    border-radius: 50%; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 16px; flex-shrink: 0; transition: opacity 0.2s;
                }

                .amina-send:hover { opacity: 0.9; }
                .amina-send:disabled { opacity: 0.5; }
            `;
            document.head.appendChild(style);
            console.log('✅ Стили применены');

            // ============================================================
            // ЭТАП 6: Создаём HTML элементы для виджета
            // ============================================================

            // Контейнер для кнопки и лейбла
            const widget = document.createElement('div');
            widget.className = 'amina-widget';

            // Лейбл (текст рядом с кнопкой)
            const label = document.createElement('div');
            label.className = 'amina-label';
            const textSpan = document.createElement('span');
            const nameDiv = document.createElement('div');
            nameDiv.className = 'amina-name';
            label.appendChild(textSpan);
            label.appendChild(nameDiv);

            // Сама кнопка с аватарой
            const btn = document.createElement('button');
            btn.className = 'amina-btn';
            btn.innerHTML = `<img src="${config.avatarUrl}" alt="${config.botName}" onerror="this.src='https://via.placeholder.com/60'"><span class="amina-badge" id="amina-badge">!</span>`;

            // Собираем всё в контейнер
            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);
            console.log('✅ Виджет добавлен на страницу');

            // ============================================================
            // ЭТАП 7: Переменные состояния
            // ============================================================
            let panel = null;              // Текущая открытая панель
            let isOpen = false;            // Открыта ли панель сейчас
            let isLoading = false;         // Отправляется ли сообщение
            let pendingManagerMessages = []; // Сообщения менеджера когда чат закрыт
            let historyUnsubscribe = null; // Функция отписки от Firebase

            // ============================================================
            // ФУНКЦИЯ: saveHistory()
            // НАЗНАЧЕНИЕ: Сохранить историю в Firebase
            // ============================================================
            function saveHistory() {
                historyRef.set(chatHistory);
            }

            // ============================================================
            // ФУНКЦИЯ: addMsg(text, type)
            // НАЗНАЧЕНИЕ: Добавить сообщение в чат
            // ПАРАМЕТРЫ:
            //   text - текст сообщения
            //   type - тип: 'user', 'bot', 'manager'
            // ПОЧЕМУ НУЖНА: Создаёт красивый div с сообщением
            // ============================================================
            function addMsg(text, type) {
                const msgs = document.getElementById('amina-messages');
                if (!msgs) return;
                
                const div = document.createElement('div');
                div.className = `amina-msg ${type}`;
                div.innerText = text;
                msgs.appendChild(div);
                scrollDown();
            }

            // ============================================================
            // ФУНКЦИЯ: scrollDown()
            // НАЗНАЧЕНИЕ: Прокрутить чат вниз (к последнему сообщению)
            // ПОЧЕМУ НУЖНА: Юзер всегда видит новые сообщения
            // ============================================================
            function scrollDown() {
                const msgs = document.getElementById('amina-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            // ============================================================
            // ФУНКЦИЯ: openPanel()
            // НАЗНАЧЕНИЕ: Открыть панель чата
            // ЧТО ДЕЛАЕТ:
            // 1. Создаёт HTML панели
            // 2. Загружает историю (только если первый раз)
            // 3. Подписывается на новые сообщения от менеджера
            // ============================================================
            function openPanel() {
                if (isOpen) return;  // Если уже открыта - не открываем ещё раз
                isOpen = true;
                console.log('🔓 Панель открыта');

                // Скрываем красный значок
                const badge = document.getElementById('amina-badge');
                if (badge) badge.style.display = 'none';
                btn.classList.remove('has-message');

                // ---- Создаём HTML панели ----
                panel = document.createElement('div');
                panel.className = 'amina-panel';
                panel.innerHTML = `
                    <div class="amina-panel-header">
                        <img src="${config.avatarUrl}" onerror="this.style.display='none'">
                        <span class="amina-panel-header-name">${config.botName || 'AI Chat'}</span>
                        <button class="amina-panel-close" id="amina-close">✕</button>
                    </div>
                    <div class="amina-messages" id="amina-messages"></div>
                    <div class="amina-input-area">
                        <input class="amina-input" id="amina-input" placeholder="${config.text2 || 'Введите сообщение...'}">
                        <button class="amina-send" id="amina-send">→</button>
                    </div>
                `;
                document.body.appendChild(panel);

                // ---- Показываем историю (только если первый раз) ----
                const messagesDiv = document.getElementById('amina-messages');
                if (messagesDiv && messagesDiv.children.length === 0) {
                    // Чат пустой - показываем историю из chatHistory
                    if (chatHistory.length > 0) {
                        console.log(`📚 Показываем ${chatHistory.length} сообщений`);
                        chatHistory.forEach(msg => {
                            if (!msg || msg.role === 'system') return;
                            const type = msg.fromManager ? 'manager' : 
                                        (msg.role === 'assistant' ? 'bot' : 'user');
                            addMsg(msg.content, type);
                        });
                    } else {
                        // История пустая - загружаем приветствие из chat_config
                        fetch(`${backendUrl}/api/chat_config?clientId=${clientId}`)
                            .then(r => r.json())
                            .then(chatConfig => {
                                if (chatConfig.welcomeMsg) {
                                    console.log('👋 Показываем приветствие');
                                    addMsg(chatConfig.welcomeMsg, 'bot');
                                    chatHistory.push({ 
                                        role: 'assistant', 
                                        content: chatConfig.welcomeMsg 
                                    });
                                    saveHistory();
                                }
                            });
                    }
                }

                // Очищаем сообщения которые ждали (были доставлены менеджером пока чат был закрыт)
                pendingManagerMessages = [];

                // ---- Слушаем события ----
                document.getElementById('amina-close').onclick = closePanel;
                document.getElementById('amina-send').onclick = sendMsg;
                document.getElementById('amina-input').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') sendMsg();
                });

                // ---- ИСПРАВЛЕНИЕ: Слушаем Firebase только когда чат открыт ----
                // Подписываемся на изменения в Firebase (новые сообщения от менеджера)
                historyUnsubscribe = historyRef.on('value', (snap) => {
                    if (!snap.exists()) return;
                    
                    const val = snap.val();
                    const newHistory = Array.isArray(val) ? val : [];

                    // Проверяем есть ли новые сообщения
                    if (newHistory.length > chatHistory.length) {
                        const newMessages = newHistory.slice(chatHistory.length);
                        chatHistory = newHistory;

                        // Показываем только НОВЫЕ сообщения (от менеджера)
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
            // ФУНКЦИЯ: closePanel()
            // НАЗНАЧЕНИЕ: Закрыть панель чата
            // ЧТО ДЕЛАЕТ:
            // 1. Добавляет анимацию выхода
            // 2. Удаляет панель из DOM
            // 3. Отписывается от Firebase
            // ============================================================
            function closePanel() {
                if (!panel) return;
                console.log('🔒 Панель закрыта');
                
                isOpen = false;
                panel.classList.add('closing');  // Включаем анимацию выхода
                
                // ИСПРАВЛЕНИЕ: Отписываемся от Firebase слушателя
                if (historyUnsubscribe) {
                    historyUnsubscribe();
                    historyUnsubscribe = null;
                }
                
                setTimeout(() => {
                    panel.remove();
                    panel = null;
                }, 300);  // Ждём анимации
            }

            // ============================================================
            // ФУНКЦИЯ: sendMsg()
            // НАЗНАЧЕНИЕ: Отправить сообщение юзера в Claude
            // ЧТО ДЕЛАЕТ:
            // 1. Берёт текст из инпута
            // 2. Показывает его в чате как сообщение юзера
            // 3. Сохраняет в Firebase
            // 4. Отправляет в Claude API
            // 5. Показывает ответ или ошибку
            // ============================================================
            async function sendMsg() {
                if (isLoading) return;  // Если уже отправляется - не отправляем ещё
                
                const input = document.getElementById('amina-input');
                const sendBtn = document.getElementById('amina-send');
                const text = input.value.trim();
                
                if (!text) return;  // Если пусто - не отправляем
                console.log('✉️ Юзер пишет:', text.substring(0, 50));

                // ---- Показываем сообщение юзера сразу ----
                addMsg(text, 'user');
                input.value = '';
                
                // ---- Сохраняем в историю и Firebase ----
                chatHistory.push({ role: 'user', content: text });
                saveHistory();

                // ---- Показываем анимацию печати (три точки) ----
                const typingDiv = document.createElement('div');
                typingDiv.className = 'amina-typing';
                typingDiv.innerHTML = '<span></span><span></span><span></span>';
                document.getElementById('amina-messages').appendChild(typingDiv);
                scrollDown();

                // ---- Блокируем кнопку и инпут пока отправляем ----
                isLoading = true;
                sendBtn.disabled = true;
                input.disabled = true;

                try {
                    // Отправляем в Claude через наш API
                    console.log('🚀 Отправляем в Claude...');
                    const res = await fetch(`${backendUrl}/api/authentication`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            clientId, 
                            sessionId, 
                            messages: chatHistory 
                        })
                    });
                    
                    typingDiv.remove();  // Убираем анимацию печати
                    const result = await res.json();

                    // ---- ИСПРАВЛЕНИЕ: Обработка когда ИИ выключен ----
                    if (result.aiDisabled) {
                        console.log('⏸️ ИИ выключен — менеджер отвечает вручную');
                        addMsg('🔴 Менеджер ответит вам в ближайшее время...', 'bot');
                        return;  // Выходим, не добавляем в историю
                    }

                    // Проверяем успешность запроса
                    if (!res.ok) {
                        throw new Error(result.error || 'API error');
                    }

                    // Проверяем что есть ответ
                    if (!result.text) {
                        throw new Error('Пустой ответ от Claude');
                    }

                    console.log('🤖 Claude ответил:', result.text.substring(0, 50));

                    // ---- Показываем ответ ----
                    addMsg(result.text, 'bot');
                    chatHistory.push({ role: 'assistant', content: result.text });
                    saveHistory();

                } catch (e) {
                    // ---- Обработка ошибок ----
                    typingDiv.remove();
                    console.error('❌ Ошибка отправки:', e.message);
                    addMsg('❌ Ошибка: ' + e.message, 'bot');
                    chatHistory.pop();  // Удаляем "неудачное" сообщение
                    
                } finally {
                    // ---- Разблокируем элементы в любом случае ----
                    isLoading = false;
                    if (sendBtn) sendBtn.disabled = false;
                    if (input) { 
                        input.disabled = false; 
                        input.focus();  // Фокусируемся на инпут
                    }
                }
            }

            // ============================================================
            // ФУНКЦИЯ: typeText()
            // НАЗНАЧЕНИЕ: Печатать текст на кнопке с эффектом печати
            // ЧТО ДЕЛАЕТ:
            // 1. Печатает text1 из конфига
            // 2. Паузирует на 2 секунды
            // 3. Стирает и печатает text2
            // 4. Показывает имя бота
            // ВРЕМЯ: Несколько секунд (зависит от длины текста)
            // ============================================================
            async function typeText() {
                label.classList.add('visible');  // Показываем лейбл (делаем видимым)
                
                // ---- Печатаем text1 (первый текст) ----
                if (config.text1) {
                    for (let char of config.text1) {
                        textSpan.textContent += char;
                        // Случайная задержка между символами (от 50 до 100мс)
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                    }
                    // Пауза перед тем как стереть
                    await new Promise(r => setTimeout(r, 2000));
                }
                
                // ---- Стираем и печатаем text2 (второй текст) ----
                textSpan.textContent = '';
                if (config.text2) {
                    for (let char of config.text2) {
                        textSpan.textContent += char;
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                    }
                }
                
                // ---- Показываем имя бота ----
                nameDiv.textContent = config.botName;
            }

            // ============================================================
            // ЭТАП 8: Устанавливаем обработчики событий
            // ============================================================

            // Кликаем на кнопку - открываем/закрываем чат
            btn.onclick = () => isOpen ? closePanel() : openPanel();
            
            // Кликаем на лейбл - открываем/закрываем чат
            label.onclick = () => isOpen ? closePanel() : openPanel();

            // ============================================================
            // ЭТАП 9: Запускаем анимацию печати на кнопке
            // ============================================================
            typeText();
            console.log('✅ Виджет инициализирован');

        } catch (e) {
            console.error('❌ Widget Error:', e);
        }
    }

    // ============================================================
    // ЭТАП 10: Запускаем инициализацию когда DOM готов
    // ============================================================
    if (document.readyState === 'loading') {
        // Если страница ещё загружается
        document.addEventListener('DOMContentLoaded', initMina);
    } else {
        // Если страница уже загружена
        initMina();
    }

})();  // Конец IIFE функции (сразу вызываемая функция)
