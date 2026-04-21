# Obsidian Plugin Import

Этот модуль добавляет отдельный import-контур для Obsidian.

## Что добавлено

- backend-модуль: `backend/src/obsidian/`
- community plugin scaffold: `obsidian-plugin/wikilive-importer/`

## Backend endpoints

- `POST /api/v1/obsidian/spaces`
  - принимает `apiKey`
  - возвращает список пространств MWS/WikiLive, доступных этому ключу

- `POST /api/v1/obsidian/import/preview`
  - принимает `apiKey`, `spaceId`, `mode`, `folderStrategy`, `files[]`
  - возвращает план импорта и конфликты по совпадающим страницам

- `POST /api/v1/obsidian/import`
  - принимает тот же batch и `defaultConflictResolution`
  - запускает импорт в WikiLive

## Import flow

1. Obsidian plugin читает `.md` файлы из vault через `Vault API`.
2. Плагин отправляет batch файлов в `preview`.
3. Если есть конфликты, пользователь выбирает действие:
   - `skip`
   - `replace`
   - `create_copy`
4. Плагин вызывает финальный `import`.
5. Backend:
   - валидирует API key
   - загружает доступные пространства
   - парсит Markdown в ProseMirror
   - кодирует его в Yjs snapshot
   - создает или обновляет страницы
   - при `folderStrategy=preserve` старается воссоздать структуру папок

## Ограничения текущего MVP

- импортируются только Markdown-файлы
- картинки и вложения пока игнорируются
- `[[wikilinks]]` пока импортируются как plain text, как и в текущем web Markdown import
- конфликт определяется по совпадению `title + target folder`

## Путь разработки плагина

```bash
cd obsidian-plugin/wikilive-importer
npm install
npm run dev
```

Далее папку плагина нужно положить в:

```text
<vault>/.obsidian/plugins/wikilive-importer
```
