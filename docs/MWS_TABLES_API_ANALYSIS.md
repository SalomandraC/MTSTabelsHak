# Анализ интеграции MWS Tables API для WikiLive

## 1. Цель документа

Документ фиксирует актуальную интеграционную модель между WikiLive и MWS Tables:

- что является источником истины по данным
- какие API-методы реально используются в backend
- как таблица встраивается в редактор как live-объект
- какие ограничения и риски есть в текущем подходе
- как отслеживается эволюция интеграции

Этот документ синхронизирован с текущим backend-контуром (`backend/src/mws/*`) и OpenAPI контрактом.

## 2. Архитектурная позиция

WikiLive не дублирует функциональность MWS Tables и не копирует таблицы в wiki-хранилище.

Разделение ответственности:

- MWS Tables: источник истины для tabular data (spaces, nodes, datasheets, fields, views, records, attachments).
- WikiLive backend: источник истины для wiki-страниц, связей между страницами, комментариев, доступов и CRDT-состояния редактора.
- Tiptap документ: хранит конфигурацию embed-блока, но не хранит таблицу как master-данные.

Именно это позволяет сохранить честную интеграцию "live table inside text", а не статичный экспорт.

## 3. Актуальный интеграционный контур (BFF)

Frontend ходит только в backend WikiLive. Backend выступает BFF и проксирует/нормализует доступ к MWS Tables API.

Базовые BFF endpoints:

- `GET /api/v1/mws/spaces`
- `GET /api/v1/mws/spaces/{spaceId}/nodes`
- `GET /api/v1/mws/nodes/{nodeId}`
- `POST /api/v1/mws/spaces/{spaceId}/sync-tree`

Таблицы и схема:

- `POST /api/v1/mws/spaces/{spaceId}/datasheets`
- `DELETE /api/v1/mws/spaces/{spaceId}/datasheets/{datasheetId}`
- `GET /api/v1/mws/datasheets/{datasheetId}/fields`
- `POST /api/v1/mws/datasheets/{datasheetId}/fields?spaceId=...`
- `DELETE /api/v1/mws/datasheets/{datasheetId}/fields/{fieldId}?spaceId=...`
- `PATCH /api/v1/mws/datasheets/{datasheetId}/views/{viewId}/fields/{fieldId}/index`

Views:

- `GET /api/v1/mws/datasheets/{datasheetId}/views`
- `POST /api/v1/mws/datasheets/{datasheetId}/views?spaceId=...`
- `POST /api/v1/mws/spaces/{spaceId}/datasheets/{datasheetId}/views/{viewId}/sort`
- `POST /api/v1/mws/spaces/{spaceId}/datasheets/{datasheetId}/views/{viewId}/group`

Records:

- `GET /api/v1/mws/datasheets/{datasheetId}/records`
- `GET /api/v1/mws/datasheets/{datasheetId}/records/{recordId}/fields/{fieldId}`
- `POST /api/v1/mws/datasheets/{datasheetId}/records`
- `PATCH /api/v1/mws/datasheets/{datasheetId}/records`
- `DELETE /api/v1/mws/datasheets/{datasheetId}/records?recordIds=id1,id2`

Embeds и table-page:

- `POST /api/v1/mws/table-embeds/resolve`
- `POST /api/v1/mws/table-pages`

Attachments:

- `POST /api/v1/mws/datasheets/{datasheetId}/attachments`
- `GET /api/v1/mws/datasheets/{datasheetId}/attachments?token=...`

## 4. Почему BFF обязателен

Прямой доступ frontend -> MWS API в текущем продукте нежелателен.

Причины:

- безопасность токенов
- централизованная обработка `401/403/404/5xx`
- нормализация payload в единый контракт для UI
- кеширование и дедупликация fan-out запросов
- контролируемая деградация при проблемах upstream

## 5. Модель live embed в документе

Рекомендуемая (и фактически используемая) модель embed-узла в редакторе:

- идентичность таблицы:
: `spaceId`, `nodeId`, `datasheetId`
- представление:
: `viewId`
- конфигурация отображения:
: `selectedFieldIds`, `displayMode`, `pageSize`, `filterByFormula`
- служебные атрибуты:
: `title`, `lastResolvedAt`, `allowInlineEdit`

