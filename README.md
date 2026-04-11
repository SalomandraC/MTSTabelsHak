# WikiLive

WikiLive — это совместный вики-модуль для кейса хакатона `WikiLive: живые таблицы внутри текста`.

Текущее состояние репозитория:
- `backend/` содержит каркас бэкенда на NestJS с Prisma, PostgreSQL, Redis, BullMQ и Hocuspocus
- `frontend/` содержит React + Tiptap workspace с wiki-навигацией, live embeds, backlinks и collaboration-подключением
- `docs/openapi.yaml` содержит HTTP/WebSocket контракт
- `docs/MWS_TABLES_API_ANALYSIS.md` описывает, как сущности MWS Tables встраиваются в редактор

## Возможности бэкенда

Реализованные основы бэкенда:
- вики-дерево с папками и страницами
- CRUD-операции со страницами с иерархическим размещением
- обратные и исходящие ссылки
- начальная загрузка сессии совместной работы для `Tiptap + Yjs`
- персистентность CRDT с моментальными снимками, контрольными точками и журналом обновлений в режиме append-only
- BFF-эндпоинты живых MWS Tables для пространств, узлов, таблиц, полей, представлений, записей и разрешения встраивания таблиц
- кратковременный кэш на Redis и очередь обслуживания документов на BullMQ

## Быстрый старт

Локальная инфраструктура одной командой:

```bash
docker compose up --build
```

Это запускает:
- `postgres` на порту `5432`
- `redis` на порту `6379`
- HTTP API бэкенда на порту `8080`
- сервер совместной работы на порту `8081`
- frontend Vite dev server на порту `5173`

Откройте приложение по адресу:

```bash
http://localhost:5173
```

## Локальная разработка

Установка зависимостей:

```bash
cd backend
npm install
```

Генерация Prisma клиента:

```bash
npx prisma generate
```

Выполнение миграций:

```bash
npx prisma migrate dev
```

Запуск бэкенда:

```bash
npm run start:dev
```

Запуск фронтенда:

```bash
cd frontend
npm install
npm run dev
```

## Окружение

Базовый пример конфигурации находится в [backend/.env.example](/Users/nikitababicenko/PhpstormProjects/truetecharena/backend/.env.example).
Базовый пример frontend-конфигурации находится в [frontend/.env.example](/Users/nikitababicenko/PhpstormProjects/truetecharena/frontend/.env.example).

Важные переменные:
- `DATABASE_URL`
- `REDIS_URL`
- `PORT`
- `COLLAB_PORT`
- `JWT_SECRET`
- `MWS_TABLES_BASE_URL`
- `AUTH_REQUIRED`
- `VITE_API_BASE_URL`
- `VITE_WIKILIVE_SPACE_ID`

Авторизация по API-ключу:
- `POST /api/v1/auth/login` принимает `{ "apiKey": "sk-..." }`, валидирует ключ через MWS `/spaces` и выставляет `HttpOnly` cookie `refresh_token`
- `POST /api/v1/auth/refresh` ротирует refresh token и возвращает короткоживущий access token (15 минут)
- `POST /api/v1/auth/logout` очищает refresh cookie и инвалидирует серверную сессию
- `GET /api/v1/me` возвращает текущего пользователя

Особенности:
- refresh token живет 8 часов и хранится только в `HttpOnly` cookie
- frontend держит access token только в памяти и делает silent refresh каждые 10 минут
- по умолчанию `AUTH_REQUIRED=true`; для демо-режима можно вручную выставить `AUTH_REQUIRED=false`

## API и документация

- OpenAPI: [docs/openapi.yaml](/Users/nikitababicenko/PhpstormProjects/truetecharena/docs/openapi.yaml)
- Память проекта: [docs/PROJECT_MEMORY.md](/Users/nikitababicenko/PhpstormProjects/truetecharena/docs/PROJECT_MEMORY.md)
- Анализ MWS API: [docs/MWS_TABLES_API_ANALYSIS.md](/Users/nikitababicenko/PhpstormProjects/truetecharena/docs/MWS_TABLES_API_ANALYSIS.md)
- Postman коллекция: [postman/wikilive-api.postman_collection.json](/Users/nikitababicenko/PhpstormProjects/truetecharena/postman/wikilive-api.postman_collection.json)
- Postman окружение: [postman/wikilive-local.postman_environment.json](/Users/nikitababicenko/PhpstormProjects/truetecharena/postman/wikilive-local.postman_environment.json)

Swagger доступен в бэкенде по адресу `/docs`.

## Postman сценарий

Импортируйте оба файла из `postman/` и запустите папку `Scenario - Core Wiki Flow`.

Сценарий проверяет:
- health endpoint
- пустое wiki-дерево
- создание папки
- создание страницы внутри папки
- вложенную структуру дерева
- список страниц и загрузку страницы с document state
- bootstrap сессии совместного редактирования
- создание checkpoint
- backlinks и outgoing links
- перемещение страницы обратно в корень

Папка `MWS Tables BFF` требует реальные значения окружения `mwsToken`, `mwsSpaceId`, `mwsNodeId`, `mwsDatasheetId` и опционально `mwsViewId`.

## Тесты

Запуск тестов бэкенда:

```bash
cd backend
npm test -- --runInBand
```

Проверка сборки:

```bash
cd backend
npm run build
```

Проверка фронтенда:

```bash
cd frontend
npm run lint
npm run build
```
