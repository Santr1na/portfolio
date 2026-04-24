# Freelansee — статический сайт-портфолио

Одностраничный лендинг (`index.html` + папка `images/`). Сборки нет: достаточно отдать файлы веб-сервером.

## Локальный просмотр

Из корня проекта:

```bash
cd /path/to/freelansee
python3 -m http.server 8080
```

Открой в браузере: `http://localhost:8080/`

Остановка: `Ctrl+C`.

## Развёртывание на сервере

### 1. Скопировать файлы на VPS

Нужны как минимум:

- `index.html`
- каталог `images/` (все PNG и `.gitkeep` не обязателен)

Пример с `rsync` (подставь пользователя, хост и путь):

```bash
rsync -avz --delete ./index.html ./images/ user@your-server.example:/var/www/freelansee/
```

Или через `scp`:

```bash
scp index.html user@your-server.example:/var/www/freelansee/
scp -r images user@your-server.example:/var/www/freelansee/
```

### 2. Nginx

Установка (Debian/Ubuntu):

```bash
sudo apt update && sudo apt install -y nginx
```

Пример сайта `/etc/nginx/sites-available/freelansee`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.example;

    root /var/www/freelansee;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # кэш для картинок (по желанию)
    location /images/ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

Включить сайт и перезагрузить Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/freelansee /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. HTTPS (Let’s Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Дальше сертификаты обновляет `certbot` по таймеру.

### 4. Альтернативы

- **Caddy** — положи `index.html` и `images/` в `root` директории сайта; HTTPS часто настраивается одной строкой `tls` в Caddyfile.
- **GitHub Pages / Cloudflare Pages / Netlify** — залей содержимое репозитория (корень = `index.html` + `images/`), в настройках укажи корень публикации.

## Проверка после деплоя

1. Открыть главную: `https://your-domain.example/`
2. Убедиться, что карусель подгружает файлы из `/images/` (в DevTools → Network не должно быть 404 на `slide-*.png`).

## Структура

```
freelansee/
├── index.html      # вся вёрстка и стили
├── images/         # скриншоты для карусели
└── README.md
```

При смене домена или пути обновляй только конфиг сервера; в HTML абсолютные URL на домен не зашиты.
