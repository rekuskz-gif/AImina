Отлично! Вот такой же стиль для AI Mina:

```markdown
# 🤖 AI Mina — Multi-Tenant AI Chat Widget
Полнофункциональный AI виджет для продажи услуг на сайтах клиентов

📁 Структура проекта

```
aimina/
├── api/
│   ├── widget_config.js      # API для конфига кнопки
│   ├── chat_config.js        # API для конфига окна чата
│   └── authentication.js     # API для отправки в Claude
├── widget.js                 # Виджет кнопки (вставляется на сайт)
├── chat_window.html          # Интерфейс чата
├── vercel.json               # Конфиг Vercel
├── package.json              # Зависимости
└── README.md                 # Этот файл
```

🚀 Развертывание

### 1. GitHub
- Создай новый репо: `aimina`
- Загрузи все файлы
- Branch: `main`

### 2. Google Cloud
- Проект: `AI-Mina-System`
- Service Account: `mina-ai@ai-mina-system.iam.gserviceaccount.com`
- Google Sheets API включена
- Google Docs API включена

### 3. Google Таблица (База данных)
- ID: `1DYCnjY4n5KsiOUC76YsaHUqOG3sJpbj72psQKFqNuIg`
- Листы:
  - `Widget` — дизайн кнопки
  - `Chat window` — дизайн окна
  - `Authentication` — API ключи Claude

### 4. Vercel
- Подключи репо к Vercel
- Добавь переменные окружения:
  ```
  GOOGLE_SERVICE_ACCOUNT_EMAIL=mina-ai@ai-mina-system.iam.gserviceaccount.com
  GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
  GOOGLE_SHEET_ID=1DYCnjY4n5KsiOUC76YsaHUqOG3sJpbj72psQKFqNuIg
  ```
- Deploy!

📍 URLs

- Основной: `https://ai--mina.vercel.app`
- API кнопки: `https://ai--mina.vercel.app/api/widget_config?clientId=mina_001`
- API окна: `https://ai--mina.vercel.app/api/chat_config?clientId=mina_001`
- API чата: `https://ai--mina.vercel.app/api/authentication`

🔧 Переменные окружения

Нужно добавить в Vercel:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL - почта сервис-аккаунта Google
GOOGLE_PRIVATE_KEY - приватный ключ из JSON Google
GOOGLE_SHEET_ID - ID таблицы с клиентами
```

📝 Конфиг загружается из Google Таблицы

Лист "Widget":
- Строка 3: заголовки
- Строка 4+: данные клиентов

Лист "Chat window":
- Строка 3: заголовки
- Строка 4+: дизайн для каждого клиента

Лист "Authentication":
- Строка 3: заголовки
- Строка 4+: API ключи Claude

💬 Как работает

Клиент добавляет на сайт одну строку:
```html
<script src="https://ai--mina.vercel.app/widget.js" data-client-id="mina_001"></script>
```

Система:
1. widget.js запрашивает конфиг из таблицы
2. Кнопка появляется с дизайном из таблицы
3. При клике открывается окно чата
4. Пользователь пишет вопрос
5. Запрос отправляется в Claude API
6. Ответ появляется в чате
7. История сохраняется в Telegram (опционально)

➕ Добавить нового клиента

1. Откройте Google Таблицу
2. На листе "Widget" добавьте строку:
   ```
   client_id_2 | Привет я Боб | Помогу вам | #ff0000 | #00ff00 | https://фото.png | Боб
   ```
3. На листе "Chat window" добавьте строку:
   ```
   client_id_2 | #ff0000 | #ffffff | #00ff00 | Как дела? | Напишите...
   ```
4. На листе "Authentication" добавьте строку:
   ```
   client_id_2 | sk-ant-xxxxxx | doc_id | tg_token | tg_chat_id | active
   ```
5. Клиент добавляет на сайт:
   ```html
   <script src="https://ai--mina.vercel.app/widget.js" data-client-id="client_id_2"></script>
   ```

Готово! ✅

📦 Зависимости

```json
{
  "dependencies": {
    "google-spreadsheet": "^4.1.1",
    "google-auth-library": "^9.4.1",
    "node-fetch": "^2.7.0"
  }
}
```

✅ Статус

- ✅ Виджет загружается
- ✅ Дизайн из таблицы
- ✅ Кнопка появляется на сайте
- ✅ Текст печатается
- ⏳ Окно чата (в разработке)
- ⏳ Ответы Claude (в разработке)
- ⏳ Telegram интеграция (в разработке)

👤 Контакты

- GitHub: `rekuskz-gif/aimina`
- Email: your@email.com
- Telegram: @your_handle

---

**© 2026 AI Mina — Multi-Tenant SaaS Platform**
```

Скопируй этот текст в README.md! 📝

Удалось обновить?
