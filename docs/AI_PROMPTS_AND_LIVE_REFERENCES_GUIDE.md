# AI Prompts, Requests, and Live References Guide

## Purpose

Этот документ описывает, как в WikiLive устроены:

- системные промпты для AI;
- маршрутизация пользовательских запросов;
- работа с документом и таблицами MWS;
- живые переменные для ссылок на ячейки;
- места, где промпты можно усилить, чтобы улучшить качество ответов модели.

Документ написан как рабочая карта для другого ИИ или разработчика, который будет прокачивать prompt engineering без потери контекста продукта.

## 1. High-Level Flow

### 1.1 Основной путь запроса

1. Пользователь вводит текст в UI.
2. Frontend решает, какой сценарий выбрать:
   - продолжение текста;
   - анализ;
   - структурирование;
   - отчет;
   - table workflow.
3. Запрос уходит в backend AI endpoint.
4. Backend собирает system/user messages.
5. Модель возвращает:
   - текст;
   - JSON документ;
   - JSON workflow;
   - tool calls.
6. Результат либо вставляется в документ, либо создается новый документ, либо применяется к таблице.

### 1.2 Основные входные типы

- `pageSnapshot` — снапшот документа в ProseMirror JSON или markdown.
- `tableSnapshot` — снимок таблицы MWS с полями и строками.
- `contextDocuments` — дополнительные документы, которые пользователь добавил в контекст.
- `prompt` / `question` — пользовательский запрос.

## 2. Where Prompts Live

### 2.1 Frontend inline copilot

Файл: [frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx](../frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx)

Здесь есть не только UI, но и пользовательская маршрутизация запросов по intent:

- `isAnalysisPrompt(...)`
- `isStructurePrompt(...)`
- `isReportPrompt(...)`
- `shouldCreateNewReportDocument(...)`

Промпт пользователя может быть подсказкой, а может быть командой. Для inline copilot это важно: кнопки снизу теперь только подставляют текст в поле, а не исполняют действие напрямую.

### 2.2 Backend AI assistant

Файл: [backend/src/ai-tools/ai-assistant.service.ts](../backend/src/ai-tools/ai-assistant.service.ts)

Здесь живут системные промпты для:

- completion / ghost text;
- document generation;
- text transformation;
- table mutation planning;
- table workflow planning.

### 2.3 Backend AI chat for tables

Файл: [backend/src/ai-tools/ai-chat.service.ts](../backend/src/ai-tools/ai-chat.service.ts)

Здесь AI работает как оркестратор таблиц:

- собирает system + user messages;
- запускает tool loop;
- обрабатывает `get_records`, `create_records`, `patch_records`, `add_table_column`;
- решает, нужно ли обновить таблицу после мутаций.

## 3. System Prompts Catalog

### 3.1 Ghost text / completion

Файл: [backend/src/ai-tools/ai-assistant.service.ts](../backend/src/ai-tools/ai-assistant.service.ts)

System prompt:

```text
You are a ghost-text assistant for a wiki editor.
Continue the current text with a short, natural continuation.
Do not explain your reasoning.
Keep the output brief, relevant, and ready to insert directly into the editor.
```

Назначение:

- автодополнение текста;
- короткое продолжение текущего фрагмента;
- без объяснений и без лишнего контекста.

### 3.2 Document generation

System prompt:

```text
You generate ProseMirror JSON for a Tiptap document.
Return only valid JSON.
The document must have type "doc" and a content array.
Use only paragraph, heading, bulletList, orderedList, listItem, blockquote, and text nodes unless the context requires another common ProseMirror node.
If user asks to reference a live MWS cell, insert token [Ref:tableId:rowId:colId] directly in text, without extra markup.
```

Назначение:

- генерация документа в формате ProseMirror JSON;
- использование live references в тексте без дополнительной разметки.

### 3.3 Text transformation

Базовые transformation prompts:

- `professional`
- `shorten`
- `expand`
- `fix_grammar`

Стилевые prompts:

- `standard`
- `business`
- `military`
- `medieval`
- `church`
- `fix`
- `expand`

Дополнительные общие правила:

```text
Always answer in the same language as the input text. If the input text is Russian, the output must be only in Russian.
Return only the transformed selected fragment text, without comments or explanations.
Do not output labels or metadata like "Page title", "Transformation", "Context snapshot", "Wiki", "Исходный текст", or "Переработанный вариант".
Do not add markdown tables, separators, or horizontal rules unless they are already present in the selected fragment.
Preserve the selected fragment structure: keep paragraph boundaries and line breaks semantically close to the input.
```

Что важно для улучшения:

- prompt уже хорошо ограничивает формат;
- слабое место — слишком общий стиль для бизнес/standard;
- можно добавить более явные шаблоны тона, плотности и длины.

### 3.4 Table mutation planning

Файл: [backend/src/ai-tools/ai-assistant.service.ts](../backend/src/ai-tools/ai-assistant.service.ts)

System prompt для `planTableMutation`:

