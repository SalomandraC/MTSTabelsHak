# Document Export Module

Модуль экспорта страниц WikiLive в форматы PDF, DOCX и Markdown.

## Архитектура

```
Frontend (workspace-page.tsx)
  └─ handleExportPage()
       └─ exportDocument() [shared/lib/export-document.ts]
            └─ POST http://docgen:3200/generate
                 └─ document-generator (отдельный Docker-сервис)
                      ├─ document-parser.ts   — ProseMirror JSON → BlockNode[]
                      ├─ pdf-generator.ts     — BlockNode[] → PDF (Puppeteer)
                      ├─ docx-generator.ts    — BlockNode[] → DOCX (docx library)
                      └─ md-generator.ts      — BlockNode[] → Markdown
```

## Сервис document-generator

Stateless Express-сервис на порту `3200`. Принимает JSON, возвращает бинарный файл.

### Endpoint

```
POST /generate
Content-Type: application/json

{
  "format": "pdf" | "docx" | "md",
  "title": "string",
  "document": <ProseMirror JSON>,
  "auth": {
    "accessToken": "string",   // JWT токен пользователя
    "userId": "string",
    "displayName": "string"
  },
  "appBaseUrl": "http://localhost:5173",  // для ссылок на страницы
  "spaceId": "string"
}
```

Ответ: бинарный файл с заголовком `Content-Disposition: attachment`.

### Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3200` | Порт сервиса |
| `API_BASE_URL` | `http://api:8080` | URL backend для загрузки данных таблиц |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | Путь к Chromium в контейнере |

## Где что находится

- Фронтенд-утилита: `frontend/src/shared/lib/export-document.ts`
- Вызов экспорта: `frontend/src/pages/workspace/ui/workspace-page.tsx` → `handleExportPage()`
- Пункт меню: `frontend/src/pages/workspace/ui/workspace-page-actions-menu.tsx`
- Сервис: `document-generator/src/`
- Dockerfile: `document-generator/Dockerfile`

## Поток данных

1. Пользователь нажимает «Экспортировать» → выбирает формат.
2. `handleExportPage()` принудительно создаёт checkpoint активной страницы, затем загружает последний checkpoint через `listPageHistory` + `getPageHistoryCheckpoint`.
3. `exportDocument()` отправляет ProseMirror JSON + auth + appBaseUrl в docgen.
4. `document-parser.ts` разворачивает ProseMirror JSON в плоский список `BlockNode[]`.
5. Генератор нужного формата обходит блоки и строит документ.
6. Файл возвращается в браузер как download.

## Поддерживаемые блоки

| Блок | PDF | DOCX | MD |
|---|---|---|---|
| Заголовки h1–h6 | ✅ | ✅ | ✅ |
| Параграфы (bold, italic, strike, underline, code, highlight) | ✅ | ✅ | ✅ |
| Изображения (base64, URL) | ✅ | ✅ | ✅ |
| Ссылки на страницы WikiLive | ✅ | ✅ | ✅ |
| Маркированные и нумерованные списки | ✅ | ✅ | ✅ |
| Чеклисты | ✅ | ✅ | ✅ |
| Блоки кода | ✅ | ✅ | ✅ |
| Цитаты | ✅ | ✅ | ✅ |
| Горизонтальный разделитель | ✅ | ✅ | ✅ |
| Таблицы MWS (данные через API) | ✅ | ✅ | placeholder |
| iframe | placeholder | placeholder | HTML-комментарий |

## Таблицы MWS в экспорте

При наличии `datasheetId` генераторы PDF и DOCX загружают данные таблицы через backend:

```
GET /api/v1/mws/datasheets/{datasheetId}/fields
GET /api/v1/mws/datasheets/{datasheetId}/records?pageSize=100
```

Запросы авторизуются токеном пользователя из поля `auth` запроса. Если API недоступен — вставляется placeholder с названием таблицы.

## Ссылки на страницы

`pageLink` ноды внутри параграфов рендерятся как кликабельные ссылки вида:

```
{appBaseUrl}/spaces/{spaceId}/pages/{pageId}
```

В PDF — тег `<a href="...">`, в DOCX — `ExternalHyperlink`, в MD — `[title](url)`.

## Docker

Сервис запускается вместе с остальными через `docker compose up --build`.

```yaml
docgen:
  build: ./document-generator
  environment:
    PORT: 3200
    API_BASE_URL: http://api:8080
  ports:
    - "3200:3200"
```

Образ использует Alpine + системный Chromium (`apk add chromium`) — работает нативно на ARM (Apple Silicon) и x86.

## Зависимости

| Пакет | Лицензия | Назначение |
|---|---|---|
| `puppeteer` | Apache 2.0 | Headless Chromium для PDF |
| `docx` | MIT | Генерация DOCX |
| `handlebars` | MIT | HTML-шаблон для PDF |
| `express` | MIT | HTTP-сервер |
| `cors` | MIT | CORS-заголовки |
