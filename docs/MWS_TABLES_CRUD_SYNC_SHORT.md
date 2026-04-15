# MWS Tables CRUD Sync (short)

Короткая карта того, как изменения таблиц проходят через WikiLive и синхронизируются с MWS Tables.

## Поток синхронизации

1. UI вызывает методы `wikiliveApi` (frontend).
2. Запрос идет в BFF: `/api/v1/mws/...` (backend controller).
3. `MwsService` проксирует запрос в MWS Tables API (`https://tables.mws.ru/fusion/v1`).
4. После мутаций backend инвалидирует Redis-кэш (`records/embed/fields/views`).
5. Следующее чтение берет актуальные данные из MWS.

## Где что находится

- Frontend API-клиент: `frontend/src/shared/api/wikilive.ts`
- UI-операции таблицы (inline edit/add/delete): `frontend/src/features/wiki-tables/model/use-wiki-table-embed.ts`
- BFF роуты: `backend/src/mws/mws.controller.ts`
- Прокси во внешний MWS API: `backend/src/mws/mws.service.ts`

## Основные CRUD-эндпоинты BFF

- `POST /api/v1/mws/datasheets/:datasheetId/records` — создать строки
- `PATCH /api/v1/mws/datasheets/:datasheetId/records` — обновить строки
- `DELETE /api/v1/mws/datasheets/:datasheetId/records` — удалить строки
- `POST /api/v1/mws/datasheets/:datasheetId/fields` — создать поле
- `DELETE /api/v1/mws/datasheets/:datasheetId/fields/:fieldId` — удалить поле
- `DELETE /api/v1/mws/spaces/:spaceId/datasheets/:datasheetId` — удалить таблицу

## Соответствие внешнему MWS API

`MwsService` отправляет запросы в MWS через общий метод `request(...)` и URL вида:

- `POST/PATCH/DELETE /datasheets/:datasheetId/records`
- `POST/DELETE /spaces/:spaceId/datasheets/...`
- `POST/DELETE /spaces/:spaceId/datasheets/:datasheetId/fields...`

## Важно для demo

- Для работы CRUD нужен MWS token (`x-mws-token` или `MWS_TABLES_API_TOKEN`).
- UI использует optimistic update, а backend обеспечивает консистентность через повторное чтение после сброса кэша.