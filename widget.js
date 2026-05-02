// ============================================================
// ФАЙЛ: widget.js (СУПЕР ПОДРОБНЫЙ)
// ============================================================
// НАЗНАЧЕНИЕ:
//   Виджет чата который вставляется на сайт клиента
//   Показывает круглую кнопку в правом нижнем углу
//   При клике открывается панель чата
//
// КАК ПОДКЛЮЧИТЬ:
//   <script src="https://ai--mina.vercel.app/widget.js" 
//           data-client-id="mina_001"></script>
//
// ЧТО ПРОИСХОДИТ:
//   1. Загружается Firebase для синхронизации
//   2. Скачивается конфиг из Google Sheets
//   3. Создаётся красивая круглая кнопка
//   4. При клике открывается окно чата
//   5. Юзер пишет сообщение
//   6. Сообщение отправляется в Claude AI
//   7. Ответ показывается в чате
//
// ============================================================

// IIFE - Immediately Invoked Function Expression
// Это самовызывающаяся функция, чтобы не загрязнять глобальное пространство
(function() {

    // ============================================================
    // РАЗДЕЛ 1: ПЕРЕМЕННЫЕ И КОНФИГ
    // ============================================================
    // Эти переменные хранят важные данные о подключении и конфигурации

    // scriptTag = <script> элемент который загрузил этот код
    const scriptTag = document.currentScript;
    
    // clientId = строка которая определяет какому клиенту принадлежит виджет
    // Например: "mina_001" или "john_business"
    // Берётся из атрибута data-client-id, по умолчанию "mina_001"
    const clientId = scriptTag.getAttribute('data-client-id') || 'mina_001';
    
    // backendUrl = адрес сервера где живут API функции
    // Все запросы к API идут сюда: /api/widget_config, /api/authentication и т.д.
    const backendUrl = 'https://ai--mina.vercel.app';

    // firebaseConfig = данные для подключения к Firebase базе данных
    // Firebase - это база данных от Google где мы храним историю чатов
    // apiKey = публичный ключ для доступа к Firebase
    // databaseURL = адрес реалтайм базы данных
    // projectId = ID проекта Firebase
    // appId = ID приложения Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyBgXvb4GLdtaZlw5dgnYKGddOIpFYIXXAU",
        databaseURL: "https://aimina-d3597-default-rtdb.firebaseio.com",
        projectId: "aimina-d3597",
        appId: "1:590164687607:web:c9f97739c0358dfd2571f2"
    };

    // ============================================================
    // РАЗДЕЛ 2: ФУНКЦИЯ getSessionId()
    // ============================================================
    // НАЗНАЧЕНИЕ:
    //   Получить или создать уникальный ID текущего браузера/окна
    //   Это нужно чтобы разные браузеры имели разные истории чата
    //
    // ПРИМЕР ID:
    //   "user_a7b3c2d_1609459200000"
    //   где a7b3c2d - случайные символы
    //   где 1609459200000 - текущее время в миллисекундах
    //
    // ВЫ ВЫЗЫВАЕМСЯ:
    //   const sessionId = getSessionId();
    // ============================================================
    
    function getSessionId() {
        // Пытаемся получить сохранённый sessionId из localStorage
        // localStorage = внутренняя память браузера которая сохраняется после перезагрузки
        // aimina_session_mina_001 = ключ под которым сохраняется ID
        let sessionId = localStorage.getItem(`aimina_session_${clientId}`);
        
        // Если sessionId ещё не был создан (первый раз на этом браузере)
        if (!sessionId) {
            // Создаём новый уникальный ID для этого браузера
            // 'user_' + случайное число + текущее время
            // Пример: "user_xyz789_1609459200000"
            sessionId = 'user_' + 
                       Math.random().toString(36).substr(2, 9) +  // Случайные символы
                       '_' + 
                       Date.now();  // Время в миллисекундах
            
            // Сохраняем этот ID в localStorage чтобы использовать при следующих визитах
            localStorage.setItem(`aimina_session_${clientId}`, sessionId);
        }
        
        // Возвращаем sessionId (новый или сохранённый)
        return sessionId;
    }

    // ============================================================
    // РАЗДЕЛ 3: ФУНКЦИЯ loadScript(src)
    // ============================================================
    // НАЗНАЧЕНИЕ:
    //   Загрузить JavaScript файл динамически (когда страница уже загрузилась)
    //   Нужна для загрузки Firebase скриптов
    //
    // ПАРАМЕТР:
    //   src = ссылка на скрипт
    //   Пример: "https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"
    //
    // ВОЗВРАЩАЕТ:
    //   Promise (обещание что скрипт загрузится)
    //   Это позволяет использовать await для ждания загрузки
    //
    // ПРИМЕР ИСПОЛЬЗОВАНИЯ:
    //   await loadScript('https://...');  // Ждёт загрузки скрипта
    //   console.log('Скрипт загружен!');
    // ============================================================
    
    function loadScript(src) {
        // Возвращаем новый Promise (обещание)
        return new Promise((resolve, reject) => {
            // Создаём новый <script> элемент
            const script = document.createElement('script');
            
            // Устанавливаем атрибут src (ссылка на скрипт)
            script.src = src;
            
            // Функция которая вызывается когда скрипт успешно загрузился
            script.onload = resolve;  // resolve = успех, скрипт готов
            
            // Функция которая вызывается если произошла ошибка при загрузке
            script.onerror = reject;  // reject = ошибка, скрипт не загрузился
            
            // Добавляем <script> элемент в <head> страницы
            // Браузер начнёт загружать скрипт из атрибута src
            document.head.appendChild(script);
        });
    }

    // ============================================================
    // РАЗДЕЛ 4: ГЛАВНАЯ ФУНКЦИЯ initMina()
    // ============================================================
    // НАЗНАЧЕНИЕ:
    //   Инициализировать весь виджет - основная функция
    //   Это сложная функция с несколькими этапами
    //
    // ЭТАПЫ:
    //   1. Загрузить Firebase
    //   2. Загрузить конфиг из Google Sheets
    //   3. Загрузить историю сообщений из Firebase
    //   4. Создать CSS стили
    //   5. Создать HTML элементы (кнопка, панель)
    //   6. Установить обработчики событий (click, keypress)
    //   7. Запустить анимацию печати текста
    //
    // ASYNC ФУНКЦИЯ:
    //   async = может использовать await для ждания асинхронных операций
    //   Например: await fetch(...) будет ждать ответа от сервера
    // ============================================================
    
    async function initMina() {
        try {  // try = пытаемся выполнить код
               // catch = если произойдёт ошибка - обработаем её

            // ========== ЭТАП 1: Загружаем Firebase ==========
            console.log('📦 Загружаем Firebase...');
            
            // Загружаем первый Firebase скрипт (основной)
            await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
            
            // Загружаем второй Firebase скрипт (для работы с базой данных)
            await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js');

            // Инициализируем Firebase (если не инициализирован)
            // firebase.apps.length = количество инициализированных приложений
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);  // Подключаемся с конфигом выше
            }
            console.log('✅ Firebase загружен');

            // ========== ЭТАП 2: Получаем sessionId и ссылку на базу ==========
            
            // db = объект для работы с Firebase базой
            const db = firebase.database();
            
            // sessionId = уникальный ID этого браузера
            const sessionId = getSessionId();
            
            // historyRef = ссылка на место в Firebase где хранится история этого юзера
            // Путь: chats/mina_001/user_abc123_123456
            const historyRef = db.ref(`chats/${clientId}/${sessionId}`);
            console.log('📝 Session ID:', sessionId);

            // ========== ЭТАП 3: Загружаем конфиг кнопки из API ==========
            console.log('⚙️ Загружаем конфиг...');
            
            // fetch = делаем HTTP запрос к серверу
            // GET запрос по умолчанию (не нужно указывать method)
            const response = await fetch(`${backendUrl}/api/widget_config?clientId=${clientId}`);
            
            // Проверяем успешность запроса
            if (!response.ok) throw new Error(`API ошибка: ${response.status}`);
            
            // Переводим ответ в JSON (из текста в объект)
            const config = await response.json();
            console.log('✅ Конфиг загружен:', config);

            // ========== ЭТАП 4: Загружаем историю сообщений ==========
            console.log('📚 Загружаем историю...');
            
            // chatHistory = массив всех сообщений в этом чате
            // Пример:
            // [
            //   { role: 'user', content: 'Привет!' },
            //   { role: 'assistant', content: 'Привет, как дела?' }
            // ]
            let chatHistory = [];
            
            // Получаем сохранённую историю из Firebase
            const snapshot = await historyRef.once('value');
            
            // Если история существует в Firebase
            if (snapshot.exists()) {
                const val = snapshot.val();
                // Проверяем что это массив (в Firebase может быть объект вместо массива)
                chatHistory = Array.isArray(val) ? val : [];
                console.log(`✅ История загружена (${chatHistory.length} сообщений)`);
            } else {
                // История пустая - это первый раз на этом браузере
                console.log('📭 История пустая');
            }

            // ========== ЭТАП 5: Создаём CSS стили ==========
            const style = document.createElement('style');
            
            // Все стили в одной строке (потом вставим в <head>)
            style.textContent = `
                /* Анимация пульса для кнопки (волна) */
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 ${config.colorStart}B3; }
                    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
                }

                /* Кнопка входит слева направо */
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                /* Кнопка выходит справа налево */
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }

                /* Сообщение появляется снизу вверх */
                @keyframes fadeInMsg {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Пульс красного уведомления */
                @keyframes notifyPulse {
                    0% { box-shadow: 0 0 0 0 rgba(255,0,0,0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(255,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(255,0,0,0); }
                }

                /* Контейнер виджета (кнопка + лейбл рядом) */
                .amina-widget {
                    position: fixed;      /*固定位置在экране */
                    bottom: 20px;         /* 20 пикселей от низа */
                    right: 20px;          /* 20 пикселей от правого края */
                    z-index: 9999;        /* Выше всех других элементов */
                    display: flex;        /* Гибкая раскладка */
                    align-items: center;  /* Выравнивание по центру */
                    gap: 10px;            /* 10 пиксилей между кнопкой и лейблом */
                }

                /* Сама круглая кнопка */
                .amina-btn {
                    width: 70px;
                    height: 70px;
                    border-radius: 50%;              /* Делает квадрат круглым */
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    border: none;
                    cursor: pointer;                 /* Указатель мыши меняется на руку */
                    padding: 0;
                    animation: pulse 2s infinite;    /* Волнующийся пульс */
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s;      /* Гладкое увеличение при наведении */
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    position: relative;              /* Нужна для абсолютного позиционирования значка */
                }

                .amina-btn:hover { 
                    transform: scale(1.05);          /* Увеличиваем на 5% при наведении */
                }

                .amina-btn img { 
                    width: 58px; 
                    height: 58px; 
                    border-radius: 50%;              /* Аватара круглая */
                    object-fit: cover;               /* Обрезаем края если нужно */
                }

                /* Красный значок с количеством непрочитанных */
                .amina-badge {
                    position: absolute;              /* Позиция относительно кнопки */
                    top: 0; 
                    right: 0;
                    background: red;
                    color: white;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;              /* Красный круг */
                    font-size: 12px;
                    font-weight: bold;
                    align-items: center;
                    justify-content: center;
                    display: none;                   /* По умолчанию скрыт */
                }

                /* Кнопка будет пульсировать красным когда есть сообщения */
                .amina-btn.has-message { 
                    animation: notifyPulse 1s infinite !important; 
                }

                /* Текст рядом с кнопкой (лейбл) */
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
                    opacity: 0;                      /* Невидим по умолчанию */
                    transition: all 0.5s;            /* Плавное появление */
                    cursor: pointer;                 /* Указатель мыши */
                }

                .amina-label.visible { 
                    opacity: 1;                      /* Видим когда у класса есть visible */
                }

                .amina-name { 
                    font-size: 12px; 
                    color: ${config.textColor || '#666666'}; 
                    margin-top: 6px;                 /* Отступ сверху для имени */
                }

                /* Панель чата (большое окно чата) */
                .amina-panel {
                    position: fixed;
                    bottom: 0;                       /* От дна экрана */
                    right: 0;                        /* От правого края */
                    width: 380px;                    /* Ширина панели */
                    height: 580px;                   /* Высота панели */
                    background: white;
                    border-radius: 16px 16px 0 0;    /* Скруглённые углы вверху */
                    box-shadow: 0 -4px 30px rgba(0,0,0,0.15);
                    z-index: 99999;                  /* Выше чем кнопка */
                    display: flex;
                    flex-direction: column;          /* Вертикальная раскладка */
                    overflow: hidden;                /* Прячем всё что выходит за границы */
                    animation: slideIn 0.3s ease;    /* Появляется справа */
                    font-family: 'Segoe UI', Roboto, Arial, sans-serif;
                }

                .amina-panel.closing { 
                    animation: slideOut 0.3s ease forwards;  /* Исчезает при закрытии */
                }

                /* Шапка панели с аватарой и именем */
                .amina-panel-header {
                    padding: 14px 16px;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-shrink: 0;                  /* Не сжимается при скролле */
                }

                .amina-panel-header img {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;              /* Круглая аватара */
                    border: 2px solid rgba(255,255,255,0.4);
                    object-fit: cover;               /* Обрезаем края */
                }

                .amina-panel-header-name { 
                    font-weight: bold; 
                    font-size: 15px; 
                    flex: 1;                         /* Занимает оставшееся место */
                }

                /* Кнопка закрытия (X) */
                .amina-panel-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 22px;
                    cursor: pointer;
                    padding: 0;
                    opacity: 0.8;
                    transition: opacity 0.2s;
                }

                .amina-panel-close:hover { 
                    opacity: 1;                      /* Полностью видна при наведении */
                }

                /* Контейнер с сообщениями (главная часть чата) */
                .amina-messages {
                    flex: 1;                         /* Занимает всё оставшееся место */
                    overflow-y: auto;                /* Прокрутка если много сообщений */
                    padding: 15px;
                    display: flex;
                    flex-direction: column;          /* Сообщения друг под другом */
                    gap: 10px;
                    background: #f0f2f5;             /* Светлый фон */
                }

                /* Одно сообщение в чате */
                .amina-msg {
                    padding: 10px 14px;
                    border-radius: 18px;             /* Скруглённые углы */
                    max-width: 80%;                  /* Не больше 80% ширины */
                    font-size: 14px;
                    line-height: 1.4;                /* Расстояние между строками */
                    word-wrap: break-word;           /* Переносим слова на новую строку */
                    animation: fadeInMsg 0.3s ease;  /* Появляется снизу */
                }

                /* Сообщение от бота (серое, слева) */
                .amina-msg.bot {
                    align-self: flex-start;          /* Выравнивание слева */
                    background: white;
                    color: #333;
                    border-bottom-left-radius: 4px;  /* Острый уголок слева */
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                /* Сообщение от юзера (цветное, справа) */
                .amina-msg.user {
                    align-self: flex-end;            /* Выравнивание справа */
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    border-bottom-right-radius: 4px; /* Острый уголок справа */
                }

                /* Сообщение от менеджера (синее, слева) */
                .amina-msg.manager {
                    align-self: flex-start;
                    background: #e3f2fd;             /* Светло-синий */
                    color: #333;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    border-left: 3px solid #2196F3;  /* Синяя полоса слева */
                }

                /* Анимация печати - три мигающие точки */
                .amina-typing {
                    display: flex;
                    gap: 4px;
                    align-self: flex-start;          /* Как сообщение бота */
                    padding: 12px 16px;
                    background: white;
                    border-radius: 18px;
                    border-bottom-left-radius: 4px;
                }

                /* Одна точка в анимации */
                .amina-typing span {
                    width: 7px;
                    height: 7px;
                    background: #999;
                    border-radius: 50%;              /* Круглая точка */
                    animation: typingDot 1.4s infinite;
                }

                /* Задержки для волнообразного эффекта */
                .amina-typing span:nth-child(2) { animation-delay: 0.2s; }
                .amina-typing span:nth-child(3) { animation-delay: 0.4s; }

                /* Анимация мигания точки */
                @keyframes typingDot {
                    0%, 60%, 100% { opacity: 0.3; }  /* Тусклая */
                    30% { opacity: 1; }               /* Яркая */
                }

                /* Контейнер с полем ввода и кнопкой отправки */
                .amina-input-area {
                    padding: 12px;
                    background: white;
                    display: flex;
                    gap: 8px;
                    border-top: 1px solid #eee;      /* Разделитель */
                    flex-shrink: 0;                  /* Не сжимается */
                }

                /* Текстовое поле для ввода сообщения */
                .amina-input {
                    flex: 1;                         /* Занимает оставшееся место */
                    padding: 10px 14px;
                    border: 1px solid #ddd;
                    border-radius: 22px;             /* Скруглённое */
                    outline: none;                   /* Без стандартной границы при фокусе */
                    font-size: 14px;
                    font-family: inherit;            /* Берёт шрифт от родителя */
                    transition: border-color 0.2s;   /* Плавная смена цвета */
                }

                /* Когда кликаем на инпут - меняется цвет границы */
                .amina-input:focus { 
                    border-color: ${config.colorStart};  /* Основной цвет */
                }

                /* Кнопка отправки (стрелка) */
                .amina-send {
                    border: none;
                    background: linear-gradient(135deg, ${config.colorStart}, ${config.colorEnd});
                    color: white;
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;              /* Круглая кнопка */
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    flex-shrink: 0;                  /* Не сжимается */
                    transition: opacity 0.2s;
                }

                .amina-send:hover { 
                    opacity: 0.9;                    /* Легче при наведении */
                }

                .amina-send:disabled { 
                    opacity: 0.5;                    /* Полупрозрачная когда отключена */
                    cursor: not-allowed;             /* Крестик вместо руки */
                }
            `;
            document.head.appendChild(style);
            console.log('✅ Стили применены');

            // ========== ЭТАП 6: Создаём HTML элементы ==========

            // Контейнер для виджета
            const widget = document.createElement('div');
            widget.className = 'amina-widget';

            // Лейбл (текст рядом с кнопкой)
            const label = document.createElement('div');
            label.className = 'amina-label';
            
            // Текст который будет печататься
            const textSpan = document.createElement('span');
            
            // Имя бота
            const nameDiv = document.createElement('div');
            nameDiv.className = 'amina-name';
            
            // Собираем лейбл
            label.appendChild(textSpan);
            label.appendChild(nameDiv);

            // Кнопка с аватарой
            const btn = document.createElement('button');
            btn.className = 'amina-btn';
            btn.innerHTML = `<img src="${config.avatarUrl}" alt="${config.botName}" onerror="this.src='https://via.placeholder.com/60'"><span class="amina-badge" id="amina-badge">!</span>`;
            
            // Собираем виджет
            widget.appendChild(label);
            widget.appendChild(btn);
            document.body.appendChild(widget);
            console.log('✅ Виджет добавлен на страницу');

            // ========== ЭТАП 7: Переменные состояния ==========
            // Эти переменные отслеживают текущее состояние виджета

            let panel = null;                   // Текущая открытая панель (null = закрыта)
            let isOpen = false;                 // Открыта ли панель?
            let isLoading = false;              // Отправляется ли сообщение?
            let pendingManagerMessages = [];    // Сообщения которые пришли пока панель закрыта
            let historyUnsubscribe = null;      // Функция для отписки от Firebase

            // ========== ЭТАП 8: Вспомогательные функции ==========

            // Функция: сохранить историю в Firebase
            function saveHistory() {
                historyRef.set(chatHistory);
            }

            // Функция: добавить сообщение в чат
            function addMsg(text, type) {
                const msgs = document.getElementById('amina-messages');
                if (!msgs) return;
                
                const div = document.createElement('div');
                div.className = `amina-msg ${type}`;
                div.innerText = text;
                msgs.appendChild(div);
                scrollDown();
            }

            // Функция: прокрутить чат вниз
            function scrollDown() {
                const msgs = document.getElementById('amina-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            // ========== ЭТАП 9: Функция openPanel() (ИСПРАВЛЕНА) ==========
            // ИСПРАВЛЕНИЕ 1: История не дублируется
            // ИСПРАВЛЕНИЕ 2: Firebase слушатель только в openPanel
            
            function openPanel() {
                if (isOpen) return;
                isOpen = true;
                console.log('🔓 Панель открыта');

                // Скрываем красный значок
                const badge = document.getElementById('amina-badge');
                if (badge) badge.style.display = 'none';
                btn.classList.remove('has-message');

                // Создаём HTML панели
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

                // ✅ ИСПРАВЛЕНИЕ 1: Показываем историю один раз
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
                    } else {
                        // История пустая - загружаем приветствие
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

                pendingManagerMessages = [];

                // Обработчики событий
                document.getElementById('amina-close').onclick = closePanel;
                document.getElementById('amina-send').onclick = sendMsg;
                document.getElementById('amina-input').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') sendMsg();
                });

                // ✅ ИСПРАВЛЕНИЕ 2: Firebase слушатель только в openPanel
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

            // ========== ЭТАП 10: Функция closePanel() (ИСПРАВЛЕНА) ==========
            // ИСПРАВЛЕНИЕ: Отписываемся от Firebase слушателя
            
            function closePanel() {
                if (!panel) return;
                console.log('🔒 Панель закрыта');
                
                isOpen = false;
                panel.classList.add('closing');
                
                // ✅ ИСПРАВЛЕНИЕ: Отписываемся от Firebase
                if (historyUnsubscribe) {
                    historyUnsubscribe();
                    historyUnsubscribe = null;
                }
                
                setTimeout(() => {
                    panel.remove();
                    panel = null;
                }, 300);
            }

            // ========== ЭТАП 11: Функция sendMsg() (ИСПРАВЛЕНА) ==========
            // ИСПРАВЛЕНИЕ: Сообщение когда ИИ выключен
            
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

                    // ✅ ИСПРАВЛЕНИЕ: Сообщение когда ИИ выключен
if (result.aiDisabled) {
    console.log('⏸️ ИИ выключен — менеджер отвечает');
    // ❌ НЕ показываем сообщение на сайте!
    // addMsg('🔴 Менеджер ответит вам в ближайшее время...', 'bot');
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
                    addMsg('❌ Ошибка: ' + e.message, 'bot');
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

            // ========== ЭТАП 12: Функция typeText() ==========
            
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

            // ========== ЭТАП 13: Обработчики событий ==========
            
            btn.onclick = () => isOpen ? closePanel() : openPanel();
            label.onclick = () => isOpen ? closePanel() : openPanel();

            // ========== ЭТАП 14: Запуск анимации печати ==========
            
            typeText();
            console.log('✅ Виджет инициализирован');

        } catch (e) {
            // Если что-то пошло не так - логируем ошибку
            console.error('❌ Widget Error:', e);
        }
    }

    // ============================================================
    // РАЗДЕЛ 5: ЗАПУСК ИНИЦИАЛИЗАЦИИ
    // ============================================================
    // Проверяем готова ли страница перед запуском initMina()
    
    if (document.readyState === 'loading') {
        // Страница ещё загружается
        document.addEventListener('DOMContentLoaded', initMina);
    } else {
        // Страница уже готова
        initMina();
    }

})();  // Конец IIFE функции
