(function() {
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    const backendUrl = 'https://ai--mina.vercel.app';

    async function initMina() {
        try {
            console.log('Загружаю конфиг для:', clientId);
            
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            
            const config = await response.json();
            console.log('Конфиг загружен:', config);

            // Стили
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
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
                .amina-widget {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .amina-btn {
                    width: 70px; height: 70px; border-radius: 50%;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    border: none; cursor: pointer; padding: 0;
                    animation: pulse 2s infinite; display: flex;
                    align-items: center; justify-content: center;
                    transition: transform 0.2s;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                .amina-btn:hover { transform: scale(1.05); }
                .amina-btn img { width: 58px; height: 58px; border-radius: 50%; }
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
                .amina-panel.closing {
                    animation: slideOut 0.3s ease forwards;
                }
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
                    width: 36px; height: 36px; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.4);
                    object-fit: cover;
                }
                .amina-panel-header-name {
                    font-weight: bold; font-size: 15px; flex: 1;
                }
                .amina-panel-close {
                    background: none; border: none; color: white;
                    font-size: 22px; cursor: pointer; padding: 0;
                    line-height: 1; opacity: 0.8;
                    transition: opacity 0.2s;
                    width: auto; height: auto; border-radius: 0;
                    box-shadow: none; animation: none;
                }
                .amina-panel-close:hover { opacity: 1; transform: none; }
                .amina-messages {
                    flex: 1; overflow-y: auto; padding: 15px;
                    display: flex; flex-direction: column; gap: 10px;
                    background: #f0f2f5;
                }
                .amina-msg {
                    padding: 10px 14px; border-radius: 18px;
                    max-width: 80%; font-size: 14px; line-height: 1.4;
                    word-wrap: break-word;
                    animation: fadeInMsg 0.3s ease;
                }
                .amina-msg.bot {
                    align-self: flex-start;
                    background: white; color: #333;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .amina-msg.user {
                    align-self: flex-end;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    border-bottom-right-radius: 4px;
                }
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
                .amina-input-area {
                    padding: 12px; background: white;
                    display: flex; gap: 8px;
                    border-top: 1px solid #eee; flex-shrink: 0;
                }
                .amina-input {
                    flex: 1; padding: 10px 14px;
                    border: 1px solid #ddd; border-radius: 22px;
                    outline: none; font-size: 14px;
                    font-family: inherit;
                    transition: border-color 0.2s;
                }
                .amina-input:focus {
                    border-color: ${config.colorStart};
                }
                .amina-send {
                    border: none;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white; width: 38px; height: 38px;
                    border-radius: 50%; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 16px; flex-shrink: 0;
                    transition: opacity 0.2s;
                    animation: none; box-shadow: none;
                }
                .amina-send:hover { opacity: 0.9; transform: none; }
                .amina-send:disabled { opacity: 0.5; }
            `;
            document.head.appendChild(style);

            // Виджет кнопка
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
            btn.innerHTML = `<img src="${config.avatarUrl}" alt="${config.botName}" onerror="this.src='https://via.placeholder.com/60'">`;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);

            // Панель чата
            let panel = null;
            let isOpen = false;
            let isLoading = false;
            let chatHistory = [];

            function openPanel() {
                if (isOpen) return;
                isOpen = true;

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

                // Приветствие
                if (chatHistory.length === 0 && config.text1) {
                    addMsg(config.text1, 'bot');
                    chatHistory.push({ role: 'assistant', content: config.text1 });
                }

                document.getElementById('amina-close').onclick = closePanel;
                document.getElementById('amina-send').onclick = sendMsg;
                document.getElementById('amina-input').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') sendMsg();
                });
            }

            function closePanel() {
                if (!panel) return;
                panel.classList.add('closing');
                setTimeout(() => {
                    panel.remove();
                    panel = null;
                    isOpen = false;
                }, 300);
            }

            async function sendMsg() {
                if (isLoading) return;
                const input = document.getElementById('amina-input');
                const sendBtn = document.getElementById('amina-send');
                const text = input.value.trim();
                if (!text) return;

                addMsg(text, 'user');
                input.value = '';
                chatHistory.push({ role: 'user', content: text });

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
                        body: JSON.stringify({ clientId, messages: chatHistory })
                    });

                    typingDiv.remove();
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.error || 'API error');

                    addMsg(result.text, 'bot');
                    chatHistory.push({ role: 'assistant', content: result.text });

                } catch (e) {
                    typingDiv.remove();
                    addMsg('❌ Ошибка соединения', 'bot');
                    chatHistory.pop();
                } finally {
                    isLoading = false;
                    if (sendBtn) sendBtn.disabled = false;
                    if (input) { input.disabled = false; input.focus(); }
                }
            }

            function addMsg(text, type) {
                const div = document.createElement('div');
                div.className = `amina-msg ${type}`;
                div.innerText = text;
                document.getElementById('amina-messages').appendChild(div);
                scrollDown();
            }

            function scrollDown() {
                const msgs = document.getElementById('amina-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            btn.onclick = () => isOpen ? closePanel() : openPanel();
            label.onclick = () => isOpen ? closePanel() : openPanel();

            // Анимация текста
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

            typeText();

        } catch (e) {
            console.error('Almina Widget Error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMina);
    } else {
        initMina();
    }
})();
