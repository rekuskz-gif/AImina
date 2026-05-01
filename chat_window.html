<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chat</title>
    <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            display: flex; flex-direction: column; 
            height: 100vh; background: #f0f2f5; overflow: hidden;
        }
        #chat-header { 
            padding: 10px 20px; color: white; font-weight: bold; font-size: 16px; 
            display: flex; align-items: center; gap: 10px;
            background: #7c3aed; min-height: 60px; flex-shrink: 0;
        }
        #chat-header img {
            width: 38px; height: 38px; border-radius: 50%;
            object-fit: cover; border: 2px solid rgba(255,255,255,0.4);
        }
        #chat-messages { 
            flex: 1; overflow-y: auto; padding: 15px; 
            display: flex; flex-direction: column; gap: 12px; background: #f0f2f5;
        }
        .msg { 
            padding: 10px 14px; border-radius: 18px; max-width: 80%; 
            font-size: 14px; line-height: 1.4; word-wrap: break-word;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .bot { 
            align-self: flex-start; background: #ffffff; color: #333; 
            border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .user { align-self: flex-end; color: white; border-bottom-right-radius: 4px; }
        .typing {
            display: flex; gap: 4px; align-self: flex-start;
            padding: 12px 16px; background: white;
            border-radius: 18px; border-bottom-left-radius: 4px;
        }
        .typing span {
            width: 8px; height: 8px; background: #999;
            border-radius: 50%; animation: typing 1.4s infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing {
            0%, 60%, 100% { opacity: 0.5; }
            30% { opacity: 1; }
        }
        #chat-input-area { 
            padding: 15px 15px 8px 15px; background: white; 
            display: flex; gap: 10px; border-top: 1px solid #ddd; flex-shrink: 0;
        }
        input { 
            flex: 1; padding: 12px 15px; border: 1px solid #ddd; 
            border-radius: 25px; outline: none; font-size: 14px; transition: border-color 0.2s;
        }
        button { 
            border: none; background: #7c3aed; color: white; 
            width: 40px; height: 40px; border-radius: 50%; cursor: pointer; 
            font-weight: bold; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; flex-shrink: 0;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.95); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .error-msg {
            background: #fee; color: #c33; padding: 12px;
            border-radius: 8px; font-size: 13px; margin: 10px; border: 1px solid #fcc;
        }
        #chat-footer {
            background: white; text-align: center;
            padding: 6px 15px 10px 15px; font-size: 11px; display: none;
        }
        #chat-footer a { text-decoration: none; font-weight: bold; }
        #chat-footer a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div id="chat-header">Загрузка...</div>
    <div id="chat-messages"></div>
    <div id="chat-input-area">
        <input type="text" id="user-msg" placeholder="Введите сообщение...">
        <button id="send-btn">→</button>
    </div>
    <div id="chat-footer"></div>

    <script>
        // Firebase инициализация
        const firebaseConfig = {
            apiKey: "AIzaSyBgXvb4GLdtaZlw5dgnYKGddOIpFYIXXAU",
            databaseURL: "https://aimina-d3597-default-rtdb.firebaseio.com",
            projectId: "aimina-d3597",
            appId: "1:590164687607:web:c9f97739c0358dfd2571f2"
        };
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();

        const params = new URLSearchParams(window.location.search);
        const clientId = params.get('clientId');
        const historyRef = db.ref(`chats/${clientId}/chat`);

        let config = null;
        let isLoading = false;
        let chatHistory = [];

        document.getElementById('user-msg').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') send();
        });
        document.getElementById('send-btn').addEventListener('click', function() {
            send();
        });

        async function loadConfig() {
            try {
                if (!clientId) throw new Error('clientId not found in URL');

                const res = await fetch(`/api/chat_config?clientId=${clientId}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load config');
                config = data;

                const header = document.getElementById('chat-header');
                const btn = document.getElementById('send-btn');
                const input = document.getElementById('user-msg');
                const footer = document.getElementById('chat-footer');

                header.style.background = config.headerColor || '#7c3aed';
                btn.style.background = config.headerColor || '#7c3aed';
                input.placeholder = config.placeholder || 'Введите сообщение...';

                header.innerHTML = '';
                if (config.avatarUrl) {
                    const img = document.createElement('img');
                    img.src = config.avatarUrl;
                    img.onerror = () => img.style.display = 'none';
                    header.appendChild(img);
                }
                const nameSpan = document.createElement('span');
                nameSpan.textContent = config.botName || 'AI Chat';
                header.appendChild(nameSpan);

                const styleElement = document.createElement('style');
                let css = `.user { background: ${config.userBubbleColor || '#7c3aed'} !important; }
                           .bot { background: ${config.botBubbleColor || '#ffffff'} !important; }
                           input:focus { border-color: ${config.headerColor || '#7c3aed'} !important; }`;
                if (config.customCSS && config.customCSS.trim()) css += '\n' + config.customCSS;
                styleElement.textContent = css;
                document.head.appendChild(styleElement);

                if (config.footerText && config.footerText.trim()) {
                    footer.style.display = 'block';
                    footer.innerHTML = `<a href="${config.footerUrl || '#'}" target="_blank" style="color: ${config.footerColor || '#999'}">${config.footerText}</a>`;
                }

                // Загружаем историю из Firebase
                const snapshot = await historyRef.once('value');
                if (snapshot.exists()) {
                    chatHistory = snapshot.val() || [];
                    chatHistory.forEach(msg => {
                        if (msg.role !== 'system') {
                            addMsg(msg.content, msg.role === 'assistant' ? 'bot' : 'user');
                        }
                    });
                } else if (config.welcomeMsg) {
                    addMsg(config.welcomeMsg, 'bot');
                    chatHistory.push({ role: 'assistant', content: config.welcomeMsg });
                    historyRef.set(chatHistory);
                }

            } catch (error) {
                console.error('❌ Config error:', error);
                addMsg(`❌ Ошибка загрузки: ${error.message}`, 'error');
                document.getElementById('user-msg').disabled = true;
                document.getElementById('send-btn').disabled = true;
            }
        }

        async function send() {
            if (isLoading || !config) return;
            const input = document.getElementById('user-msg');
            const btn = document.getElementById('send-btn');
            const text = input.value.trim();
            if (!text) return;

            addMsg(text, 'user');
            input.value = '';
            chatHistory.push({ role: 'user', content: text });
            historyRef.set(chatHistory);

            const typingDiv = document.createElement('div');
            typingDiv.className = 'typing';
            typingDiv.innerHTML = '<span></span><span></span><span></span>';
            document.getElementById('chat-messages').appendChild(typingDiv);
            document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;

            isLoading = true;
            btn.disabled = true;
            input.disabled = true;

            try {
                const res = await fetch('/api/authentication', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ clientId, messages: chatHistory })
                });
                typingDiv.remove();
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || 'API error');

                addMsg(result.text, 'bot');
                chatHistory.push({ role: 'assistant', content: result.text });
                historyRef.set(chatHistory);

            } catch (error) {
                console.error('Send error:', error);
                addMsg(`❌ ${error.message}`, 'error');
                chatHistory.pop();
            } finally {
                typingDiv.remove();
                isLoading = false;
                btn.disabled = false;
                input.disabled = false;
                input.focus();
            }
        }

        function addMsg(text, type) {
            const div = document.createElement('div');
            div.className = type === 'error' ? 'error-msg' : `msg ${type}`;
            div.innerText = text;
            const container = document.getElementById('chat-messages');
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }

        loadConfig();
    </script>
</body>
</html>
