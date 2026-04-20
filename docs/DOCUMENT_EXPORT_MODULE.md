# Document Export Module

Модуль экспорта страниц WikiLive в форматы PDF, DOCX и Markdown.

Важно: это отдельный export-only контур. Он не используется в pipeline импорта Markdown и не участвует в создании страниц из `.md` файлов.

## Архитектура

```
Frontend (workspace-page.tsx)
  └─ handleExportPage()
       └─ exportDocument() [shared/lib/export-document.ts]
            └─ POST {VITE_DOCGEN_URL}/generate
                 └─ document-generator (отдельный Docker-сервис)
                      ├─ document-parser.ts   — ProseMirror JSON → BlockNode[]
                      ├─ live-inline.ts       — resolve live inline nodes during export
                      ├─ pdf-generator.ts     — BlockNode[] → PDF (Puppeteer)
                      ├─ docx-generator.ts    — BlockNode[] → DOCX (docx library)
                      └─ md-generator.ts      — BlockNode[] → Markdown
```

## Сервис document-generator

Stateless Express-сервис на порту `3200`. Принимает JSON, возвращает бинарный файл.

С фронтенда сервис вызывается через `frontend/src/shared/lib/export-document.ts`. По умолчанию используется `VITE_DOCGEN_URL ?? http://localhost:3200`, то есть браузерный клиент ходит в docgen через опубликованный HTTP endpoint, а не по docker hostname `docgen`.

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

Дополнительно сервис предоставляет health-check:

```text
GET /health
```

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

## Что не входит в модуль

В модуль экспорта не входит импорт Markdown.

- экспорт использует `document-generator` и работает от готового ProseMirror JSON;
- импорт Markdown выполняется на фронтенде через `frontend/src/features/markdown-import/` и создаёт новые страницы через `wikiliveApi.createPage(...)`.

Если коротко: export service не является универсальным document conversion pipeline в обе стороны, а отвечает только за выгрузку существующего документа наружу.

## Поток данных

1. Пользователь нажимает «Экспортировать» и выбирает формат.
2. `handleExportPage()` принудительно создаёт checkpoint активной страницы.
3. После этого фронтенд читает последний checkpoint через `listPageHistory` и `getPageHistoryCheckpoint`.
4. `exportDocument()` отправляет ProseMirror JSON, auth, `appBaseUrl` и `spaceId` в `document-generator`.
5. `document-parser.ts` разворачивает ProseMirror JSON в плоский список `BlockNode[]` и сохраняет rich inline-структуру.
6. `live-inline.ts` резолвит живые inline-сущности во время экспорта:
   - подтягивает актуальные значения `liveReference` через MWS API;
   - пересчитывает `liveFormula` по токенам `[Ref:datasheetId:recordId:fieldId]`;
   - сохраняет `templateVariable` как placeholder `{{label}}`.
7. Генератор нужного формата строит итоговый документ.
8. Браузер получает бинарный ответ и инициирует скачивание файла.

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

## Живые inline-сущности

Экспорт умеет работать не только с обычным текстом и marks, но и с inline-сущностями редактора:

| Inline-сущность | Что делает экспорт |
|---|---|
| `liveReference` | Во время экспорта запрашивает текущее значение ячейки через MWS API и вставляет его в документ |
| `liveFormula` | Во время экспорта заново вычисляет формулу по актуальным `liveReference` значениям |
| `templateVariable` | Экспортирует как placeholder `{{label}}`, не удаляя узел из текста |
Это означает, что экспорт берёт значение живой переменной в момент генерации файла, а не только то значение, которое могло быть сохранено в документе раньше.

## Живые переменные и формулы в экспорте

Резолв живых переменных и формул выполняется в `document-generator/src/live-inline.ts`.

Как это работает:

1. parser сохраняет `liveReference`, `liveFormula`, `templateVariable` и `hardBreak` как inline-узлы;
2. export resolver проходит по inline-узлам перед рендерингом формата;
3. для `liveReference` выполняется запрос:

```text
GET /api/v1/mws/datasheets/{datasheetId}/records/{recordId}/fields/{fieldId}
```

4. для `liveFormula` извлекаются все токены вида `[Ref:datasheetId:recordId:fieldId]`, после чего формула пересчитывается на основе актуальных значений ячеек;
5. значения ячеек кэшируются в рамках одного export job, чтобы не делать повторные запросы к одной и той же ячейке.

Формат вывода `liveFormula` в экспорте:

- исходные `Ref`-токены не сохраняются в итоговом файле;
- вместо них подставляются актуальные числовые значения ячеек;
- после раскрытого выражения ставится `=`, а затем итог вычисления.

Пример:

```text
[Ref:dstp6bwfZE5pQDVdw2:reckUfhUDklZt:fld26RB8kohGX] + [Ref:dstp6bwfZE5pQDVdw2:reckUfhUDklZt:fld26RB8kohGX]
```

в экспорте превращается в:

```text
123+123 = 246
```

Ограничения:

- формулы поддерживают только арифметические выражения после раскрытия `Ref`-токенов;
- если ячейка недоступна или значение нечисловое, экспорт использует fallback на сохранённый `result` или исходное выражение, чтобы не сорвать генерацию документа.

## Таблицы MWS в экспорте

При наличии `datasheetId` генераторы PDF и DOCX загружают данные таблицы через backend:

```
GET /api/v1/mws/datasheets/{datasheetId}/fields
GET /api/v1/mws/datasheets/{datasheetId}/records?pageSize=100
```

Запросы авторизуются токеном пользователя из поля `auth` запроса. Если API недоступен, генератор вставляет placeholder с названием таблицы вместо реальных данных.

Тот же пользовательский токен используется и для export-resolve живых переменных, потому что без него `document-generator` не сможет достучаться до значений ячеек пользователя.

## Ссылки на страницы

`pageLink` ноды внутри параграфов и standalone `pageLink` блоки рендерятся как кликабельные ссылки вида:

```
{appBaseUrl}/spaces/{spaceId}/pages/{pageId}
```

В PDF — тег `<a href="...">`, в DOCX — `ExternalHyperlink`, в MD — `[title](url)`.

Если `appBaseUrl`, `spaceId` или `pageId` отсутствуют, экспорт использует fallback без полноценного absolute URL.

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

Образ использует Alpine + системный Chromium (`apk add chromium`) и рассчитан на локальный запуск в demo-окружении.

## Зависимости

| Пакет | Лицензия | Назначение |
|---|---|---|
| `puppeteer` | Apache 2.0 | Headless Chromium для PDF |
| `docx` | MIT | Генерация DOCX |
| `handlebars` | MIT | HTML-шаблон для PDF |
| `express` | MIT | HTTP-сервер |
| `cors` | MIT | CORS-заголовки |

## Проверка и отладка

- Фронтендовый entrypoint: `frontend/src/shared/lib/export-document.ts`
- HTTP-сервис: `document-generator/src/index.ts`
- Парсер ProseMirror: `document-generator/src/document-parser.ts`
- Resolver живых inline-узлов: `document-generator/src/live-inline.ts`
- Генераторы форматов: `document-generator/src/generators/*`

Для локальной диагностики можно проверить доступность сервиса:

```bash
curl http://localhost:3200/health
```
