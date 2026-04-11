# MWS Tables ↔ Wiki Editor (Tiptap): Data Mapping and Connector Roadmap

## 1. Scope and Objective

Документ фиксирует технический контракт и правила сопоставления данных между:

- таблицами MWS Tables;
- блоками редактора Wiki (Tiptap JSON);
- backend-коннектором (BFF/Orchestrator).

Цель:

- дать фронтенду, бэкенду и AI-интеграции единый источник правил для реализации коннектора;
- обеспечить устойчивую работу CRUD и вложений;
- подготовить переход к backend-first оркестрации без поломки UI-потоков.

## 2. Data Mapping Strategy

### 2.1 fieldKey Policy

Текущее API допускает fieldKey=name и fieldKey=id. Для production-контуров принять policy:

- Read path (GET records): fieldKey=id.
- Write path (POST/PATCH records): fieldKey=id.
- Внутренний editor-state хранит только fieldId формата fld....

Почему обязательна миграция с name на id:

1. Имена полей изменяемы пользователями, fieldId стабильны.
2. Локализация и дубликаты имен не ломают id-based payload.
3. Typed mapping на бэкенде становится детерминированным.
4. Снижается риск silent-corruption, когда PATCH уходит в «не то» поле после переименования.

Migration roadmap:

1. В адаптере чтения оставить обратную совместимость с name только для legacy-view.
2. В payload генераторе фронтенда и бэкенда принудительно проставлять fieldKey=id.
3. Валидация входящих команд: reject, если пришли ключи без префикса fld для полей таблицы.
4. Логировать все случаи name-mode как deprecated.

### 2.2 Canonical Record Model

Единая внутренняя структура для фронтенда и бэкенда:

    {
      "recordId": "rec123",
      "fields": {
        "fldTitle": "Подготовить демо",
        "fldOwner": ["u_11", "u_25"],
        "fldStatus": ["opt_todo"],
        "fldEstimate": 8,
        "fldBlocked": false
      },
      "updatedAt": 1712817360
    }

### 2.3 Type Mapping Matrix (MWS -> Wiki UI)

| MWS Field Type | API Value Shape | Wiki Render Strategy | Wiki Edit Strategy | Notes |
|---|---|---|---|---|
| SingleText / Text | string | plain text cell | inline text input | trim + max length guard |
| Number / Currency / Percent | number | right-aligned numeric | numeric editor | locale-aware formatting in UI only |
| Checkbox | boolean | toggle chip | click toggle | optimistic update + rollback |
| SingleSelect | string or option id | single colored tag | dropdown select | хранить option id |
| MultiSelect | array | list of tags | multi-select picker | order preserved by UI only |
| Member | array of user ids | avatar group + tooltip names | people picker | fallback initials if profile missing |
| DateTime | iso string or timestamp | localized date chip | date-time picker | timezone normalization on backend |
| URL / Email / Phone | string | clickable formatted text | validated text input | strict validator before PATCH |
| Attachment | array of file refs/tokens | preview cards + file icon | drag and drop upload | upload first, then PATCH field |
| Formula / Lookups | computed, read-only | muted computed value | no direct edit | ignore in POST/PATCH except explicit override APIs |

Canonical UI interpretation:

- Member преобразуется в avatar group внутри ячейки и в expanded popover.
- MultiSelect и SingleSelect рендерятся тегами с цветом опции.
- Attachment рендерится как список файлов с preview, размером и статусом загрузки.

## 3. Table Embedding Logic

### 3.1 Tiptap Node Contract for MWS Table Embed

Минимальный набор атрибутов embed-блока:

    {
      "type": "mwsTableEmbed",
      "attrs": {
        "spaceId": "spcA1B2C3",
        "nodeId": "nod789",
        "datasheetId": "dst9X8Y7",
        "viewId": "viw123",
        "selectedFieldIds": ["fldTitle", "fldOwner", "fldStatus"],
        "displayMode": "table",
        "allowInlineEdit": true,
        "pageSize": 20,
        "filterByFormula": null,
        "syncState": "idle",
        "lastResolvedAt": "2026-04-11T10:15:12.000Z"
      }
    }

### 3.2 Existing Table Import Flow

1. Пользователь выбирает Вставить таблицу в slash-menu.
2. Фронтенд/бэкенд резолвит space -> node -> datasheet -> views -> fields.
3. В документ вставляется embed node с attrs, без полного набора строк.
4. Компонент embed инициирует lazy-load записей через GET records.
5. После получения данных placeholder заменяется таблицей.

