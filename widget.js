(function() {
    // 1. ПОЛУЧАЕМ НАСТРОЙКИ С САЙТА КЛИЕНТА
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'default';
    // URL вашего бэкенда на Vercel (замените на свой после деплоя)
    const backendUrl = 'https://ai--mina.vercel.app'; 

    async function initMina() {
        try {
            // 2. ЗАПРОС НАСТРОЕК ИЗ GOOGLE ТАБЛИЦЫ
            const response = await fetch(`${backendUrl}?clientId=${clientId}`);
            if (!response.ok) throw new Error('Config not found');
            const config = await response.json();

            // 3. ДОБАВЛЯЕМ СТИЛИ (скелет + переменные из таблицы)
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
                    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
                }
                .amina-widget {
                    position: fixed;
                    bottom: ${config.bottomSpacing || '20px'};
                    right: ${config.position === 'left' ? 'auto' : '20px'};
                    left: ${config.position === 'left' ? '20px' : 'auto'};
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-direction: ${config.position === 'left' ? 'row-reverse' : 'row'};
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
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    font-family: Arial, sans-serif; font-size: 13px; font-weight: bold;
                    color: #333; max-width: 200px; opacity: 0;
                    transition: all 0.5s; cursor: pointer;
                }
                .amina-label.visible { opacity: 1; }
                .amina-name { display: block; font-size: 12px; color: #666; margin-top: 6px; font-weight: normal; }
                .cursor { display: inline-block; width: 2px; height: 14px; background: #333; margin-left: 2px; animation: blink 0.6s infinite; }
                @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
            `;
            document.head.appendChild(style);

            // 4. СОЗДАЕМ ЭЛЕМЕНТЫ
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
            btn.innerHTML = `<img src="${config.avatarUrl}" alt="${config.botName}">`;

            // ФУНКЦИЯ ОТКРЫТИЯ ЧАТА
            const openChat = () => {
                window.open(`https://vercel.app{clientId}`, 'amina', 'width=680,height=800');
            };

            btn.onclick = openChat;
            label.onclick = openChat;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);

            // 5. ЛОГИКА ПЕЧАТАНИЯ (эффект из вашего кода)
            async function typeText() {
                label.classList.add('visible');
                
                // Печатаем текст 1
                for (let char of config.text1) {
                    textSpan.textContent += char;
                    await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                }
                
                await new Promise(r => setTimeout(r, 2000)); // Пауза
                
                // Печатаем текст 2
                textSpan.textContent = '';
                for (let char of config.text2) {
                    textSpan.textContent += char;
                    await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                }
                
                nameDiv.textContent = config.botName;
            }

            typeText();

        } catch (e) {
            console.error('Almina Widget Error:', e);
        }
    }

    initMina();
})();
