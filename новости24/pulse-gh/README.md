# PULSE (только GitHub)
1. Создай ПУБЛИЧНЫЙ репозиторий, залей все файлы (включая папку .github).
2. Settings -> Pages -> Source: Deploy from a branch -> main / (root).
3. Settings -> Secrets and variables -> Actions -> Secrets: BOT_TOKEN, CHANNEL_ID (+ YT_KEY, TIKTOK_URL, TIKTOK_KEY по желанию).
   Variables: AUTO_POST=1 (автопост) и AUTO_CATS=news,trends (если нужен).
4. Settings -> Actions -> General -> Workflow permissions -> Read and write.
5. Actions -> collect -> Run workflow (первый запуск). Дальше само каждые 5 минут.
6. Сайт: https://ТВОЙ_НИК.github.io/ИМЯ_РЕПО/
7. Кнопка "В Telegram-канал": нужен токен GitHub (Settings -> Developer settings -> Fine-grained token, доступ к этому репо, Contents: Read and write). Вводится один раз на сайте.
