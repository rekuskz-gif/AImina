(function() {
    // 1. Получаем clientId из настроек скрипта на сайте
    const scriptTag = document.currentScript;
    const clientId = scriptTag.getAttribute('data-client-id') || 'default';
    const backendUrl = 'https://vercel.app'; // Замените на ваш URL Vercel позже

    async function initWidget() {
        try {
            // 2. Загружаем настройки именно для этого clientId из вашей Google Таблицы (через Vercel)
            const response = await fetch(`${backendUrl}?clientId=${clientId}`);
            const config = await response.json();

            // 3. Создаем стили динамически на основе данных из таблицы
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
                    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
                }
                .amina-widget { position: fixed; bottom: ${config.bottom || '20px'}; right: 20px; z-index: 9999; display: flex; align-items: center; gap: 10px; }
                .amina-btn { 
                    width: 120px; height: 120px; border-radius: 50%; 
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd}); 
                    border: none; cursor: pointer; animation: pulse 2s infinite; 
                    display: flex; align-items: center; justify-content: center; transition: transform 0.2s;
                }
                .amina-btn img { width: 100px; height: 100px; border-radius: 50%; }
                .amina-label { 
                    background: white; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; color: #333;
                    max-width: 200px; opacity: 0; transition: all 0.5s; 
                }
                .amina-label.visible { opacity: 1; }
                .amina-name { display: block; font-size: 12px; color: #666; margin-top: 6px; font-weight: normal; }
            `;
            document.head.appendChild(style);

            // 4. Создаем визуальные элементы
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

            // Открытие окна чата
            const openChat = () => {
                window.open(`https://vercel.app{clientId}`, 'amina', 'width=680,height=800');
            };

            btn.onclick = openChat;
            label.onclick = openChat;

            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);

            // 5. Функция печатания текста (берет фразы из конфига)
            async function typeEffect(element, text) {
                element.textContent = '';
                for (let char of text) {
                    element.textContent += char;
                    await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                }
            }

            // Запуск анимации
            label.classList.add('visible');
            await typeEffect(textSpan, config.text1);
            await new Promise(r => setTimeout(r, 2000));
            await typeEffect(textSpan, config.text2);
            nameDiv.textContent = config.botName;

        } catch (err) {
            console.error('Ошибка загрузки AI Mina:', err);
        }
    }

    initWidget();
})();