```text
You convert user prompt to a strictly valid JSON command for MWS tools.
Output only JSON object with keys: toolName, args, summary.
Allowed toolName values: create_records, add_table_column.
For create_records args must include datasheetId, fieldKey:"id", records:[{fields:{...}}].
For add_table_column args must include spaceId, datasheetId, name, type, optional property.
If tableSnapshot has missing or empty records, assume caller will fetch data with get_records before execution and still produce a valid command.
Never ask clarifying questions. Use table snapshot and user prompt directly.
```

Назначение:

- перевести текст пользователя в JSON-команду;
- не задавать уточняющие вопросы;
- не ломать pipeline таблиц.

### 3.5 Table workflow planning

Файл: [backend/src/ai-tools/ai-assistant.service.ts](../backend/src/ai-tools/ai-assistant.service.ts)

System prompt для `planTableWorkflow`:

```text
You are a table workflow planner for WikiLive.
Analyze the current table context and the user prompt.
Return only JSON with keys: summary, commands.
commands must be an array of workflow commands.
Allowed command types: ADD_COLUMN, ADD_ROW, UPDATE_RECORDS.
For ADD_COLUMN output {"type":"ADD_COLUMN","column":{"name":"...","type":"...","property":{...}?}}.
For ADD_ROW output {"type":"ADD_ROW","rows":[{"fields":{...}}]}.
For UPDATE_RECORDS output {"type":"UPDATE_RECORDS","records":[{"recordId":"...","fields":{...}}]}.
When user asks to fill or enrich existing rows, prefer UPDATE_RECORDS and do not create duplicate rows.
If user specifies row indexes or ranges (for example 1-6), treat it as updating existing rows via UPDATE_RECORDS.
Do not use ADD_ROW for tasks that target existing rows.
Prefer creating columns first when existing columns do not match the task.
If the snapshot is empty or insufficient, infer the needed schema from the prompt and still propose valid commands.
Use fieldKey id compatible row values.
Never ask clarifying questions.
```

Очень важное правило:

- для существующих строк `UPDATE_RECORDS` важнее, чем `ADD_ROW`;
- если задача по рядам, не дублировать строки;
- если snapshot пустой, можно все равно предлагать валидный план.

## 4. AI Chat: how requests are built

### 4.1 Page text chat

Файл: [backend/src/ai-tools/ai-chat.service.ts](../backend/src/ai-tools/ai-chat.service.ts)

System prompt сейчас такой:

```text
You are a powerful data administrator for WikiLive tables.
Your goal is to change the real MWS table data through tools, not by describing JSON to the user.
If the user asks to fill fields, add data, update rows, or change table structure, use tools silently on the backend.
For any table mutation task, call get_records first if you need current table data.
After reading records, use patch_records, create_records, or add_table_column as needed.
If the question is about records, rows, or table content, use get_records.
If the user asks to add a new table column, use add_table_column.
If the user asks to fill empty fields, patch existing records instead of answering with code or JSON.
When tool arguments require a datasheetId, use the exact Target MWS datasheetId from the context.
Only answer the user after the table has already been changed by tools.
Keep the answer concise, factual, and grounded in the provided context or tool output.
```

После этого backend:

- делает tool loop до 3 раундов;
- записывает tool_calls в `conversation`;
- вызывает инструменты через `AiToolRegistryService`;
- если надо, повторно запрашивает модель с результатами tool output.

### 4.2 Inline copilot request routing

Файл: [frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx](../frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx)

Сейчас frontend сам определяет intent по тексту:

- `isAnalysisPrompt(...)`
- `isStructurePrompt(...)`
- `isReportPrompt(...)`
- `shouldCreateNewReportDocument(...)`

Это значит:

- если пользователь пишет про структуру, идет структурирование;
- если пишет про анализ, идет анализ;
- если пишет про отчет, выбирается путь отчета;
- если явно просит новый документ, создается новый файл;
- если не просит новый документ, отчет идет в текущий документ.

## 5. Live Variables and References

### 5.1 Token format

Живая переменная в текущей реализации выглядит так:

```text
[Ref:tableId:rowId:colId]
```

В коде она парсится как токен для ссылки на конкретную ячейку MWS.

### 5.2 Parser / insertion layer

Файл: [frontend/src/features/page-editor/model/live-reference-parser.ts](../frontend/src/features/page-editor/model/live-reference-parser.ts)

Основные функции:

- `hasLiveReferenceToken(text)`
- `parseInlineContentWithLiveReferences(text, options)`
- `parseMarkdownReportWithLiveReferences(text, options)`
- `insertAiTextWithLiveReferences(editor, text, options)`

Поведение:

- токены `[Ref:...]` превращаются в inline liveReference node;
- markdown-отчеты разбираются в headings / paragraphs / inline content;
- если живых токенов нет и текст не похож на markdown, вставляется обычный plain text;
- если текст похож на markdown, но без live refs, он вставляется как markdown-compatible content.

### 5.3 Where live refs are expected

Живые переменные особенно важны, когда AI:

- пишет отчет по таблице;
- упоминает конкретную ячейку;
- выдает метрику, статус, дату, значение, которое должно обновляться автоматически;
- генерирует текст, который потом будет вставлен в документ.

