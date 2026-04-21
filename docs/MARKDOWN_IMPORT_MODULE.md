# Markdown Import Module

Модуль импорта Markdown-файлов в WikiLive. Он позволяет загрузить один или несколько `.md` файлов через модалку с drag-and-drop, создать по странице на каждый файл и открыть последнюю успешно импортированную страницу в редакторе.

## Что делает модуль

- принимает batch из Markdown-файлов через переиспользуемую upload-модалку;
- валидирует расширение и размер каждого файла;
- читает содержимое файла на фронтенде;
- преобразует Markdown в ProseMirror JSON;
- создаёт wiki-страницы через `wikiliveApi.createPage(...)`;
- передаёт импортированный документ в существующий collab/editor seed flow;
- открывает последнюю успешно созданную страницу;
- при частичных ошибках не прерывает весь batch и показывает summary по неуспешным файлам.

## Архитектура

```text
WorkspacePage
  └─ useMarkdownImport()
       ├─ AttachmentUploadModal
       │    ├─ multi-select
       │    └─ drag-and-drop
       ├─ validateFile()
       ├─ FileReader.readAsText()
       ├─ parseMarkdown()
       ├─ wikiliveApi.createPage(spaceId, title)
       └─ onPageCreated(pageId, prosemirrorDoc)
            └─ pendingImportContentRef / initialSeedContent
                 └─ PageEditor
```

## Основные файлы

- UI и orchestration: `frontend/src/pages/workspace/ui/workspace-page.tsx`
- Хук импорта: `frontend/src/features/markdown-import/use-markdown-import.ts`
- Парсер Markdown: `frontend/src/features/markdown-import/md-parser.ts`
- Типы импорта: `frontend/src/features/markdown-import/types.ts`
- Переиспользуемая модалка: `frontend/src/features/wiki-tables/ui/attachment-upload-modal.tsx`
- Seed в редактор: `frontend/src/features/page-editor/ui/page-editor.tsx`
- Controller seed logic: `frontend/src/features/page-editor/model/use-page-editor-controller.ts`

## Пользовательский сценарий

1. Пользователь нажимает кнопку `Импортировать Markdown` в сайдбаре workspace.
2. Открывается `AttachmentUploadModal`, настроенная под `.md`.
3. Пользователь может выбрать несколько файлов с диска или перетащить их в dropzone.
4. Хук `useMarkdownImport` валидирует каждый файл:
   - только `.md`;
   - максимум `5 МБ` на файл.
5. Для каждого валидного файла последовательно выполняется:
   - чтение файла через `FileReader`;
   - парсинг в `{ title, prosemirrorDoc }`;
   - создание страницы через `wikiliveApi.createPage(spaceId, pageTitle)`.
6. После завершения batch:
   - если есть хотя бы один успех, открывается последняя успешно созданная страница;
   - её содержимое сидируется в редактор через `initialSeedContent`;
   - если часть файлов не импортировалась, пользователь получает summary ошибок;
   - если не импортировался ни один файл, модалка остаётся открытой.

## Источник названия страницы

Название создаваемой страницы определяется так:

1. `title` из frontmatter, если он есть;
2. имя файла без расширения `.md`, если frontmatter title отсутствует.

Пример frontmatter:

```md
---
title: Project Notes
---
```

## Поддерживаемый Markdown

Текущий парсер ориентирован на быстрый импорт заметок в wiki и поддерживает базовый поднабор синтаксиса:

- заголовки `#`-`######`;
- параграфы;
- маркированные и нумерованные списки;
- fenced code block;
- blockquote;
- callout в стиле `> [!note] Title`;
- ссылки `[text](url)`;
- inline formatting: `bold`, `italic`, `strike`, `code`;
- horizontal rule;
- простое извлечение `title` из YAML frontmatter;
- wikilinks `[[Page]]` и `[[Page|Alias]]` как plain text;
- служебные citation/entity-маркеры ChatGPT exports: `cite` превращается в короткие `[1] [2]`, `entity` — в человекочитаемое имя.

## Ограничения текущей реализации

- импорт выполняется полностью на фронтенде, без отдельного backend-конвертера;
- файлы импортируются последовательно, а не параллельно;
- импорт создаёт новые страницы, но не обновляет уже существующие;
- wikilinks пока не маппятся в `pageLink` ноды и не резолвятся в реальные wiki-ссылки;
- frontmatter используется только для `title`;
- parser intentionally покрывает безопасный MVP-поднабор Markdown, а не полный CommonMark.

## Обработка ошибок

- невалидные файлы не добавляются в batch;
- ошибки чтения файла и ошибки создания страницы собираются в summary;
- при частичном успехе успешные страницы сохраняются, а ошибки показываются пользователю отдельно;
- при полном провале импорт не закрывает модалку, чтобы пользователь мог скорректировать batch.

## Связь с editor/collab flow

Импорт не пишет документ напрямую в backend снапшот. Вместо этого он использует уже существующий путь инициализации редактора:

- `WorkspacePage` сохраняет импортированный `ProseMirror`-документ во временный `pendingImportContentRef`;
- при открытии новой страницы этот документ прокидывается в `PageEditor` как `initialSeedContent`;
- `usePageEditorController` сидирует контент через текущий lifecycle редактора и collaboration flow.

Это важно, потому что импорт не обходит существующую модель автосохранения и совместного редактирования.

## Связь с экспортом

Модуль импорта не использует `document-generator` и не проходит через export pipeline.

- импорт: `File -> Markdown parser -> ProseMirror JSON -> createPage -> editor seed`
- экспорт: `ProseMirror JSON -> document-generator -> PDF/DOCX/MD`

Это два независимых контура, у которых общая точка только в формате ProseMirror JSON.

## Тесты

- `frontend/src/features/markdown-import/md-parser.test.ts`
- `frontend/src/features/markdown-import/use-markdown-import.test.tsx`
- `frontend/src/pages/workspace/ui/workspace-page.markdown-import.test.tsx`

Эти тесты покрывают:

- разбор поддерживаемого Markdown;
- batch import и partial failures;
- wiring между `WorkspacePage`, modal flow и `PageEditor`.
