// ============================================================
// ФАЙЛ: widget.js (ГЛАВНЫЙ)
// НАЗНАЧЕНИЕ: Точка входа виджета
// Определяет Desktop/Mobile и загружает нужные компоненты
// С ОБЛОЧКОЙ НА МОБИЛКЕ!
// ============================================================

(function() {
    'use strict';

    // Конфиг
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    const backendUrl = 'https://ai--mina.vercel.app';
    
    // Определяем версию
    const isMobile = window.innerWidth < 768;
    console.log(`📱 Версия: ${isMobile ? 'MOBILE' : 'DESKTOP'}`);

    // ============================================================
    // РАЗДЕЛ 1: ОБЩИЕ ФУНКЦИИ (ИСПОЛЬЗУЮТСЯ В ОБЕИХ ВЕРСИЯХ)
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
    }

    // ============================================================
    // РАЗДЕЛ 2: FIREBASE ИНИЦИАЛИЗАЦИЯ
    // ============================================================

    async function initFirebase() {
        console.log('📦 Загружаем Firebase...');
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
        }
        console.log('✅ Firebase загружен');
        return firebase.database();
    }

    // ============================================================
    // РАЗДЕЛ 3: ЗАГРУЗКА КОНФИГОВ
    // ============================================================

    async function loadConfigs() {
        try {
            console.log('⚙️ Загружаем widget_config...');
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            const config = await response.json();
            
            console.log('⚙️ Загружаем chat_config...');
            const chatResponse = await fetch(`${backendUrl}/api/chat_config?clientId=${clientId}`);
            const chatConfig = chatResponse.ok ? await chatResponse.json() : {};
            
            return { config, chatConfig };
        } catch (e) {
            console.error('❌ Ошибка загрузки конфига:', e.message);
            return { config: {}, chatConfig: {} };
        }
    }

    // ============================================================
    // РАЗДЕЛ 4: CSS СТИЛИ (ОБЩИЕ)
    // ============================================================

    const baseStyles = `
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); }
            70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
            100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes fadeInMsg {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes notifyPulse {
            0% { box-shadow: 0 0 0 0 rgba(255,0,0,0.7); }
            70% { box-shadow: 0 0 0 15px rgba(255,0,0,0); }
            100% { box-shadow: 0 0 0 0 rgba(255,0,0,0); }
        }
        @keyframes typingDot {
            0%, 60%, 100% { opacity: 0.3; }
            30% { opacity: 1; }
        }
        
        .amina-widget { position: fixed; z-index: 9999; display: flex; align-items: center; gap: 10px; }
        .amina-btn { border-radius: 50%; border: none; cursor: pointer; padding: 0; animation: pulse 2s infinite; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative; flex-shrink: 0; }
        .amina-btn:hover { transform: scale(1.05); }
        .amina-btn img { border-radius: 50%; object-fit: cover; }
        .amina-badge { position: absolute; top: 0; right: 0; background: red; color: white; border-radius: 50%; font-size: 12px; font-weight: bold; align-items: center; justify-content: center; display: none; }
        .amina-btn.has-message { animation: notifyPulse 1s infinite !important; }
        .amina-label { padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); font-size: 13px; font-weight: bold; max-width: 200px; opacity: 0; transition: all 0.5s; cursor: pointer; }
        .amina-label.visible { opacity: 1; }
        .amina-name { font-size: 12px; margin-top: 6px; }
        .amina-panel { position: fixed; background: white; box-shadow: 0 -4px 30px rgba(0,0,0,0.15); z-index: 99999; display: flex; flex-direction: column; overflow: hidden; animation: slideIn 0.3s ease; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
        .amina-panel.closing { animation: slideOut 0.3s ease forwards; }
        .amina-panel-header { padding: 14px 16px; color: white; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .amina-panel-header img { border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); object-fit: cover; flex-shrink: 0; }
        .amina-panel-header-name { font-weight: bold; flex: 1; }
        .amina-panel-close { background: none; border: none; color: white; cursor: pointer; padding: 0; opacity: 0.8; transition: opacity 0.2s; font-size: 22px; }
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

    // Desktop стили
    const desktopStyles = `
        .amina-widget { bottom: 20px; right: 20px; }
        .amina-btn { width: 70px; height: 70px; }
        .amina-btn img { width: 58px; height: 58px; }
        .amina-badge { width: 20px; height: 20px; }
        .amina-panel { bottom: 100px; right: 20px; width: 380px; height: 580px; border-radius: 16px; }
        .amina-panel-header-name { font-size: 15px; }
        .amina-panel-header img { width: 36px; height: 36px; }
    `;

    // Mobile стили - С ОБЛОЧКОЙ!
    const mobileStyles = `
        .amina-widget { bottom: 10px; right: 10px; }
        .amina-btn { width: 50px; height: 50px; }
        .amina-btn img { width: 42px; height: 42px; }
        .amina-badge { width: 16px; height: 16px; font-size: 10px; }
        .amina-label { max-width: 110px; font-size: 11px; padding: 8px 12px; }
        .amina-label .amina-name { font-size: 10px; }
        .amina-panel { bottom: 0; right: 0; left: 0; top: auto; width: 100%; height: 100%; max-height: 90vh; border-radius: 16px 16px 0 0; }
        .amina-panel-header-name { font-size: 14px; }
        .amina-panel-header img { width: 32px; height: 32px; }
        .amina-input { font-size: 16px; }
    `;

    // ============================================================
    // РАЗДЕЛ 5: ОСНОВНАЯ ЛОГИКА
    // ============================================================

    async function initMina() {
        try {
            // Инициализация Firebase
            const db = await initFirebase();
            if (!db) throw new Error('Firebase инициализация не удалась');

            // Загрузка конфигов
            const { config, chatConfig } = await loadConfigs();
            const sessionId = getSessionId();
            const historyRef = db.ref(`chats/${clientId}/${sessionId}`);

            // Загрузка истории
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

            // Применяем стили
            const allStyles = baseStyles + (isMobile ? mobileStyles : desktopStyles);
            const coloredStyles = allStyles
                .replace(/linear-gradient\(135deg, [^)]+\)/g, `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`)
                .replace(/#007bff/g, config.colorStart || '#007bff');
            loadStyle(coloredStyles);
            console.log('✅ Стили применены');

            // Создание элементов
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
            btn.innerHTML = `<img src="${config.avatarUrl || ''}" alt="${config.botName || 'Bot'}" onerror="this.src='https://via.placeholder.com/60'"><span class="amina-badge" id="amina-badge">!</span>`;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);
            console.log('✅ Виджет добавлен');

            // Состояние
            let panel = null;
            let isOpen = false;
            let isLoading = false;
            let historyUnsubscribe = null;

            // Вспомогательные функции
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

            // Открыть панель
            function openPanel() {
                if (isOpen) return;
                isOpen = true;

                const badge = document.getElementById('amina-badge');
                if (badge) badge.style.display = 'none';
                btn.classList.remove('has-message');

                const footerHtml = chatConfig.footerText ? `
                    <div class="amina-footer">
                        <a href="${chatConfig.footerUrl || '#'}" target="_blank" style="color: ${chatConfig.footerColor || '#999999'}">
                            ${chatConfig.footerText}
                        </a>
                    </div>` : '';

                panel = document.createElement('div');
                panel.className = 'amina-panel';
                panel.style.borderRadius = isMobile ? '16px 16px 0 0' : '16px';
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

                const messagesDiv = document.getElementById('amina-messages');
                if (chatHistory.length > 0) {
                    chatHistory.forEach(msg => {
                        if (!msg || msg.role === 'system') return;
                        const type = msg.fromManager ? 'manager' : (msg.role === 'assistant' ? 'bot' : 'user');
                        addMsg(msg.content, type);
                    });
                } else if (chatConfig.welcomeMsg) {
                    addMsg(chatConfig.welcomeMsg, 'bot');
                    chatHistory.push({ role: 'assistant', content: chatConfig.welcomeMsg });
                    saveHistory();
                }

                document.getElementById('amina-close').onclick = closePanel;
                document.getElementById('amina-send').onclick = sendMsg;
                document.getElementById('amina-input').addEventListener('keypress', e => {
                    if (e.key === 'Enter') sendMsg();
                });

                historyUnsubscribe = historyRef.on('value', snap => {
                    if (!snap.exists()) return;
                    const val = snap.val();
                    const newHistory = Array.isArray(val) ? val : [];
                    if (newHistory.length > chatHistory.length) {
                        const newMessages = newHistory.slice(chatHistory.length);
                        chatHistory = newHistory;
                        newMessages.forEach(msg => {
                            if (msg && msg.fromManager) {
                                addMsg(msg.content, 'manager');
                            }
                        });
                    }
                });
            }

            // Закрыть панель
            function closePanel() {
                if (!panel) return;
                isOpen = false;
                panel.classList.add('closing');
                if (historyUnsubscribe) {
                    historyUnsubscribe();
                    historyUnsubscribe = null;
                }
                setTimeout(() => {
                    if (panel) panel.remove();
                    panel = null;
                }, 300);
            }

            // Отправить сообщение
            async function sendMsg() {
                if (isLoading) return;
                const input = document.getElementById('amina-input');
                const sendBtn = document.getElementById('amina-send');
                const text = input.value.trim();
                if (!text) return;

                addMsg(text, 'user');
                input.value = '';
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
                    const res = await fetch(`${backendUrl}/api/authentication`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clientId, sessionId, messages: chatHistory })
                    });

                    if (typingDiv) typingDiv.remove();
                    const result = await res.json();

                    if (result.aiDisabled) {
                        addMsg('Менеджер ответит вам в ближайшее время...', 'bot');
                        return;
                    }

                    if (!res.ok || !result.text) throw new Error(result.error || 'API error');

                    addMsg(result.text, 'bot');
                    chatHistory.push({ role: 'assistant', content: result.text });
                    saveHistory();

                } catch (e) {
                    if (typingDiv && typingDiv.parentNode) typingDiv.remove();
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

            // Анимация печати
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
                nameDiv.textContent = config.botName || 'Bot';
            }

            // Обработчики
            btn.onclick = () => isOpen ? closePanel() : openPanel();
            label.onclick = () => isOpen ? closePanel() : openPanel();

            typeText();
            console.log('✅ Виджет инициализирован');

        } catch (e) {
            console.error('❌ Widget Error:', e.message);
        }
    }

    // ============================================================
    // ЗАПУСК
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMina);
    } else {
        initMina();
    }

})();