### 5.4 Prompt rule for live refs

Рекомендуемое правило для AI-промптов:

- если речь про таблицу, любую ссылку на конкретную ячейку надо оформлять как живую переменную;
- не писать в отчете “значение из строки 5” без ссылочного токена;
- если упоминается статус, дата, сумма или KPI, лучше вставлять live ref.

## 6. Documents vs Tables: how the model should think

### 6.1 Документ

Документ — это markdown / ProseMirror контекст страницы.

Передается через:

- `pageSnapshot.markdown`
- `getEditorMarkdown(editor)`
- `renderContextSnapshot(...)`

Используется для:

- анализа текста;
- продолжения текста;
- генерации новых фрагментов;
- структурирования;
- отчетов по документу.

### 6.2 Таблица

Таблица — это MWS context с:

- `datasheetId`
- `viewId`
- `fields`
- `records`
- `total`

Используется для:

- анализа таблицы;
- workflow planning;
- заполнения строк;
- создания колонок;
- отчетов по таблице.

### 6.3 Mixed context

Inline copilot умеет работать в смешанном режиме:

- документ + таблицы на странице;
- только документ;
- только таблица;
- все таблицы на странице.

Важно для prompt engineering:

- если задача аналитическая, лучше явно писать, про что именно она: документ, таблица или все вместе;
- если нужна вставка в текущий документ, это должно быть явно в команде или в UI intent.

## 7. Report Routing Logic in Inline Copilot

### 7.1 Current behavior

Inline copilot уже различает:

- анализ;
- структурирование;
- отчет;
- обычный запрос.

### 7.2 Report destination

Логика выбора отчета сейчас такая:

- если в prompt есть слова про новый / отдельный / новый документ, отчет создается в новом документе;
- иначе отчет вставляется в текущий документ;
- если активный контекст — таблица, вставка идет после таблицы, а не в произвольное место.

### 7.3 What to improve in prompts

Чтобы модель работала стабильнее, в prompt-слое полезно добавить явные маркеры:

- `Сделай отчет и вставь его в текущий документ после таблицы`;
- `Сделай отчет в новый документ`;
- `Сделай короткий отчет по текущей странице`;
- `Сделай отчет по таблице и сохрани его отдельно`.

Это снизит двусмысленность между:

- “отчет как результат текста”;
- “отчет как новый файл”;
- “отчет как вставка в документ”.

## 8. What the next AI should improve

Ниже — самые полезные точки для усиления prompts.

### 8.1 Better intent separation

Сейчас полезно явно разделять:

- analysis intent;
- structure intent;
- report intent;
- transformation intent;
- table mutation intent.

Для улучшения:

- добавить более жесткие классификаторы;
- сделать единый router prompt;
- выносить destination decision отдельно от content generation.

### 8.2 Better report prompting

Для отчетов хорошо бы уточнить:

- нужен ли новый документ;
- нужна ли вставка после таблицы;
- нужно ли сохранить live references;
- какой тон нужен: краткий, аналитический, executive summary, подробный.

### 8.3 Better structure prompting

Для структурирования стоит усилить:

- что считать заголовком;
- насколько глубоко дробить документ;
- как вести себя, если часть документа уже структурирована;
- когда не трогать уже существующие заголовки.

### 8.4 Better table prompts

Для таблиц полезно добавить:

- explicit row strategy: create vs update;
- если user mentions ranges, трактовать как update rows;
- если snapshot пустой, что делать;
- как формировать summary для UI;
- когда запрашивать get_records first.

### 8.5 Better live reference guidance

Для документов с таблицами стоит прямо в промпте указывать:

- если цитируешь число, статус, дату или KPI, используй live ref;
- если есть таблица, не выдумывай статические значения, если их можно привязать к ячейке;
- для отчета лучше сохранять ссылки на первоисточник.

## 9. Files worth reading next

- [frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx](../frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx)
- [frontend/src/features/page-editor/model/live-reference-parser.ts](../frontend/src/features/page-editor/model/live-reference-parser.ts)
- [backend/src/ai-tools/ai-assistant.service.ts](../backend/src/ai-tools/ai-assistant.service.ts)
- [backend/src/ai-tools/ai-chat.service.ts](../backend/src/ai-tools/ai-chat.service.ts)
- [docs/MWS_WIKI_DATA_MAPPING_GUIDE.md](./MWS_WIKI_DATA_MAPPING_GUIDE.md)
- [docs/MWS_TABLES_CRUD_SYNC_SHORT.md](./MWS_TABLES_CRUD_SYNC_SHORT.md)

## 10. Short prompt audit checklist

Перед улучшением промпта проверь:

1. Понятно ли, что является входом: документ, таблица, или оба?
2. Явно ли указан desired output: text, markdown, ProseMirror JSON, workflow JSON?
3. Есть ли правило на новый документ vs вставку в текущий?
4. Сохранится ли live reference там, где нужна живая ячейка?
5. Нужно ли вызывать tool / делать update row / create row / create column?
6. Есть ли риск, что модель начнет отвечать общими словами вместо действия?

Если ответ на любой вопрос “нет”, prompt стоит усилить.
