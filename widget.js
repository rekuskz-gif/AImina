// ██████████████████████████████████████████████████████████████████████████████
// ██                                                                          ██
// ██  ФАЙЛ: widget.js                                                         ██
// ██  ВЕРСИЯ: 4.7 - С ГЛОБАЛЬНЫМ FIREBASE LISTENER                            ██
// ██  НАЗНАЧЕНИЕ: Чат-виджет для вставки на веб-сайты                       ██
// ██                                                                          ██
// ██  ✨ НОВОЕ В 4.7:                                                         ██
// ██  🔥 Firebase listener работает ВСЕГДА - даже когда панель закрыта!       ██
// ██  🔥 Менеджер Reply появляются в реал-тайм синим цветом (manager класс)  ██
// ██  🔥 Красный значок (!) когда есть новые сообщения и панель закрыта     ██
// ██                                                                          ██
// ██  ИСПРАВЛЕНИЯ v4.7:                                                       ██
// ██  ✨ Добавлен ГЛОБАЛЬНЫЙ слушатель historyRef.on() ВНЕ openPanel()       ██
// ██     Раньше слушатель был ТОЛЬКО внутри openPanel() - не ловил новые     ██
// ██  ✨ Счётчик currentMsgCount отслеживает новые сообщения                 ██
// ██  ✨ Класс .amina-msg.manager для синего цвета ответов менеджера         ██
// ██                                                                          ██
// ██  ПОДКЛЮЧЕНИЕ НА САЙТ:                                                    ██
// ██  <script src="https://ai--mina.vercel.app/widget.js"                     ██
// ██          data-client-id="mina_001"></script>                             ██
// ██                                                                          ██
// ██████████████████████████████████████████████████████████████████████████████

