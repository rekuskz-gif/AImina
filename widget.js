{
  "version": 2,
  "builds": [
    {
      "src": "api/*.js",
      "use": "@vercel/node"
    },
    {
      "src": "widget.js",
      "use": "@vercel/static"
    },
    {
      "src": "chat_window.html",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1",
      "headers": {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    },
    {
      "src": "/widget.js",
      "dest": "/widget.js",
      "headers": {
        "Content-Type": "application/javascript",
        "Access-Control-Allow-Origin": "*"
      }
    },
    {
      "src": "/chat_window.html",
      "dest": "/chat_window.html",
      "headers": {
        "Content-Type": "text/html"
      }
    }
  ]
}
