# Парсеры Markdown-таблиц и как работает система

## Что это за система

В проекте есть два уровня работы с таблицами в markdown:

1. Уровень вставки в редактор (Tiptap):
   - markdown таблица превращается в структурированные ноды table/tableRow/tableCell.
   - при вставке сохраняется возможность подставлять live-reference токены.

2. Уровень отображения AI-ответа:
   - ответ может быть показан как визуальная таблица в UI (до вставки в документ).
   - если таблица пришла обрезанной, система запрашивает продолжение и склеивает результат.

## Где находятся ключевые части

1. Парсер и вставка в документ:
   - frontend/src/features/page-editor/model/live-reference-parser.ts

2. Обработка AI-ответа и восстановление незавершенных таблиц:
   - frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx

3. Отрисовка markdown-таблиц в ответах AI:
   - frontend/src/features/plugins/ai-assistant/model/ai-output-renderer.tsx

4. Поддержка таблиц в Tiptap-редакторе:
   - frontend/src/features/page-editor/model/editor-config.ts

5. Стили таблиц в редакторе:
   - frontend/src/shared/styles/global.css

## Парсеры таблиц: как это работает

### 1) Детектор markdown-контента

В парсере используется проверка looksLikeMarkdown(...), которая определяет, что текст похож на markdown, включая признаки таблицы:

- строка с вертикальными разделителями, например | A | B |
- строка-разделитель заголовка, например |---|---|

Если markdown не распознан и нет live reference токенов, текст вставляется как обычная строка.

### 2) Низкоуровневый парсинг таблицы

Внутри frontend/src/features/page-editor/model/live-reference-parser.ts используется набор функций:

1. splitMarkdownTableRow(line)
   - разбивает markdown-строку таблицы на ячейки.
   - нормализует лидирующий и завершающий символ |.

2. isMarkdownTableSeparator(line)
   - определяет, является ли строка строкой-разделителем заголовка.
   - поддерживает варианты с выравниванием типа :---, ---:, :---:.

3. parseMarkdownTableBlock(lines, startIndex, options)
   - собирает полный table-блок из строк:
     - первая строка: заголовок
     - вторая строка: разделитель
     - последующие строки: body-строки
   - формирует ноды Tiptap:
     - table
     - tableRow
     - tableHeader/tableCell

4. createTableCellNode(...)
   - создает ячейку и запускает inline-парсинг, чтобы внутри ячейки корректно обработать live-reference и formula токены.

### 3) Комбинированный markdown + live-reference парсинг

parseMarkdownWithLiveReferences(...) использует markdown parser из Tiptap storage (tiptap-markdown), затем рекурсивно маппит текстовые ноды, заменяя токены:

- [Ref:tableId:rowId:colId] -> liveReference node
- [Formula: ... ] -> liveFormula node

Если markdown parser не вернул блоки, есть fallback-путь через parseMarkdownReportWithLiveReferences(...), где таблицы, заголовки и параграфы разбираются вручную.

### 4) Вставка в документ

insertAiTextWithLiveReferences(editor, text, options):

1. проверяет, есть ли markdown и/или live token;
2. если markdown есть:
   - пытается распарсить блоки;
   - вставляет их через insertContentAt в текущий selection;
3. если markdown нет, но есть live token:
   - вставляет inline-ноды;
4. иначе вставляет plain text.

## Как система работает в AI-сценариях

## Сценарий A: AI выдал нормальную markdown-таблицу

1. AI вернул текст с таблицей.
2. Текст передается в parse/insert pipeline.
3. Таблица становится структурой table/tableRow/tableCell в редакторе.
4. Применяются обычные стили Tiptap-таблицы.

## Сценарий B: AI оборвал таблицу на середине

В frontend/src/features/plugins/ai-assistant/ui/ai-inline-copilot.tsx есть отдельная логика восстановления:

1. fetchAiAnswerWithTableRecovery(...) получает ответ.
2. Если ответ содержит таблицу и она выглядит незавершенной:
   - формируется специальный continuation prompt;
   - отправляется дополнительный запрос;
   - извлекается только табличный continuation chunk;
   - чанки склеиваются в единый markdown.
3. После склейки итог снова отправляется в обычный parse/insert путь.

Это снижает вероятность пустых ячеек и сломанной структуры таблицы в документе.

## Сценарий C: Предпросмотр в UI до вставки

В frontend/src/features/plugins/ai-assistant/model/ai-output-renderer.tsx таблицы из markdown распознаются и рендерятся как HTML table в интерфейсе чата/копилота. Это нужно для визуальной проверки до вставки в редактор.

## Что обеспечивает поддержку таблиц в редакторе

В frontend/src/features/page-editor/model/editor-config.ts подключены расширения:

- Table
- TableRow
- TableHeader
- TableCell

и включен Table.configure({ resizable: true }).

Без этих расширений markdown-table не сможет стать полноценной таблицей в документе.

## Стили таблиц

В frontend/src/shared/styles/global.css задаются базовые стили:

- контейнер .tiptap .tableWrapper с horizontal scroll;
- border-collapse;
- границы, паддинги и фон для th/td;
- минимальная ширина таблицы.

Это делает таблицы читаемыми и стабильными на разных размерах экрана.

## Итого

Система построена по принципу “получили markdown -> нормализовали -> распарсили -> вставили как ноды”, с дополнительной защитой от обрезанных AI-таблиц. За счет этого:

1. таблицы не остаются сырым текстом;
2. live references работают и внутри таблиц;
3. UI показывает таблицу до вставки;
4. есть recovery-механизм для незавершенных ответов.
