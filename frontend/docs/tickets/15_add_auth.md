# Сделать логику авторизации через ввод API-ключа

## Цель

Сделать логин для фронта: при первом заходе пользователь вводит API-ключ. Backend валидирует ключ в MWS Tables, создает сессию и выдает refresh token в HttpOnly cookie. Frontend хранит access token только в памяти и добавляет его в Authorization как Bearer для запросов к backend.


## Решение

Следующий поток действий:
1. Пользователь видит форму ввода API-ключа и нажимает "Войти"
2. Frontend вызывает `POST /api/v1/auth/login` с телом `{ "apiKey": "sk-..." }`
3. Backend валидирует ключ пробным `GET /spaces` в MWS и кеширует результат на 5 минут в Redis
4. При успехе backend возвращает `204 No Content` и `Set-Cookie: refresh_token=...; HttpOnly`
5. Frontend вызывает `POST /api/v1/auth/refresh`, получает access token (15 мин) и хранит его в памяти
6. Frontend выполняет `GET /api/v1/me` для загрузки профиля
7. Frontend делает silent refresh каждые 10 минут

Контракт ошибок:
- невалидный API-ключ: `401 Unauthorized` (`Invalid API key`)
- MWS недоступен: `502 Bad Gateway` (`MWS unavailable, try later`)

Параметры сессии:
- Access token: 15 минут
- Refresh token: 8 часов, ротация на каждом refresh

Обязательные endpoints:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`

Важно:
- `AUTH_REQUIRED` по умолчанию должен быть `true`
- при `AUTH_REQUIRED=false` сохраняется демо-режим для локальной отладки