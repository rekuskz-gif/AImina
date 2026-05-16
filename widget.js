// ============================================================
// ФАЙЛ: widget.js (ГЛАВНЫЙ)
// НАЗНАЧЕНИЕ: Точка входа виджета для всех сайтов
// - Определяет Desktop/Mobile версию
// - Загружает Firebase, конфиги, стили
// - Управляет чатом, сообщениями, API
// ПОДКЛЮЧЕНИЕ: <script src="https://ai--mina.vercel.app/widget.js" data-client-id="mina_001"></script>
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // РАЗДЕЛ 1: КОНФИГУРАЦИЯ (Основные переменные)
    // ============================================================

    // scriptTag = получаем <script> элемент который загрузил этот код
    const scriptTag = document.currentScript;

    // clientId = уникальный ID клиента из атрибута data-client-id
    // Пример: data-client-id="mina_001"
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';

    // backendUrl = адрес сервера где живут все API функции
    const backendUrl = 'https://ai--mina.vercel.app';
    
    // isMobile = определяем версию (Desktop или Mobile)
    // Если ширина экрана < 768px = мобилка
    const isMobile = window.innerWidth < 768;
    console.log(`📱 Версия: ${isMobile ? 'MOBILE' : 'DESKTOP'}`);

    // ============================================================
    // РАЗДЕЛ 2: ФУНКЦИЯ getSessionId() 
    // НАЗНАЧЕНИЕ: Получить или создать уникальный ID браузера
    // Сохраняется в localStorage чтобы пользователь был одним и тем же
    // ============================================================

    function getSessionId() {
        // Ищем существующий sessionId в localStorage
        let sessionId = localStorage.getItem(`aimina_session_${clientId}`);
        
        if (!sessionId) {
            // Если нет - создаём новый
            // Формат: user_СЛУЧАЙНОЕ_ВРЕМЯ
            sessionId = 'user_' +
                       Math.random().toString(36).substr(2, 9) +  // случайные символы
                       '_' +
                       Date.now();  // текущее время в миллисекундах
            
            // Сохраняем в localStorage (чтобы при перезагрузке был же ID)
            localStorage.setItem(`aimina_session_${clientId}`, sessionId);
        }
        return sessionId;
    }

    // ============================================================
    // РАЗДЕЛ 3: ФУНКЦИЯ loadScript(src)
    // НАЗНАЧЕНИЕ: Динамически загружать JavaScript файлы
    // Нужна для загрузки Firebase скриптов
    // ============================================================

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;   // успешно загружено
            script.onerror = reject;   // ошибка загрузки
            document.head.appendChild(script);
        });
    }

    // ============================================================
    // РАЗДЕЛ 4: ФУНКЦИЯ loadStyle(css)
    // НАЗНАЧЕНИЕ: Добавлять CSS стили в <head>
    // ============================================================

    function loadStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // РАЗДЕЛ 5: ФУНКЦИЯ initFirebase()
    // НАЗНАЧЕНИЕ: Инициализировать Firebase для работы с БД
    // ============================================================

    async function initFirebase() {
        console.log('📦 Загружаем Firebase скрипты...');
        
        // Загружаем Firebase библиотеки
        await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

        // Конфиг Firebase проекта aimina-d3597
        const firebaseConfig = {
            apiKey: "AIzaSyBgXvb4GLdtaZlw5dgnYKGddOIpFYIXXAU",
            databaseURL: "https://aimina-d3597-default-rtdb.firebaseio.com",
            projectId: "aimina-d3597",
            appId: "1:590164687607:web:c9f97739c0358dfd2571f2"
        };

        // Проверяем что Firebase загружен
        if (!window.firebase) {
            console.error('❌ Firebase не загружен');
            return null;
        }

        // Инициализируем Firebase (если ещё не инициализирован)
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        console.log('✅ Firebase загружен и инициализирован');
        
        // Возвращаем ссылку на Firebase Database
        return firebase.database();
    }

    // ============================================================
    // РАЗДЕЛ 6: ФУНКЦИЯ loadConfigs()
    // НАЗНАЧЕНИЕ: Загружать конфиги клиента с сервера
    // Конфиги берутся из Google Sheet через API
    // ============================================================

    async function loadConfigs() {
        try {
            // Загружаем widget_config - настройки кнопки (цвета, аватар, текст)
            console.log('⚙️ Загружаем widget_config (кнопка)...');
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            const config = await response.json();
            // config содержит: botName, avatarUrl, colorStart, colorEnd, text1, text2, bgColor, textColor
            
            // Загружаем chat_config - настройки чата (приветствие, футер)
            console.log('⚙️ Загружаем chat_config (панель чата)...');
            const chatResponse = await fetch(`${backendUrl}/api/chat_config?clientId=${clientId}`);
            const chatConfig = chatResponse.ok ? await chatResponse.json() : {};
            // chatConfig содержит: welcomeMsg, footerText, footerUrl, footerColor, placeholder
            
            return { config, chatConfig };
        } catch (e) {
            console.error('❌ Ошибка загрузки конфига:', e.message);
            return { config: {}, chatConfig: {} };
        }
    }

    // ============================================================
    // РАЗДЕЛ 7: CSS СТИЛИ - ОБЩИЕ ДЛЯ ВСЕХ
    // Анимации, основные стили элементов
    // ============================================================

    const baseStyles = `
        /* ========== АНИМАЦИИ ========== */
        
        /* Пульс вокруг кнопки */
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); }
            70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
            100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
        
        /* Панель появляется справа */
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        /* Панель исчезает вправо при закрытии */
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
        
        /* Три точки печатают сообщение */
        @keyframes typingDot {
            0%, 60%, 100% { opacity: 0.3; }
            30% { opacity: 1; }
        }
        
        /* ========== ОСНОВНЫЕ ЭЛЕМЕНТЫ ========== */
        
        /* Контейнер виджета - содержит кнопку и облочку */
        .amina-widget { 
            position: fixed; 
            z-index: 9999; 
            display: flex; 
            align-items: center; 
            gap: 10px; 
        }
        
        /* Круглая кнопка с аватаром */
        .amina-btn { 
            border-radius: 50%;         /* круглая */
            border: none; 
            cursor: pointer; 
            padding: 0; 
            animation: pulse 2s infinite;  /* пульс */
            display: flex; 
            align-items: center; 
            justify-content: center; 
            transition: transform 0.2s;    /* плавная масштабировка при hover */
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
            position: relative;            /* для красного значка */
            flex-shrink: 0;                /* не сжимается */
        }
        
        /* При наведении кнопка становится больше */
        .amina-btn:hover { transform: scale(1.05); }
        
        /* Аватар внутри кнопки */
        .amina-btn img { 
            border-radius: 50%; 
            object-fit: cover; 
        }
        
        /* Красный значок непрочитанных сообщений */
        .amina-badge { 
            position: absolute; 
            top: 0; 
            right: 0; 
            background: red; 
            color: white; 
            border-radius: 50%; 
            font-size: 12px; 
            font-weight: bold; 
            align-items: center; 
            justify-content: center; 
            display: none;  /* скрыт по умолчанию */
        }
        
        /* При новых сообщениях кнопка пульсирует красным */
        .amina-btn.has-message { 
            animation: notifyPulse 1s infinite !important; 
        }
        
        /* ========== ОБЛОЧКА (LABEL) ========== */
        
        /* Облочка с текстом рядом с кнопкой */
        .amina-label { 
            padding: 12px 16px;         /* внутренние отступы */
            border-radius: 8px;         /* закругления углов */
            box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
            font-size: 13px; 
            font-weight: bold; 
            max-width: 200px;           /* максимальная ширина */
            opacity: 0;                 /* скрыта */
            transition: all 0.5s;       /* плавное появление */
            cursor: pointer; 
        }
        
        /* Облочка видна */
        .amina-label.visible { opacity: 1; }
        
        /* Название бота в облочке */
        .amina-name { 
            font-size: 12px; 
            margin-top: 6px; 
        }
        
        /* ========== ПАНЕЛЬ ЧАТА ========== */
        
        /* Основной контейнер панели чата */
        .amina-panel { 
            position: fixed; 
            background: white; 
            box-shadow: 0 -4px 30px rgba(0,0,0,0.15); 
            z-index: 99999;             /* выше всего */
            display: flex; 
            flex-direction: column;     /* элементы вертикально */
            overflow: hidden;           /* обрезаем содержимое */
            animation: slideIn 0.3s ease;  /* появляется */
            font-family: 'Segoe UI', Roboto, Arial, sans-serif; 
        }
        
        /* При закрытии панель исчезает */
        .amina-panel.closing { animation: slideOut 0.3s ease forwards; }
        
        /* Шапка панели - где имя и кнопка закрытия */
        .amina-panel-header { 
            padding: 14px 16px;         /* внутренние отступы */
            color: white; 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            flex-shrink: 0;             /* не сжимается */
        }
        
        /* Аватар в шапке панели */
        .amina-panel-header img { 
            border-radius: 50%; 
            border: 2px solid rgba(255,255,255,0.4); 
            object-fit: cover; 
            flex-shrink: 0; 
        }
        
        /* Имя бота в шапке */
        .amina-panel-header-name { 
            font-weight: bold; 
            flex: 1;                    /* занимает оставшееся место */
        }
        
        /* Кнопка X закрытия панели */
        .amina-panel-close { 
            background: none; 
            border: none; 
            color: white; 
            cursor: pointer; 
            padding: 0; 
            opacity: 0.8; 
            transition: opacity 0.2s;   /* плавный эффект */
            font-size: 22px; 
        }
        
        .amina-panel-close:hover { opacity: 1; }
        
        /* ========== СООБЩЕНИЯ ========== */
        
        /* Контейнер со всеми сообщениями */
        .amina-messages { 
            flex: 1;                    /* занимает максимум места */
            overflow-y: auto;           /* скроллит вертикально */
            padding: 15px; 
            display: flex; 
            flex-direction: column;     /* сообщения вертикально */
            gap: 10px;                  /* расстояние между сообщениями */
            background: #f0f2f5;        /* серый фон */
        }
        
        /* Одно сообщение */
        .amina-msg { 
            padding: 10px 14px;         /* внутренние отступы */
            border-radius: 18px;        /* закругленный "пузырь" */
            max-width: 80%;             /* максимальная ширина */
            font-size: 14px; 
            line-height: 1.4;           /* высота строки */
            word-wrap: break-word;      /* переносит длинные слова */
            animation: fadeInMsg 0.3s ease;  /* появляется */
        }
        
        /* Сообщение БОТА - слева, белое */
        .amina-msg.bot { 
            align-self: flex-start;     /* выравнивается влево */
            background: white; 
            color: #333; 
            border-bottom-left-radius: 4px;  /* острый угол слева */
            box-shadow: 0 1px 2px rgba(0,0,0,0.1); 
        }
        
        /* Сообщение ЮЗЕРА - справа, цветное */
        .amina-msg.user { 
            align-self: flex-end;       /* выравнивается вправо */
            color: white; 
            border-bottom-right-radius: 4px;  /* острый угол справа */
        }
        
        /* Сообщение МЕНЕДЖЕРА - слева, синее */
        .amina-msg.manager { 
            align-self: flex-start; 
            background: #e3f2fd;        /* светлый синий */
            color: #333; 
            border-bottom-left-radius: 4px; 
            box-shadow: 0 1px 2px rgba(0,0,0,0.1); 
            border-left: 3px solid #2196F3;  /* синяя полоса слева */
        }
        
        /* ========== АНИМАЦИЯ ПЕЧАТИ ========== */
        
        /* Три точки "бот печатает" */
        .amina-typing { 
            display: flex; 
            gap: 4px;                   /* расстояние между точками */
            align-self: flex-start; 
            padding: 12px 16px; 
            background: white; 
            border-radius: 18px; 
            border-bottom-left-radius: 4px; 
        }
        
        /* Одна точка */
        .amina-typing span { 
            width: 7px; 
            height: 7px; 
            background: #999; 
            border-radius: 50%; 
            animation: typingDot 1.4s infinite;  /* прыгает */
        }
        
        /* Вторая точка прыгает позже */
        .amina-typing span:nth-child(2) { animation-delay: 0.2s; }
        
        /* Третья точка прыгает ещё позже */
        .amina-typing span:nth-child(3) { animation-delay: 0.4s; }
        
        /* ========== ПОЛЕ ВВОДА ========== */
        
        /* Контейнер с input и кнопкой отправки */
        .amina-input-area { 
            padding: 12px; 
            background: white; 
            display: flex;               /* input и кнопка в ряд */
            gap: 8px;                    /* расстояние между ними */
            border-top: 1px solid #eee; 
            flex-shrink: 0;              /* не сжимается */
        }
        
        /* Текстовое поле */
        .amina-input { 
            flex: 1;                     /* занимает максимум места */
            padding: 10px 14px; 
            border: 1px solid #ddd; 
            border-radius: 22px; 
            outline: none;               /* без синей обводки */
            font-size: 14px; 
            font-family: inherit; 
            transition: border-color 0.2s; 
        }
        
        /* При фокусе на input - меняется цвет */
        .amina-input:focus { border-color: #007bff; }
        
        /* Кнопка отправки - стрелка → */
        .amina-send { 
            border: none; 
            color: white; 
            border-radius: 50%;         /* круглая */
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 16px; 
            flex-shrink: 0;             /* не сжимается */
            transition: opacity 0.2s; 
            width: 38px;                /* размер */
            height: 38px;               /* размер */
        }
        
        .amina-send:hover { opacity: 0.9; }
        .amina-send:disabled { opacity: 0.5; cursor: not-allowed; }
        
        /* ========== ФУТЕР ========== */
        
        /* Ссылка внизу панели */
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

    // ============================================================
    // РАЗДЕЛ 8: CSS СТИЛИ - DESKTOP (Десктопная версия)
    // ============================================================

    const desktopStyles = `
        /* Позиция виджета на десктопе - правый нижний угол */
        .amina-widget { 
            bottom: 20px;              /* 20px снизу */
            right: 20px;               /* 20px справа */
        }
        
        /* Кнопка на десктопе - 70x70 (×2 от мобилки) */
        .amina-btn { 
            width: 140px;              /* ×2 = 70×2 */
            height: 140px;             /* ×2 = 70×2 */
        }
        
        /* Аватар внутри кнопки - 58x58 (×2) */
        .amina-btn img { 
            width: 116px;              /* ×2 = 58×2 */
            height: 116px;             /* ×2 = 58×2 */
        }
        
        /* Красный значок (×2) */
        .amina-badge { 
            width: 40px;               /* ×2 = 20×2 */
            height: 40px;              /* ×2 = 20×2 */
        }
        
        /* Панель чата на десктопе - справа снизу */
        .amina-panel { 
            bottom: 100px;             /* выше кнопки */
            right: 20px;               /* выравнен с кнопкой */
            width: 760px;              /* ×2 = 380×2 */
            height: 1160px;            /* ×2 = 580×2 */
            border-radius: 16px;       /* скругления углов */
        }
        
        /* Имя бота в шапке - большше */
        .amina-panel-header-name { 
            font-size: 20px;           /* ×2 = 15×2 (больше) */
        }
        
        /* Аватар в шапке - больше */
        .amina-panel-header img { 
            width: 72px;               /* ×2 = 36×2 */
            height: 72px;              /* ×2 = 36×2 */
        }
    `;

    // ============================================================
    // РАЗДЕЛ 9: CSS СТИЛИ - MOBILE (Мобильная версия)
    // ============================================================

    const mobileStyles = `
        /* Позиция виджета на мобилке - правый нижний угол, ближе */
        .amina-widget { 
            bottom: 10px;              /* ближе к краю */
            right: 10px;               /* ближе к краю */
        }
        
        /* Кнопка на мобилке - 100x100 (×2 от оригинала мобилки) */
        .amina-btn { 
            width: 100px;              /* ×2 = 50×2 */
            height: 100px;             /* ×2 = 50×2 */
        }
        
        /* Аватар внутри кнопки - 84x84 (×2) */
        .amina-btn img { 
            width: 84px;               /* ×2 = 42×2 */
            height: 84px;              /* ×2 = 42×2 */
        }
        
        /* Красный значок (×2) */
        .amina-badge { 
            width: 32px;               /* ×2 = 16×2 */
            height: 32px;              /* ×2 = 16×2 */
            font-size: 14px;           /* ×2 = 10×2 */
        }
        
        /* Облочка на мобилке - больше */
        .amina-label { 
            max-width: 220px;          /* ×2 = 110×2 */
            font-size: 16px;           /* ×2 = 11×2 (видимее) */
            padding: 12px 16px;        /* увеличены отступы */
        }
        
        /* Имя в облочке - тоже больше */
        .amina-label .amina-name { 
            font-size: 14px;           /* ×2 = 10×2 */
        }
        
        /* Панель чата на мобилке - во всё окно, от низу */
        .amina-panel { 
            bottom: 0;                 /* прямо от дна */
            right: 0; 
            left: 0; 
            top: auto; 
            width: 100%;               /* на всю ширину */
            height: 100%;              /* на всю высоту */
            max-height: 90vh;          /* не выше 90% окна */
            border-radius: 16px 16px 0 0;  /* скругления только сверху */
        }
        
        /* Имя бота в шапке */
        .amina-panel-header-name { 
            font-size: 18px;           /* ×2 = 14×2 */
        }
        
        /* Аватар в шапке */
        .amina-panel-header img { 
            width: 64px;               /* ×2 = 32×2 */
            height: 64px;              /* ×2 = 32×2 */
        }
        
        /* Input немного больше для удобства */
        .amina-input { 
            font-size: 18px;           /* ×2 = 16×2 (легче печатать) */
        }
    `;

    // ============================================================
    // РАЗДЕЛ 10: ГЛАВНАЯ ФУНКЦИЯ initMina()
    // НАЗНАЧЕНИЕ: Инициализировать весь виджет
    // ============================================================

    async function initMina() {
        try {
            // Шаг 1: Инициализируем Firebase для сохранения истории
            const db = await initFirebase();
            if (!db) throw new Error('Firebase инициализация не удалась');

            // Шаг 2: Загружаем конфиги клиента из Google Sheet
            const { config, chatConfig } = await loadConfigs();
            
            // Шаг 3: Получаем или создаём sessionId (уникальный ID браузера)
            const sessionId = getSessionId();
            
            // Шаг 4: Создаём ссылку на историю в Firebase
            // Путь: chats/{clientId}/{sessionId}
            const historyRef = db.ref(`chats/${clientId}/${sessionId}`);

            // Шаг 5: Загружаем существующую историю сообщений
            console.log('📚 Загружаем историю сообщений...');
            let chatHistory = [];  // массив сообщений
            const snapshot = await historyRef.once('value');
            if (snapshot.exists()) {
                const val = snapshot.val();
                chatHistory = Array.isArray(val) ? val : [];
                console.log(`✅ История загружена (${chatHistory.length} сообщений)`);
            } else {
                console.log('📭 История пустая');
            }

            // Шаг 6: Применяем CSS стили
            // Объединяем базовые стили + версию (Desktop или Mobile)
            const allStyles = baseStyles + (isMobile ? mobileStyles : desktopStyles);
            
            // Подставляем цвета из конфига вместо плейсхолдеров
            const coloredStyles = allStyles
                .replace(/linear-gradient\(135deg, [^)]+\)/g, 
                    `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`)
                .replace(/#007bff/g, config.colorStart || '#007bff');
            
            loadStyle(coloredStyles);
            console.log('✅ CSS стили применены');

            // Шаг 7: Создаём HTML элементы виджета
            
            // Контейнер виджета (содержит кнопку и облочку)
            const widget = document.createElement('div');
            widget.className = 'amina-widget';

            // Облочка (label) - текст рядом с кнопкой
            const label = document.createElement('div');
            label.className = 'amina-label';
            label.style.background = config.bgColor || '#ffffff';
            label.style.color = config.textColor || '#333333';

            // Текст в облочке (будет печататься)
            const textSpan = document.createElement('span');
            
            // Имя бота в облочке (появится после печати текста)
            const nameDiv = document.createElement('div');
            nameDiv.className = 'amina-name';
            nameDiv.style.color = config.textColor || '#666666';

            // Добавляем элементы в облочку
            label.appendChild(textSpan);
            label.appendChild(nameDiv);

            // Круглая кнопка с аватаром
            const btn = document.createElement('button');
            btn.className = 'amina-btn';
            btn.style.background = `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`;
            btn.innerHTML = `
                <img src="${config.avatarUrl || ''}" alt="${config.botName || 'Bot'}" onerror="this.src='https://via.placeholder.com/60'">
                <span class="amina-badge" id="amina-badge">!</span>
            `;

            // Добавляем облочку и кнопку в виджет
            widget.appendChild(label);
            widget.appendChild(btn);
            
            // Добавляем весь виджет в <body>
            document.body.appendChild(widget);
            console.log('✅ Виджет добавлен в страницу');

            // Шаг 8: Переменные состояния (отслеживают состояние виджета)
            let panel = null;                    // текущая открытая панель (null = закрыта)
            let isOpen = false;                  // открыта ли панель?
            let isLoading = false;               // отправляется ли сообщение?
            let historyUnsubscribe = null;       // функция отписки от Firebase слушателя

            // ============================================================
            // РАЗДЕЛ 11: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
            // ============================================================

            // Сохранить историю в Firebase
            function saveHistory() {
                historyRef.set(chatHistory).catch(e => console.error('❌ Ошибка сохранения:', e));
            }

            // Добавить сообщение в чат (нарисовать пузырь с текстом)
            function addMsg(text, type) {
                const msgs = document.getElementById('amina-messages');
                if (!msgs) return;
                
                const div = document.createElement('div');
                div.className = `amina-msg ${type}`;  // bot, user или manager
                div.innerText = text;
                
                // Если это сообщение юзера - раскрасить в цвет кнопки
                if (type === 'user') {
                    div.style.background = `linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})`;
                }
                
                msgs.appendChild(div);
                scrollDown();  // прокрутить вниз
            }

            // Прокрутить список сообщений вниз (к последнему сообщению)
            function scrollDown() {
                const msgs = document.getElementById('amina-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            // ============================================================
            // РАЗДЕЛ 12: ФУНКЦИЯ openPanel()
            // НАЗНАЧЕНИЕ: Открыть панель чата
            // ============================================================

            function openPanel() {
                if (isOpen) return;  // если уже открыта - не открываем ещё раз
                isOpen = true;

                // Скрываем красный значок непрочитанных
                const badge = document.getElementById('amina-badge');
                if (badge) badge.style.display = 'none';
                btn.classList.remove('has-message');

                // HTML футера (если есть текст в chatConfig)
                const footerHtml = chatConfig.footerText ? `
                    <div class="amina-footer">
                        <a href="${chatConfig.footerUrl || '#'}" 
                           target="_blank" 
                           style="color: ${chatConfig.footerColor || '#999999'}">
                            ${chatConfig.footerText}
                        </a>
                    </div>` : '';

                // Создаём HTML панели чата
                panel = document.createElement('div');
                panel.className = 'amina-panel';
                panel.style.borderRadius = isMobile ? '16px 16px 0 0' : '16px';
                panel.innerHTML = `
                    <!-- ШАПКА панели -->
                    <div class="amina-panel-header" style="background: linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})">
                        <img src="${chatConfig.avatarUrl || config.avatarUrl || ''}" onerror="this.style.display='none'">
                        <span class="amina-panel-header-name">${chatConfig.botName || config.botName || 'AI Chat'}</span>
                        <button class="amina-panel-close" id="amina-close">✕</button>
                    </div>
                    
                    <!-- СПИСОК СООБЩЕНИЙ -->
                    <div class="amina-messages" id="amina-messages"></div>
                    
                    <!-- ПОЛЕ ВВОДА И КНОПКА ОТПРАВКИ -->
                    <div class="amina-input-area">
                        <input class="amina-input" id="amina-input" placeholder="${chatConfig.placeholder || config.text2 || 'Введите сообщение...'}">
                        <button class="amina-send" id="amina-send" style="background: linear-gradient(135deg, ${config.colorStart || '#007bff'}, ${config.colorEnd || '#0056b3'})">→</button>
                    </div>
                    
                    <!-- ФУТЕР -->
                    ${footerHtml}
                `;
                document.body.appendChild(panel);

                // Показываем историю сообщений или приветствие
                const messagesDiv = document.getElementById('amina-messages');
                if (chatHistory.length > 0) {
                    // Есть история - показываем все сообщения
                    chatHistory.forEach(msg => {
                        if (!msg || msg.role === 'system') return;  // пропускаем системные
                        
                        // Определяем тип сообщения
                        const type = msg.fromManager ? 'manager' : (msg.role === 'assistant' ? 'bot' : 'user');
                        addMsg(msg.content, type);
                    });
                } else if (chatConfig.welcomeMsg) {
                    // История пустая - показываем приветствие
                    addMsg(chatConfig.welcomeMsg, 'bot');
                    chatHistory.push({ role: 'assistant', content: chatConfig.welcomeMsg });
                    saveHistory();
                }

                // Подключаем обработчики событий
                document.getElementById('amina-close').onclick = closePanel;  // кнопка X
                document.getElementById('amina-send').onclick = sendMsg;      // кнопка отправки
                document.getElementById('amina-input').addEventListener('keypress', e => {
                    if (e.key === 'Enter') sendMsg();  // отправить на Enter
                });

                // Firebase слушатель - получаем новые сообщения от менеджера в реальном времени
                historyUnsubscribe = historyRef.on('value', snap => {
                    if (!snap.exists()) return;
                    const val = snap.val();
                    const newHistory = Array.isArray(val) ? val : [];
                    
                    // Если появились новые сообщения
                    if (newHistory.length > chatHistory.length) {
                        const newMessages = newHistory.slice(chatHistory.length);
                        chatHistory = newHistory;
                        
                        // Показываем новые сообщения (обычно от менеджера)
                        newMessages.forEach(msg => {
                            if (msg && msg.fromManager) {
                                addMsg(msg.content, 'manager');
                            }
                        });
                    }
                });
            }

            // ============================================================
            // РАЗДЕЛ 13: ФУНКЦИЯ closePanel()
            // НАЗНАЧЕНИЕ: Закрыть панель чата
            // ============================================================

            function closePanel() {
                if (!panel) return;
                isOpen = false;
                
                // Запускаем анимацию закрытия (slideOut)
                panel.classList.add('closing');
                
                // Отписываемся от Firebase слушателя (останавливаем получение сообщений)
                if (historyUnsubscribe) {
                    historyUnsubscribe();
                    historyUnsubscribe = null;
                }
                
                // Ждём пока закончится анимация (300ms) и удаляем элемент
                setTimeout(() => {
                    if (panel) panel.remove();
                    panel = null;
                }, 300);
            }

            // ============================================================
            // РАЗДЕЛ 14: ФУНКЦИЯ sendMsg()
            // НАЗНАЧЕНИЕ: Отправить сообщение юзера в Claude AI
            // ============================================================

            async function sendMsg() {
                if (isLoading) return;  // если уже отправляется - не отправляем ещё раз
                
                const input = document.getElementById('amina-input');
                const sendBtn = document.getElementById('amina-send');
                const text = input.value.trim();
                
                if (!text) return;  // если текст пуст - не отправляем

                // Шаг 1: Показываем сообщение юзера в чате
                addMsg(text, 'user');
                input.value = '';  // очищаем поле ввода

                // Шаг 2: Сохраняем в историю и Firebase
                chatHistory.push({ role: 'user', content: text });
                saveHistory();

                // Шаг 3: Показываем анимацию печати (три точки)
                const typingDiv = document.createElement('div');
                typingDiv.className = 'amina-typing';
                typingDiv.innerHTML = '<span></span><span></span><span></span>';
                document.getElementById('amina-messages').appendChild(typingDiv);
                scrollDown();

                // Шаг 4: Блокируем кнопку и input пока отправляется
                isLoading = true;
                sendBtn.disabled = true;
                input.disabled = true;

                try {
                    // Отправляем сообщения в Claude AI через наш API
                    const res = await fetch(`${backendUrl}/api/authentication`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            clientId, 
                            sessionId, 
                            messages: chatHistory  // вся история для контекста
                        })
                    });

                    // Убираем анимацию печати
                    if (typingDiv) typingDiv.remove();
                    
                    const result = await res.json();

                    // Если ИИ выключен - показываем сообщение юзеру
                    if (result.aiDisabled) {
                        addMsg('Менеджер ответит вам в ближайшее время...', 'bot');
                        return;
                    }

                    // Проверяем что ответ успешен
                    if (!res.ok || !result.text) throw new Error(result.error || 'API error');

                    // Показываем ответ Claude в чате
                    addMsg(result.text, 'bot');
                    chatHistory.push({ role: 'assistant', content: result.text });
                    saveHistory();

                } catch (e) {
                    // Если ошибка - убираем анимацию печати и логируем ошибку
                    if (typingDiv && typingDiv.parentNode) typingDiv.remove();
                    console.error('❌ Ошибка:', e.message);
                    chatHistory.pop();  // удаляем неотправленное сообщение
                    
                } finally {
                    // Разблокируем кнопку и input в любом случае
                    isLoading = false;
                    if (sendBtn) sendBtn.disabled = false;
                    if (input) {
                        input.disabled = false;
                        input.focus();  // фокусируемся на input
                    }
                }
            }

            // ============================================================
            // РАЗДЕЛ 15: ФУНКЦИЯ typeText()
            // НАЗНАЧЕНИЕ: Анимация печати текста в облочке
            // ============================================================

            async function typeText() {
                label.classList.add('visible');  // показываем облочку
                
                // Печатаем первый текст (text1)
                if (config.text1) {
                    for (let char of config.text1) {
                        textSpan.textContent += char;
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 50));  // случайная задержка
                    }
                    await new Promise(r => setTimeout(r, 2000));  // ждём 2 секунды
                }
                
                // Очищаем и печатаем второй текст (text2)
                textSpan.textContent = '';
                if (config.text2) {
                    for (let char of config.text2) {
                        textSpan.textContent += char;
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
                    }
                }
                
                // Показываем имя бота в облочке
                nameDiv.textContent = config.botName || 'Bot';
            }

            // ============================================================
            // РАЗДЕЛ 16: ОБРАБОТЧИКИ СОБЫТИЙ
            // НАЗНАЧЕНИЕ: Подключить клики к функциям
            // ============================================================

            // При клике на кнопку - открыть/закрыть панель
            btn.onclick = () => isOpen ? closePanel() : openPanel();
            
            // При клике на облочку - открыть/закрыть панель
            label.onclick = () => isOpen ? closePanel() : openPanel();

            // ============================================================
            // РАЗДЕЛ 17: ЗАПУСК ВИДЖЕТА
            // ============================================================

            typeText();  // запускаем анимацию печати текста в облочке
            console.log('✅ Виджет инициализирован и готов к использованию');

        } catch (e) {
            console.error('❌ Widget Error:', e.message);
        }
    }

    // ============================================================
    // РАЗДЕЛ 18: АВТОЗАПУСК
    // НАЗНАЧЕНИЕ: Запустить initMina() когда страница загружена
    // ============================================================

    if (document.readyState === 'loading') {
        // Страница ещё загружается - ждём события DOMContentLoaded
        document.addEventListener('DOMContentLoaded', initMina);
    } else {
        // Страница уже загружена - запускаем сразу
        initMina();
    }

})();