### 3.3 Lazy Loading Pattern

Stage A: instant placeholder

    {
      "state": "loading",
      "rows": [],
      "skeleton": true
    }

Stage B: records fetched

    {
      "state": "ready",
      "rows": [
        { "recordId": "rec1", "fields": { "fldTitle": "Task 1" } }
      ],
      "pageNum": 1,
      "pageSize": 20,
      "total": 153
    }

Stage C: partial refetch

- при scroll/pagination запрашиваются только нужные страницы;
- при смене viewId выполняется invalidate + fresh GET.

Error fallback:

- сохранить embed-блок в документе;
- показать retry action;
- не удалять узел из Tiptap при временных сетевых ошибках.

## 4. Live Sync and Atomic Operations

### 4.1 Cell Update to PATCH Pipeline

Событие onUpdate в таблице должно идти по цепочке:

1. UI фиксирует изменение ячейки и формирует patch-intent.
2. Локально обновляет ячейку optimistically.
3. Отправляет PATCH /records с recordId и fields по fieldKey=id.
4. На успехе применяет server echo и снимает pending-state.
5. На ошибке откатывает optimistic update и показывает inline error.

PATCH payload (single row):

    {
      "fieldKey": "id",
      "records": [
        {
          "recordId": "rec123",
          "fields": {
            "fldStatus": ["opt_in_progress"],
            "fldOwner": ["u_11"]
          }
        }
      ]
    }

### 4.2 Atomic Multi-cell Updates

Если пользователь изменил несколько ячеек одной строки в коротком интервале:

- агрегировать изменения в один PATCH пакет;
- использовать debounce window 150-300ms;
- отправлять один records[] элемент на запись.

Если нужно обновить несколько строк одной операцией:

- использовать один PATCH с несколькими элементами records[];
- сохранять idempotency key на backend для повторов при retry.

### 4.3 Delete Handling Policy

DELETE /records удаляет строки таблицы, но не embed-блок в документе.

Правило:

- удаление строк влияет только на data-layer таблицы;
- блок mwsTableEmbed живет как контейнер представления.

Когда удалять весь блок:

- только по явному действию пользователя Удалить блок;
- или если datasheet удален upstream и подтверждено 404 в течение configurable TTL.

DELETE example:

    DELETE /records?recordIds=rec123,rec124

Post-delete UI behavior:

- удалить строки из локального grid;
- выполнить мягкий refetch текущей страницы;
- показать toast с количеством удаленных записей.

## 5. AI Tooling Definitions

### 5.1 Tool Contract Principles

- Все AI-инструменты вызываются через backend.
- AI возвращает только структурированные аргументы.
- Backend валидирует payload по JSON Schema перед вызовом MWS API.

### 5.2 Tool Schema: create_records

    {
      "name": "create_records",
      "description": "Create new rows in MWS datasheet",
      "input_schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["datasheetId", "fieldKey", "records"],
        "properties": {
          "datasheetId": { "type": "string", "minLength": 1 },
          "fieldKey": { "type": "string", "enum": ["id"] },
          "records": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["fields"],
              "properties": {
                "fields": {
                  "type": "object",
                  "additionalProperties": true
                }
              },
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false
      }
    }

### 5.3 Tool Schema: patch_records

    {
      "name": "patch_records",
      "description": "Update existing rows in MWS datasheet by recordId",
      "input_schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["datasheetId", "fieldKey", "records"],
        "properties": {
          "datasheetId": { "type": "string", "minLength": 1 },
          "fieldKey": { "type": "string", "enum": ["id"] },
          "records": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["recordId", "fields"],
              "properties": {
                "recordId": { "type": "string", "minLength": 1 },
                "fields": {
                  "type": "object",
                  "additionalProperties": true
                }
              },
              "additionalProperties": false
            }
          }
        },
        "additionalProperties": false
      }
    }

### 5.4 Tool Schema: delete_records

    {
      "name": "delete_records",
      "description": "Delete rows in MWS datasheet by recordIds",
      "input_schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["datasheetId", "recordIds"],
        "properties": {
          "datasheetId": { "type": "string", "minLength": 1 },
          "recordIds": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string", "minLength": 1 }
          }
        },
        "additionalProperties": false
      }
    }

### 5.5 Tool Definition: smart_import

Назначение:

- анализирует контекст страницы;
- находит релевантные таблицы в MWS;
- предлагает вставку embed с оптимальным view и набором полей.

