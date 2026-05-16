// ============================================================
// ФАЙЛ: widget.js
// НАЗНАЧЕНИЕ: Виджет чата который вставляется на сайт клиента
// Показывает круглую кнопку в правом нижнем углу
// При клике открывается панель чата
//
// КАК ПОДКЛЮЧИТЬ:
//   <script src="https://ai--mina.vercel.app/widget.js"
//           data-client-id="mina_001"></script>
// ============================================================

(function() {

    // ============================================================
    // РАЗДЕЛ 1: ПЕРЕМЕННЫЕ И КОНФИГ
    // ============================================================

    // scriptTag = <script> элемент который загрузил этот код
    const scriptTag = document.currentScript;

    // clientId — ID клиента из атрибута data-client-id
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';

    // backendUrl — адрес сервера где живут API функции
    const backendUrl = 'https://ai--mina.vercel.app';

    // firebaseConfig — данные для подключения к Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyBgXvb4GLdtaZlw5dgnYKGddOIpFYIXXAU",
        databaseURL: "https://aimina-d3597-default-rtdb.firebaseio.com",
        projectId: "aimina-d3597",
        appId: "1:590164687607:web:c9f97739c0358dfd2571f2"
    };

    // ============================================================
    // РАЗДЕЛ 2: ФУНКЦИЯ getSessionId()
    // НАЗНАЧЕНИЕ: Получить или создать уникальный ID браузера
    // Сохраняется в localStorage чтобы не создавать новый при каждом визите
    // ============================================================

    function getSessionId() {
        let sessionId = localStorage.getItem(`aimina_session_${clientId}`);
        if (!sessionId) {
            sessionId = 'user_' +
                       Math.random().toString(36).substr(2, 9) +
                       '_' +
                       Date.now();
            localStorage.setItem(`aimina_session_${clientId}`, sessionId);
        }
        return sessionId;
    }

    // ============================================================
    // РАЗДЕЛ 3: ФУНКЦИЯ loadScript(src)
    // НАЗНАЧЕНИЕ: Загрузить JavaScript файл динамически
    // Нужна для загрузки Firebase скриптов
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
    // РАЗДЕЛ 4: ГЛАВНАЯ ФУНКЦИЯ initMina()
    // НАЗНАЧЕНИЕ: Инициализировать весь виджет
    // ============================================================

    async function initMina() {
        try {

            // ========== ЭТАП 1: Загружаем Firebase ==========
            console.log('📦 Загружаем Firebase...');
            await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
            await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            console.log('✅ Firebase загружен');

            // ========== ЭТАП 2: Получаем sessionId и ссылку на базу ==========
            const db = firebase.database();
            const sessionId = getSessionId();

            // historyRef — ссылка на историю этого юзера в Firebase
            // Путь: chats/mina_001/user_abc123_123456
            const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
            console.log('📝 Session ID:', sessionId);

            // ========== ЭТАП 3: Загружаем конфиг кнопки ==========
            console.log('⚙️ Загружаем widget_config...');
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            const config = await response.json();
            console.log('✅ widget_config загружен');

            // ========== ЭТАП 4: Загружаем конфиг чата ==========
            // chatConfig содержит: welcomeMsg, footerText, footerUrl, footerColor и т.д.
            console.log('⚙️ Загружаем chat_config...');
            const chatResponse = await fetch(`${backendUrl}/api/chat_config?clientId=${clientId}`);
            const chatConfig = chatResponse.ok ? await chatResponse.json() : {};
            console.log('✅ chat_config загружен:', chatConfig);

            // ========== ЭТАП 5: Загружаем историю сообщений ==========
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

            // ========== ЭТАП 6: Создаём CSS стили ==========
            const style = document.createElement('style');
            style.textContent = `
                /* Анимация пульса для кнопки */
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
                    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
                }
                /* Панель появляется справа */
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                /* Панель исчезает вправо */
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
                /* Сообщение появляется снизу */
                @keyframes fadeInMsg {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                /* Красный пульс при новых сообщениях */
                @keyframes notifyPulse {
                    0% { box-shadow: 0 0 0 0 rgba(255,0,0,0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(255,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(255,0,0,0); }
                }
                /* Контейнер виджета — фиксирован снизу справа */
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
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    animation: pulse 2s infinite;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    position: relative;
                }
                .amina-btn:hover { transform: scale(1.05); }
                .amina-btn img { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; }
                /* Красный значок непрочитанных */
                .amina-badge {
                    position: absolute;
                    top: 0; right: 0;
                    background: red;
                    color: white;
                    width: 20px; height: 20px;
                    border-radius: 50%;
                    font-size: 12px;
                    font-weight: bold;
                    align-items: center;
                    justify-content: center;
                    display: none;
                }
                /* Красный пульс кнопки при новых сообщениях */
                .amina-btn.has-message { animation: notifyPulse 1s infinite !important; }
                /* Лейбл рядом с кнопкой */
                .amina-label {
                    background: ${config.bgColor || '#ffffff'};
                    padding: 12px 16px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    font-family: Arial, sans-serif;
                    font-size: 13px;
                    font-weight: bold;
                    color: ${config.textColor || '#333333'};
                    max-width: 200px;
                    opacity: 0;
                    transition: all 0.5s;
                    cursor: pointer;
                }
                .amina-label.visible { opacity: 1; }
                .amina-name { font-size: 12px; color: ${config.textColor || '#666666'}; margin-top: 6px; }
                /* Панель чата */
                .amina-panel {
                    position: fixed;
                    bottom: 0; right: 0;
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
                .amina-panel.closing { animation: slideOut 0.3s ease forwards; }
                /* Шапка панели */
                .amina-panel-header {
                    padding: 14px 16px;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-shrink: 0;
                }
                .amina-panel-header img {
                    width: 36px; height: 36px;
                    border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.4);
                    object-fit: cover;
                }
                .amina-panel-header-name { font-weight: bold; font-size: 15px; flex: 1; }
                /* Кнопка закрытия */
                .amina-panel-close {
                    background: none; border: none;
                    color: white; font-size: 22px;
                    cursor: pointer; padding: 0;
                    opacity: 0.8; transition: opacity 0.2s;
                }
                .amina-panel-close:hover { opacity: 1; }
                /* Список сообщений */
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
                /* Сообщение бота — слева */
                .amina-msg.bot {
                    align-self: flex-start;
                    background: white; color: #333;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                /* Сообщение юзера — справа */
                .amina-msg.user {
                    align-self: flex-end;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    border-bottom-right-radius: 4px;
                }
                /* Сообщение менеджера — синее слева */
                .amina-msg.manager {
                    align-self: flex-start;
                    background: #e3f2fd; color: #333;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    border-left: 3px solid #2196F3;
                }
                /* Анимация печати — три точки */
                .amina-typing {
                    display: flex; gap: 4px;
                    align-self: flex-start;
                    padding: 12px 16px;
                    background: white;
                    border-radius: 18px;
                    border-bottom-left-radius: 4px;
                }
                .amina-typing span {
                    width: 7px; height: 7px;
                    background: #999;
                    border-radius: 50%;
                    animation: typingDot 1.4s infinite;
                }
                .amina-typing span:nth-child(2) { animation-delay: 0.2s; }
                .amina-typing span:nth-child(3) { animation-delay: 0.4s; }
                @keyframes typingDot {
                    0%, 60%, 100% { opacity: 0.3; }
                    30% { opacity: 1; }
                }
                /* Поле ввода */
                .amina-input-area {
                    padding: 12px;
                    background: white;
                    display: flex;
                    gap: 8px;
                    border-top: 1px solid #eee;
                    flex-shrink: 0;
                }
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
                .amina-input:focus { border-color: ${config.colorStart}; }
                /* Кнопка отправки */
                .amina-send {
                    border: none;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    width: 38px; height: 38px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    flex-shrink: 0;
                    transition: opacity 0.2s;
                }
                .amina-send:hover { opacity: 0.9; }
                .amina-send:disabled { opacity: 0.5; cursor: not-allowed; }
                /* Футер чата — ссылка внизу */
                .amina-footer {
                    text-align: center;
                    padding: 6px;
                    font-size: 11px;
                    background: white;
                    flex-shrink: 0;
                }
                .amina-footer a {
                    text-decoration: none;
                    transition: opacity 0.2s;
                }
                .amina-footer a:hover { opacity: 0.7; }
            `;
            document.head.appendChild(style);
            console.log('✅ Стили применены');

            // ========== ЭТАП 7: Создаём HTML элементы ==========

            const widget = document.createElement('div');
            widget.className = 'amina-widget';

            const label = document.createElement('div');
            label.className = 'amina-label';

            const textSpan = document.createElement('span');
            const nameDiv = document.createElement('div');
            nameDiv.className = 'amina-name';

            label.appendChild(textSpan);
            label.appendChild(nameDiv);

            const btn = document.createElement('button');
            btn.className = 'amina-btn';
            btn.innerHTML = `<img src="${config.avatarUrl}" alt="${config.botName}" onerror="this.src='https://via.placeholder.com/60'"><span class="amina-badge" id="amina-badge">!</span>`;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);
            console.log('✅ Виджет добавлен');

            // ========== ЭТАП 8: Переменные состояния ==========

            let panel = null;                // Текущая панель (null = закрыта)
            let isOpen = false;              // Открыта ли панель?
            let isLoading = false;           // Отправляется ли сообщение?
            let pendingManagerMessages = []; // Сообщения пока панель закрыта
            let historyUnsubscribe = null;   // Функция отписки от Firebase

            // ========== ЭТАП 9: Вспомогательные функции ==========

            // Сохранить историю в Firebase
            function saveHistory() {
                historyRef.set(chatHistory);
            }

            // Добавить сообщение в чат
            // type: 'bot', 'user', 'manager'
            function addMsg(text, type) {
                const msgs = document.getElementById('amina-messages');
                if (!msgs) return;
                const div = document.createElement('div');
                div.className = `amina-msg ${type}`;
                div.innerText = text;
                msgs.appendChild(div);
                scrollDown();
            }

            // Прокрутить чат вниз
            function scrollDown() {
                const msgs = document.getElementById('amina-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            // ========== ЭТАП 10: Функция openPanel() ==========

            function openPanel() {
                if (isOpen) return;
                isOpen = true;
                console.log('🔓 Панель открыта');

                // Скрываем красный значок
                const badge = document.getElementById('amina-badge');
                if (badge) badge.style.display = 'none';
                btn.classList.remove('has-message');

                // Футер — показываем только если есть текст
                // Если есть ссылка — делаем кликабельным
                const footerHtml = chatConfig.footerText ? `
                    <div class="amina-footer">
                        <a href="${chatConfig.footerUrl || '#'}"
                           target="_blank"
                           style="color: ${chatConfig.footerColor || '#999999'}">
                            ${chatConfig.footerText}
                        </a>
                    </div>` : '';

                // Создаём HTML панели
                panel = document.createElement('div');
                panel.className = 'amina-panel';
                panel.innerHTML = `
                    <div class="amina-panel-header">
                        <img src="${chatConfig.avatarUrl || config.avatarUrl}" onerror="this.style.display='none'">
                        <span class="amina-panel-header-name">${chatConfig.botName || config.botName || 'AI Chat'}</span>
                        <button class="amina-panel-close" id="amina-close">✕</button>
                    </div>
                    <div class="amina-messages" id="amina-messages"></div>
                    <div class="amina-input-area">
                        <input class="amina-input" id="amina-input" placeholder="${chatConfig.placeholder || config.text2 || 'Введите сообщение...'}">
                        <button class="amina-send" id="amina-send">→</button>
                    </div>
                    ${footerHtml}
                `;
                document.body.appendChild(panel);

                // Показываем историю или приветствие
                const messagesDiv = document.getElementById('amina-messages');
                if (messagesDiv && messagesDiv.children.length === 0) {
                    if (chatHistory.length > 0) {
                        console.log(`📚 Показываем ${chatHistory.length} сообщений`);
                        chatHistory.forEach(msg => {
                            if (!msg || msg.role === 'system') return;
                            const type = msg.fromManager ? 'manager' :
                                        (msg.role === 'assistant' ? 'bot' : 'user');
                            addMsg(msg.content, type);
                        });
                    } else if (chatConfig.welcomeMsg) {
                        // История пустая — показываем приветствие
                        console.log('👋 Показываем приветствие');
                        addMsg(chatConfig.welcomeMsg, 'bot');
                        chatHistory.push({
                            role: 'assistant',
                            content: chatConfig.welcomeMsg
                        });
                        saveHistory();
                    }
                }

                pendingManagerMessages = [];

                // Обработчики событий
                document.getElementById('amina-close').onclick = closePanel;
                document.getElementById('amina-send').onclick = sendMsg;
                document.getElementById('amina-input').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') sendMsg();
                });

                // Firebase слушатель — реалтайм сообщения от менеджера
                historyUnsubscribe = historyRef.on('value', (snap) => {
                    if (!snap.exists()) return;
                    const val = snap.val();
                    const newHistory = Array.isArray(val) ? val : [];

                    if (newHistory.length > chatHistory.length) {
                        const newMessages = newHistory.slice(chatHistory.length);
                        chatHistory = newHistory;

                        newMessages.forEach(msg => {
                            if (msg && msg.fromManager) {
                                console.log('💬 Менеджер ответил');
                                addMsg(msg.content, 'manager');
                            }
                        });
                    }
                });
            }

            // ========== ЭТАП 11: Функция closePanel() ==========

            function closePanel() {
                if (!panel) return;
                console.log('🔒 Панель закрыта');
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

            // ========== ЭТАП 12: Функция sendMsg() ==========

            async function sendMsg() {
                if (isLoading) return;

                const input = document.getElementById('amina-input');
                const sendBtn = document.getElementById('amina-send');
                const text = input.value.trim();

                if (!text) return;
                console.log('✉️ Юзер пишет:', text.substring(0, 50));

                addMsg(text, 'user');
                input.value = '';

                chatHistory.push({ role: 'user', content: text });
                saveHistory();

                // Показываем анимацию печати
                const typingDiv = document.createElement('div');
                typingDiv.className = 'amina-typing';
                typingDiv.innerHTML = '<span></span><span></span><span></span>';
                document.getElementById('amina-messages').appendChild(typingDiv);
                scrollDown();

                isLoading = true;
                sendBtn.disabled = true;
                input.disabled = true;

                try {
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

                    typingDiv.remove();
                    const result = await res.json();

                    // Если ИИ выключен — показываем сообщение юзеру
                    if (result.aiDisabled) {
                        console.log('⏸️ ИИ выключен — менеджер отвечает');
                        addMsg('Менеджер ответит вам в ближайшее время...', 'bot');
                        return;
                    }

                    if (!res.ok) throw new Error(result.error || 'API error');
                    if (!result.text) return;

                    console.log('🤖 Claude ответил');
                    addMsg(result.text, 'bot');
                    chatHistory.push({ role: 'assistant', content: result.text });
                    saveHistory();

                } catch (e) {
                    typingDiv.remove();
                    console.error('❌ Ошибка:', e.message);
                    chatHistory.pop();

                } finally {
                    isLoading = false;
                    if (sendBtn) sendBtn.disabled = false;
                    if (input) {
                        input.disabled = false;
                        input.focus();
                    }
                }
            }

            // ========== ЭТАП 13: Анимация печати текста ==========

            async function typeText() {
                label.classList.add('visible');

                if (config.text1) {
                    for (let char of config.text1) {
                        textSpan.textContent += char;
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }

                textSpan.textContent = '';
                if (config.text2) {
                    for (let char of config.text2) {
                        textSpan.textContent += char;
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                    }
                }

                nameDiv.textContent = config.botName;
            }

            // ========== ЭТАП 14: Обработчики событий ==========

            btn.onclick = () => isOpen ? closePanel() : openPanel();
            label.onclick = () => isOpen ? closePanel() : openPanel();

            // ========== ЭТАП 15: Запуск ==========

            typeText();
            console.log('✅ Виджет инициализирован');

        } catch (e) {
            console.error('❌ Widget Error:', e);
        }
    }

    // ============================================================
    // РАЗДЕЛ 5: ЗАПУСК
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMina);
    } else {
        initMina();
    }

})();