Ключевой принцип:

- CRDT документ синхронизирует структуру и конфиг блока.
- данные строк/полей читаются динамически из MWS Tables через backend.

## 6. Ключевые продуктовые сценарии

### 6.1 Вставка существующей таблицы в страницу

Поток:

1. Пользователь инициирует вставку (slash-menu).
2. UI загружает spaces -> nodes.
3. Пользователь выбирает таблицу/нод.
4. Backend резолвит embed через `POST /api/v1/mws/table-embeds/resolve`.
5. В Tiptap вставляется `mwsTableEmbed` с идентичностью и конфигом.

### 6.2 Живой рендер таблицы в тексте

Поток:

1. Embed-компонент запрашивает views/fields/records.
2. Таблица рендерится как live grid, а не snapshot.
3. По таймеру/действию пользователя выполняется refresh.

### 6.3 Inline-редактирование данных

Поток:

1. Пользователь редактирует ячейки/строки в embed.
2. UI вызывает `POST/PATCH/DELETE .../records`.
3. Backend проксирует изменения в MWS.
4. UI обновляет состояние оптимистично и подтверждает после ответа.

### 6.4 Идемпотентная table-page в MWS-first проводнике

Поток:

1. Пользователь выбирает таблицу в проводнике.
2. `POST /api/v1/mws/table-pages` создает/находит связанную wiki-страницу.
3. Пользователь попадает в страницу, где таблица уже встроена.

## 7. Согласованность и коллаборация

Важно разделять две синхронизации:

- CRDT коллаборация (Yjs/Hocuspocus): синхронизирует текст и структуру страницы.
- Табличная синхронизация (MWS API): синхронизирует records/fields/views.

Это две независимые модели состояния. Их не нужно пытаться объединить в единую транзакцию.

## 8. Кеширование и производительность

Текущая backend-реализация использует Redis-кеш для MWS вызовов и short TTL для горячих сущностей.

Практические рекомендации:

- использовать `fieldKey=id` для стабильной привязки полей
- ограничивать `pageSize` в embed-preview
- кэшировать spaces/nodes/fields/views отдельно
- инвалидировать кеш после мутаций (records/fields/views)
- избегать N+1 fan-out при множественных embed на странице

## 9. Ошибки и деградация UX

Минимальные состояния, которые UI обязан корректно покрывать:

- нет доступа (`401/403`)
- таблица или view удалены (`404`)
- временная недоступность upstream (`5xx`)
- частично устаревший локальный конфиг embed (поле удалено/переименовано)

Рекомендуемое поведение:

- явный error-state в блоке embed
- кнопка retry/refresh
- мягкая деградация (показ доступных полей/записей)
- отдельный статус синхронизации таблицы и статуса сохранения документа

## 10. Безопасность

Обязательные практики:

- не пробрасывать секреты MWS на frontend
- использовать только backend-токенизацию/прокси
- логировать ошибки без утечки чувствительных данных
- ограничивать upload/download вложений по авторизованному контексту пользователя

## 11. Ограничения текущего подхода

- Нет гарантированного realtime changefeed для таблиц на уровне WikiLive BFF (в основном request/refresh модель).
- При большом количестве embed на странице нужен аккуратный контроль polling/refresh.
- История wiki-страниц и история таблиц - разные контуры, которые нельзя смешивать семантически.

## 12. Трассируемость изменений

Историю эволюции фронтенд-интеграции можно смотреть в тикетах:

- [frontend/docs/tickets](../frontend/docs/tickets)

Контракт API:

- [docs/openapi.yaml](openapi.yaml)

## 13. Вывод

Текущий API-контур MWS Tables полностью покрывает целевой сценарий "живые таблицы внутри текста" при условии BFF-интеграции.

Архитектурно правильная формула для WikiLive:

- текст + связи + коллаборация -> в WikiLive
- табличные данные и их операции -> в MWS Tables
- склейка и UX-оркестрация -> в backend WikiLive

Такая модель дает:

- честную live-интеграцию
- понятные границы ответственности
- хорошую масштабируемость для дальнейших фич (templates, AI, graph, context search)
