(function() {
    // CORS FIX
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    const backendUrl = 'https://ai--mina.vercel.app';


(function() {
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    const backendUrl = 'https://ai--mina.vercel.app';

    async function initMina() {
        try {
            console.log('Загружаю конфиг для:', clientId);
            
            // ЗАПРАШИВАЕМ КОНФИГ
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) {
                throw new Error(`API ошибка: ${response.status}`);
            }
            
            const config = await response.json();
            console.log('Конфиг загружен:', config);

            // СТИЛИ
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
                    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
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
                    width: 120px; height: 120px; border-radius: 50%;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    border: none; cursor: pointer; padding: 0;
                    animation: pulse 2s infinite; display: flex;
                    align-items: center; justify-content: center;
                    transition: transform 0.2s;
                }
                .amina-btn:hover { transform: scale(1.05); }
                .amina-btn img { width: 100px; height: 100px; border-radius: 50%; }
                .amina-label {
                    background: white; padding: 12px 16px; border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    font-family: Arial, sans-serif; font-size: 13px; font-weight: bold;
                    color: #333; max-width: 200px; opacity: 0;
                    transition: all 0.5s; cursor: pointer;
                }
                .amina-label.visible { opacity: 1; }
                .amina-name { font-size: 12px; color: #666; margin-top: 6px; }
            `;
            document.head.appendChild(style);

            // ЭЛЕМЕНТЫ
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
            btn.innerHTML = `<img src="${config.avatarUrl}" alt="${config.botName}" onerror="this.src='https://via.placeholder.com/100'">`;

            const openChat = () => {
                window.open(`${backendUrl}/chat_window.html?clientId=${clientId}`, 'amina', 'width=680,height=800');
            };

            btn.onclick = openChat;
            label.onclick = openChat;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);

            // ПЕЧАТАНИЕ
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
