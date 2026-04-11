Вот перевод на русский язык:

# WikiLive

WikiLive — это совместный вики-модуль для кейса хакатона `WikiLive: живые таблицы внутри текста`.

Текущее состояние репозитория:
- `backend/` содержит каркас бэкенда на NestJS с Prisma, PostgreSQL, Redis, BullMQ и Hocuspocus
- `frontend/` содержит React + Tiptap workspace с MWS-first проводником, wiki-страницами рядом с таблицами, backlinks и live embeds
- `docs/openapi.yaml` содержит HTTP/WebSocket контракт
- `docs/MWS_TABLES_API_ANALYSIS.md` описывает, как сущности MWS Tables встраиваются в редактор

## Возможности бэкенда

Реализованные основы бэкенда:
- legacy wiki-дерево с папками и страницами для совместимости
- MWS-first дерево пространства: проводник повторяет иерархию MWS Tables и накладывает WikiLive-страницы рядом с таблицами
- CRUD-операции со страницами с иерархическим размещением
- обратные и исходящие ссылки
- server-driven каталог плагинов с entitlement-логикой по подписке и пользовательскими override-переключателями
- начальная загрузка сессии совместной работы для `Tiptap + Yjs`
- персистентность CRDT с моментальными снимками, контрольными точками и журналом обновлений в режиме append-only
- BFF-эндпоинты живых MWS Tables для пространств, узлов, таблиц, полей, представлений, записей и разрешения встраивания таблиц
- идемпотентное создание WikiLive-страницы для MWS таблицы через `POST /api/v1/mws/table-pages`
- picker MWS Tables поддерживает таблицы внутри папок, выбор view/полей и настройку live embed
- MWS Tables embed отображается как scrollable live grid с догрузкой записей и inline-операциями над простыми ячейками/строками через BFF
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

## Окружение

Базовый пример конфигурации находится в [backend/.env.example](/Users/nikitababicenko/PhpstormProjects/truetecharena/backend/.env.example).

Важные переменные:
- `DATABASE_URL`
- `REDIS_URL`
- `PORT`
- `COLLAB_PORT`
- `JWT_SECRET`
- `MWS_TABLES_BASE_URL`
- `MWS_TABLES_NODE_URL_TEMPLATE`
- `AUTH_REQUIRED`
- `DEFAULT_PLUGIN_PLAN`
- `PLUGIN_USER_PLAN_MAP`
- `VITE_API_BASE_URL`
- `VITE_WIKILIVE_SPACE_ID`

Плагины и entitlement-модель:
- backend отдает каталог через `GET /api/v1/plugins/catalog`
- пользователь может включать/выключать реализованные optional plugins через `POST /api/v1/plugins/:pluginId/activate` и `POST /api/v1/plugins/:pluginId/deactivate`
- core-модули неотключаемы и всегда активны
- по умолчанию `DEFAULT_PLUGIN_PLAN=enterprise`, поэтому новый пользователь получает максимальный план и видит все доступные в MVP плагины
- `PLUGIN_USER_PLAN_MAP` принимает JSON вида `{"demo-user":"free","demo-user-2":"pro"}`

Авторизация по API-ключу:
- `POST /api/v1/auth/login` принимает `{ "apiKey": "sk-..." }`, валидирует ключ через MWS `/spaces` и выставляет `HttpOnly` cookie `refresh_token`
- `POST /api/v1/auth/refresh` ротирует refresh token и возвращает короткоживущий access token (15 минут)
- `POST /api/v1/auth/logout` очищает refresh cookie и инвалидирует серверную сессию
- `GET /api/v1/me` возвращает текущего пользователя

Особенности:
- refresh token живет 8 часов и хранится только в `HttpOnly` cookie
- frontend держит access token только в памяти и делает silent refresh каждые 10 минут
- по умолчанию `AUTH_REQUIRED=true`; для демо-режима можно вручную выставить `AUTH_REQUIRED=false`

Совместная работа и шаринг страницы:
- каждая открытая страница синхронизирует URL в формате `/spaces/:spaceId/pages/:pageId`
- кнопку `Скопировать ссылку` можно использовать, чтобы открыть тот же документ во втором окне или отправить другому пользователю
- для проверки разных реальных пользователей откройте ссылку в другом браузерном профиле/инкогнито и войдите другим MWS API-ключом
- в демо-режиме с `AUTH_REQUIRED=false` можно открыть ссылку с query params `?userId=demo-user-2&userName=Demo%20User%202`, чтобы backend выдал отдельного demo-пользователя через `x-user-id`/`x-user-name`

MWS-first проводник:
- sidebar использует `GET /api/v1/spaces/:spaceId/workspace/tree`, где источником иерархии являются MWS Tables nodes
- все таблицы MWS отображаются в проводнике; при клике открывается окно с действиями `Создать страницу с таблицей`, `Перейти на таблицу в tables.mws.ru` и `Удалить таблицу`
- создание страницы для таблицы идемпотентно: повторный клик открывает существующую WikiLive-страницу рядом с этой MWS-таблицей

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