Input schema:

    {
      "name": "smart_import",
      "description": "Find and suggest the best MWS table embed based on wiki page context",
      "input_schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["workspaceId", "pageId", "contextText"],
        "properties": {
          "workspaceId": { "type": "string" },
          "pageId": { "type": "string" },
          "contextText": { "type": "string", "minLength": 20 },
          "hints": {
            "type": "object",
            "properties": {
              "spaceId": { "type": "string" },
              "preferredViewType": { "type": "string" },
              "maxCandidates": { "type": "integer", "minimum": 1, "maximum": 10, "default": 3 }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    }

Output contract for smart_import proposal:

    {
      "candidates": [
        {
          "score": 0.91,
          "spaceId": "spcA1B2C3",
          "nodeId": "nod777",
          "datasheetId": "dst9X8Y7",
          "viewId": "viw123",
          "selectedFieldIds": ["fldTitle", "fldOwner", "fldStatus"],
          "reason": "Совпадение по ключевым сущностям: риски, дедлайны, ответственные"
        }
      ],
      "recommendedAction": {
        "op": "insert_embed",
        "position": "after_selection"
      }
    }

Execution policy:

1. AI только предлагает кандидатов и параметры.
2. Backend проверяет доступы пользователя к space/datasheet.
3. Вставка embed выполняется только после user confirm или policy-based auto-apply.

## 6. Handling Attachments

### 6.1 Drag and Drop Flow

Сценарий:

1. Пользователь перетаскивает файл в ячейку поля Attachment внутри embed.
2. UI переводит ячейку в upload-pending состояние.
3. Backend/adapter отправляет multipart/form-data в MWS attachments endpoint.
4. Получает attachment token/id и метаданные.
5. Выполняет PATCH records для записи attachment в нужное fldAttachment поле.
6. Обновляет ячейку итоговым значением и preview.

Upload request example:

    POST /api/v1/mws/datasheets/{datasheetId}/attachments?recordId={recordId}&fieldId={fieldId}
    Content-Type: multipart/form-data

Upload response example:

    {
      "attachment": {
        "token": "att_token_123",
        "name": "spec.pdf",
        "mimeType": "application/pdf",
        "size": 845231,
        "url": "https://...",
        "preview": null
      }
    }

Follow-up PATCH example:

    {
      "fieldKey": "id",
      "records": [
        {
          "recordId": "rec123",
          "fields": {
            "fldAttachment": [
              { "token": "att_token_123", "name": "spec.pdf" }
            ]
          }
        }
      ]
    }

### 6.2 Reliability Rules for Attachments

1. Ограничить размер и MIME до upload.
2. Проводить антивирус/безопасностную проверку на backend-пути.
3. Поддержать resumable/retry для нестабильных сетей.
4. Не терять запись о pending upload при reconnect.

## 7. Connector Implementation Plan

### 7.1 Frontend Workstream

1. Реализовать mwsTableEmbed node-view с состояниями loading/ready/error.
2. Добавить data adapter для GET/POST/PATCH/DELETE records.
3. Включить строгое формирование payload только по fieldKey=id.
4. Реализовать optimistic cell editing + rollback.
5. Добавить drag-drop upload workflow для Attachment.

### 7.2 Backend Workstream

1. Реализовать typed proxy для records и attachments endpoint.
2. Добавить schema validation для AI tool payload.
3. Реализовать idempotency keys для mutation endpoints.
4. Ввести аудит: кто/когда/каким tool изменил таблицу.
5. Реализовать policy-слой для прав и лимитов.

### 7.3 Shared Integration Workstream

1. Зафиксировать единые DTO для Record, Field, Attachment.
2. Согласовать error taxonomy (validation, auth, upstream, conflict).
3. Добавить e2e тесты: create/update/delete/upload внутри embed.
4. Добавить сценарий smart_import с user confirm.

## 8. Acceptance Criteria

Документ можно считать реализованным в коде, если:

1. Любой embed работает по fieldKey=id без зависимости от имен полей.
2. onUpdate ячейки стабильно транслируется в PATCH и корректно откатывается при ошибке.
3. DELETE удаляет строки, а не блок embed.
4. Drag-drop вложение проходит цепочку upload -> patch -> render preview.
5. smart_import возвращает кандидатов и формирует валидный insert_embed action.
6. Фронтенд и бэкенд используют одну и ту же схему DTO для records и attachments.