(function() {
    'use strict';

    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    const backendUrl = 'https://ai--mina.vercel.app';
    const isMobile = window.innerWidth < 768;
    console.log(`📱 Версия: ${isMobile ? 'MOBILE 📱' : 'DESKTOP 🖥️'}`);

    function getSessionId() {
        let sessionId = localStorage.getItem(`aimina_session_${clientId}`);
        if (!sessionId) {
            sessionId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem(`aimina_session_${clientId}`, sessionId);
            console.log(`✅ Новый sessionId создан: ${sessionId}`);
        } else {
            console.log(`✅ sessionId найден в localStorage: ${sessionId}`);
        }
        return sessionId;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        console.log(`✅ CSS стили применены`);
    }

    async function initFirebase() {
        console.log('📦 Загружаем Firebase библиотеки...');
        await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

        const firebaseConfig = {
            apiKey: "AIzaSyBgXvb4GLdtaZlw5dgnYKGddOIpFYIXXAU",
            databaseURL: "https://aimina-d3597-default-rtdb.firebaseio.com",
            projectId: "aimina-d3597",
            appId: "1:590164687607:web:c9f97739c0358dfd2571f2"
        };

        if (!window.firebase) {
            console.error('❌ Firebase не загружен');
            return null;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase инициализирован');
        } else {
            console.log('✅ Firebase уже инициализирован');
        }
        
        return firebase.database();
    }

    async function loadConfigs() {
        try {
            console.log('⚙️ Загружаем widget_config (кнопка и облочка)...');
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            const config = await response.json();
            console.log('✅ widget_config загружен:', config);
            
            console.log('⚙️ Загружаем chat_config (панель чата)...');
            const chatResponse = await fetch(`${backendUrl}/api/chat_config?clientId=${clientId}`);
            const chatConfig = chatResponse.ok ? await chatResponse.json() : {};
            console.log('✅ chat_config загружен:', chatConfig);
            
            return { config, chatConfig };
        } catch (e) {
            console.error('❌ Ошибка загрузки конфига:', e.message);
            return { config: {}, chatConfig: {} };
        }
    }

    const baseStyles = `
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); } 70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        @keyframes fadeInMsg { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes notifyPulse { 0% { box-shadow: 0 0 0 0 rgba(255,0,0,0.7); } 70% { box-shadow: 0 0 0 15px rgba(255,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0); } }
        @keyframes typingDot { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
        
        .amina-widget { position: fixed; z-index: 999999; display: flex; align-items: center; gap: 10px; }
        .amina-btn { border-radius: 50%; border: none; cursor: pointer; padding: 0; animation: pulse 2s infinite; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative; flex-shrink: 0; }
        .amina-btn:hover { transform: scale(1.05); }
        .amina-btn img { border-radius: 50%; object-fit: cover; }
        .amina-badge { position: absolute; top: 0; right: 0; background: red; color: white; border-radius: 50%; font-size: 12px; font-weight: bold; align-items: center; justify-content: center; display: none; }
        .amina-btn.has-message { animation: notifyPulse 1s infinite !important; }
        .amina-label { padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); font-size: 13px; font-weight: bold; max-width: 200px; opacity: 0; transition: all 0.5s; cursor: pointer; }
        .amina-label.visible { opacity: 1; }
        .amina-name { font-size: 12px; margin-top: 6px; }
        .amina-panel { position: fixed; background: white; box-shadow: 0 -4px 30px rgba(0,0,0,0.15); z-index: 9999999; display: flex; flex-direction: column; overflow: hidden; animation: slideIn 0.3s ease; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
        .amina-panel.closing { animation: slideOut 0.3s ease forwards; }
        .amina-panel-header { padding: 14px 16px; color: white; display: flex; align-items: center; gap: 10px; flex-shrink: 0; position: relative; z-index: 9999998; pointer-events: auto; }
        .amina-panel-header img { border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); object-fit: cover; flex-shrink: 0; }
        .amina-panel-header-name { font-weight: bold; flex: 1; }
        .amina-panel-close { background: none; border: none; color: white; cursor: pointer; padding: 0; opacity: 0.8; transition: opacity 0.2s; font-size: 22px; pointer-events: auto; z-index: 9999999; }
        .amina-panel-close:hover { opacity: 1; }
        .amina-messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: #f0f2f5; }
        .amina-msg { padding: 10px 14px; border-radius: 18px; max-width: 80%; font-size: 14px; line-height: 1.4; word-wrap: break-word; animation: fadeInMsg 0.3s ease; }
        .amina-msg.bot { align-self: flex-start; background: white; color: #333; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .amina-msg.user { align-self: flex-end; color: white; border-bottom-right-radius: 4px; }
        .amina-msg.manager { align-self: flex-start; background: #e3f2fd; color: #333; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); border-left: 3px solid #2196F3; }
        .amina-typing { display: flex; gap: 4px; align-self: flex-start; padding: 12px 16px; background: white; border-radius: 18px; border-bottom-left-radius: 4px; }
        .amina-typing span { width: 7px; height: 7px; background: #999; border-radius: 50%; animation: typingDot 1.4s infinite; }
        .amina-typing span:nth-child(2) { animation-delay: 0.2s; }
        .amina-typing span:nth-child(3) { animation-delay: 0.4s; }
        .amina-input-area { padding: 12px; background: white; display: flex; gap: 8px; border-top: 1px solid #eee; flex-shrink: 0; }
        .amina-input { flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 22px; outline: none; font-size: 14px; font-family: inherit; transition: border-color 0.2s; }
        .amina-input:focus { border-color: #007bff; }
        .amina-send { border: none; color: white; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; transition: opacity 0.2s; width: 38px; height: 38px; }
        .amina-send:hover { opacity: 0.9; }
        .amina-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .amina-footer { text-align: center; padding: 6px; font-size: 11px; background: white; flex-shrink: 0; }
        .amina-footer a { text-decoration: none; transition: opacity 0.2s; }
        .amina-footer a:hover { opacity: 0.7; }
    `;

    const desktopStyles = `
        .amina-widget { bottom: 20px; right: 20px; }
        .amina-btn { width: 140px; height: 140px; }
        .amina-btn img { width: 116px; height: 116px; }
        .amina-badge { width: 40px; height: 40px; }
        @keyframes pulse-desktop { 0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); } 70% { box-shadow: 0 0 0 92px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
        .amina-btn { animation: pulse-desktop 2s infinite !important; }
        .amina-panel { bottom: 8px; right: 20px; width: 380px; height: 460px; border-radius: 16px; }
        .amina-panel-header-name { font-size: 15px; }
        .amina-panel-header img { width: 36px; height: 36px; }
    `;

    const mobileStyles = `
        .amina-widget { bottom: 10px; right: 10px; }
        .amina-btn { width: 128px; height: 128px; }
        .amina-btn img { width: 107px; height: 107px; }
        .amina-badge { width: 41px; height: 41px; font-size: 16px; }
        @keyframes pulse-mobile { 0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); } 70% { box-shadow: 0 0 0 92px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
        .amina-btn { animation: pulse-mobile 2s infinite !important; }
        .amina-label { max-width: 220px; font-size: 16px; padding: 12px 16px; }
        .amina-label .amina-name { font-size: 14px; }
        .amina-panel { bottom: 0; right: 8px; left: 8px; top: auto; width: auto; height: 100%; max-height: 90vh; border-radius: 16px 16px 0 0; }
        .amina-panel-header-name { font-size: 18px; }
        .amina-panel-header img { width: 64px; height: 64px; }
        .amina-input { font-size: 18px; }
    `;

    async function initMina() {
        try {
            console.log('🚀 Начинаем инициализацию виджета...');
            
            console.log('ЭТАП 1: Инициализация Firebase...');
            const db = await initFirebase();
            if (!db) throw new Error('Firebase инициализация не удалась');

            console.log('ЭТАП 2: Загрузка конфигов...');
            const { config, chatConfig } = await loadConfigs();
            
            console.log('ЭТАП 3: Получение sessionId...');
            const sessionId = getSessionId();
            
            console.log('ЭТАП 4: Загрузка истории сообщений...');
            const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
            console.log(`📝 Firebase путь: chats/${clientId}/${sessionId}`);

            let chatHistory = [];
            const snapshot = await historyRef.once('value');
            
            if (snapshot.exists()) {
                const val = snapshot.val();
                chatHistory = Array.isArray(val) ? val : [];
                console.log(`✅ История загружена: ${chatHistory.length} сообщений`);
            } else {
                console.log('📭 История пустая - новый пользователь');
            }

            console.log('ЭТАП 5: Применение CSS стилей...');
            const allStyles = baseStyles + (isMobile ? mobileStyles : desktopStyles);
            const coloredStyles = allStyles
                .replace(/linear-gradient\(135deg, [^)]+\)/g, 
                    `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`)
                .replace(/#007bff/g, config.colorStart || '#007bff');
            loadStyle(coloredStyles);

            console.log('ЭТАП 6: Создание HTML элементов...');
            
            const widget = document.createElement('div');
            widget.className = 'amina-widget';

            const label = document.createElement('div');
            label.className = 'amina-label';
            label.style.background = config.bgColor || '#ffffff';
            label.style.color = config.textColor || '#333333';

            const textSpan = document.createElement('span');
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'amina-name';
            nameDiv.style.color = config.textColor || '#666666';

            label.appendChild(textSpan);
            label.appendChild(nameDiv);

            const btn = document.createElement('button');
            btn.className = 'amina-btn';
            btn.style.background = `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`;
            btn.innerHTML = `
                <img src="${config.avatarUrl || ''}" alt="${config.botName || 'Bot'}" onerror="this.src='https://via.placeholder.com/60'">
                <span class="amina-badge" id="amina-badge">!</span>
            `;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);

            // ════════════════════════════════════════════════════════════════════════════════
            // ✨ ГЛАВНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ Блок 1
            // ════════════════════════════════════════════════════════════════════════════════
            let panel = null;
            let isOpen = false;
            let isLoading = false;
            let currentMsgCount = chatHistory.length;  // ✨ СЧЁТЧИК НОВЫХ СООБЩЕНИЙ

            // ════════════════════════════════════════════════════════════════════════════════
            // 🔥 ГЛОБАЛЬНЫЙ FIREBASE LISTENER - РАБОТАЕТ ВСЕГДА! Блок 2
            // ════════════════════════════════════════════════════════════════════════════════
            console.log('🔥 Подключаем глобальный Firebase listener...');
            
            historyRef.on('value', (snap) => {
                if (!snap.exists()) return;
                
                const val = snap.val();
                const firebaseHistory = Array.isArray(val) ? val : [];
                
                // Проверяем есть ли новые сообщения
                if (firebaseHistory.length > currentMsgCount) {
                    console.log(`📬 Firebase: НОВЫЕ СООБЩЕНИЯ! Было ${currentMsgCount}, стало ${firebaseHistory.length}`);
                    
                    // Берём только новые сообщения
                    const newMessages = firebaseHistory.slice(currentMsgCount);
                    
                    // Обновляем историю
                    chatHistory = firebaseHistory;
                    currentMsgCount = firebaseHistory.length;
                    
                    // Если панель открыта - показываем в чате
                    if (isOpen && panel) {
                        console.log(`  ➜ Панель открыта - показываем ${newMessages.length} новых сообщений`);
                        newMessages.forEach(msg => {
                            if (!msg) return;
                            if (msg.fromManager) {
                                console.log(`  📨 МЕНЕДЖЕР: ${msg.content.substring(0, 50)}...`);
                                addMsg(msg.content, 'manager');
                            }
                        });
                    } else {
                        // Если панель закрыта - показываем красный значок
                        const hasManagerMsg = newMessages.some(m => m && m.fromManager);
                        if (hasManagerMsg) {
                            console.log(`  ➜ Панель закрыта - показываем красный значок (!)`);
                            const badge = document.getElementById('amina-badge');
                            if (badge) {
                                badge.style.display = 'flex';
                                badge.textContent = '!';
                                btn.classList.add('has-message');
                            }
                        }
                    }
                }
            });
            
            console.log('✅ Глобальный listener подключен');

            // ════════════════════════════════════════════════════════════════════════════════
            // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ Блок 3
            // ════════════════════════════════════════════════════════════════════════════════

            function saveHistory() {
                historyRef.set(chatHistory).catch(e => console.error('❌ Ошибка сохранения:', e));
            }

            function addMsg(text, type) {
                const msgs = document.getElementById('amina-messages');
                if (!msgs) return;
                const div = document.createElement('div');
                div.className = `amina-msg ${type}`;
                div.innerText = text;
                if (type === 'user') {
                    div.style.background = `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`;
                }
                msgs.appendChild(div);
                scrollDown();
            }

            function scrollDown() {
                const msgs = document.getElementById('amina-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            function closePanel() {
                if (!panel) return;
                console.log('🔒 Закрываем панель...');
                isOpen = false;
                panel.classList.add('closing');
                
                setTimeout(() => {
                    if (panel) panel.remove();
                    panel = null;
                }, 300);
            }

            // ════════════════════════════════════════════════════════════════════════════════
            // ОТКРЫТЬ ПАНЕЛЬ Блок 4
            // ════════════════════════════════════════════════════════════════════════════════

            function openPanel() {
                if (isOpen) return;
                isOpen = true;
                console.log('🔓 Открываем панель...');

                const badge = document.getElementById('amina-badge');
                if (badge) badge.style.display = 'none';
                btn.classList.remove('has-message');

                let footerHtml = '';
                if (chatConfig.footerText) {
                    const safeText = document.createTextNode(chatConfig.footerText);
                    const tempDiv = document.createElement('div');
                    tempDiv.appendChild(safeText);
                    footerHtml = `
                        <div class="amina-footer">
                            <a href="${chatConfig.footerUrl || '#'}" target="_blank" style="color: ${chatConfig.footerColor || '#999999'}">
                                ${tempDiv.innerHTML}
                            </a>
                        </div>`;
                }

                panel = document.createElement('div');
                panel.className = 'amina-panel';
                panel.innerHTML = `
                    <div class="amina-panel-header" style="background: linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})">
                        <img src="${chatConfig.avatarUrl || config.avatarUrl || ''}" onerror="this.style.display='none'">
                        <span class="amina-panel-header-name">${chatConfig.botName || config.botName || 'AI Chat'}</span>
                        <button class="amina-panel-close" id="amina-close">✕</button>
                    </div>
                    <div class="amina-messages" id="amina-messages"></div>
                    <div class="amina-input-area">
                        <input class="amina-input" id="amina-input" placeholder="${chatConfig.placeholder || config.text2 || 'Введите сообщение...'}">
                        <button class="amina-send" id="amina-send" style="background: linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})">→</button>
                    </div>
                    ${footerHtml}
                `;
                document.body.appendChild(panel);

                if (chatHistory.length > 0) {
                    console.log(`📚 Показываем историю (${chatHistory.length} сообщений)`);
                    chatHistory.forEach(msg => {
                        if (!msg || msg.role === 'system') return;
                        const type = msg.fromManager ? 'manager' : (msg.role === 'assistant' ? 'bot' : 'user');
                        addMsg(msg.content, type);
                    });
                } else if (chatConfig.welcomeMsg) {
                    console.log('👋 Показываем приветствие');
                    addMsg(chatConfig.welcomeMsg, 'bot');
                    chatHistory.push({ role: 'assistant', content: chatConfig.welcomeMsg });
                    saveHistory();
                }

                const closeBtn = document.getElementById('amina-close');
                if (closeBtn) {
                    closeBtn.onclick = (e) => {
                        e.stopPropagation();
                        closePanel();
                    };
                }
                
                document.getElementById('amina-send').onclick = sendMsg;
                document.getElementById('amina-input').addEventListener('keypress', e => {
                    if (e.key === 'Enter') sendMsg();
                });
            }

            // ════════════════════════════════════════════════════════════════════════════════
            // ОТПРАВИТЬ СООБЩЕНИЕ  Блок 5
            // ════════════════════════════════════════════════════════════════════════════════

            async function sendMsg() {
                if (isLoading) return;
                
                const input = document.getElementById('amina-input');
                const sendBtn = document.getElementById('amina-send');
                const text = input.value.trim();
                
                if (!text) return;

                console.log(`✉️ Юзер отправляет: ${text.substring(0, 50)}...`);

                addMsg(text, 'user');
                input.value = '';

                const userMsgIndex = chatHistory.length;
                chatHistory.push({ role: 'user', content: text });
                saveHistory();

                const typingDiv = document.createElement('div');
                typingDiv.className = 'amina-typing';
                typingDiv.innerHTML = '<span></span><span></span><span></span>';
                document.getElementById('amina-messages').appendChild(typingDiv);
                scrollDown();

                isLoading = true;
                sendBtn.disabled = true;
                input.disabled = true;

                try {
                    console.log('🚀 Отправляем запрос в Claude AI...');
                    const res = await fetch(`${backendUrl}/api/authentication`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            clientId,
                            sessionId,
                            messages: chatHistory
                        })
                    });

                    if (typingDiv) typingDiv.remove();
                    
                    const result = await res.json();

                    if (result.aiDisabled) {
                        console.log('⏸️ ИИ выключен');
                        addMsg('Менеджер ответит вам в ближайшее время...', 'bot');
                        return;
                    }

                    if (!res.ok || !result.text) throw new Error(result.error || 'API error');

                    console.log('🤖 Claude ответил');
                    addMsg(result.text, 'bot');
                    chatHistory.push({ role: 'assistant', content: result.text });
                    saveHistory();

                } catch (e) {
                    if (typingDiv && typingDiv.parentNode) typingDiv.remove();
                    console.error('❌ Ошибка:', e.message);
                    chatHistory.splice(userMsgIndex, 1);
                    
                } finally {
                    isLoading = false;
                    if (sendBtn) sendBtn.disabled = false;
                    if (input) {
                        input.disabled = false;
                        input.focus();
                    }
                }
            }

            // ════════════════════════════════════════════════════════════════════════════════
            // ПЕЧАТЬ ТЕКСТА В ОБЛОЧКЕ Блок 5
            // ════════════════════════════════════════════════════════════════════════════════

            async function typeText() {
                label.classList.add('visible');
                console.log('✏️ Начинаем печать текста в облочке...');
                
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
                
                nameDiv.textContent = config.botName || 'Bot';
                console.log('✅ Печать завершена');
            }

            // ════════════════════════════════════════════════════════════════════════════════
            // ОБРАБОТЧИКИ СОБЫТИЙ Блок 7
            // ════════════════════════════════════════════════════════════════════════════════

            btn.onclick = () => isOpen ? closePanel() : openPanel();
            label.onclick = () => isOpen ? closePanel() : openPanel();

            typeText();
            console.log('✅ Виджет инициализирован и готов к использованию!');

        } catch (e) {
            console.error('❌ Ошибка виджета:', e.message);
        }
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // АВТОЗАПУСК Блок 8
    // ════════════════════════════════════════════════════════════════════════════════

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMina);
        console.log('⏳ Ждём загрузки страницы...');
    } else {
        initMina();
    }

})();
