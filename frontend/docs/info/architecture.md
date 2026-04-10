# Архитектура frontend-приложения

## Цель

Собрать frontend как модульное React + TypeScript приложение, где редактор является ядром продукта, а React используется как слой отображения и композиции.

## Технологический контур

- React + TypeScript как базовый UI-слой.
- Vite как сборщик и dev server.
- Tailwind CSS как основной utility-first styling layer.
- CSS используется только для глобальных переменных, reset-стилей и редких случаев, где Tailwind неудобен.
- Tiptap как редакторное ядро.
- Yjs как слой коллаборации.
- Local cache + backend sync как слой сохранения.
- ESLint и Prettier как обязательная база качества кода.

## Принципы организации

- Feature-first: код группируется по пользовательским сценариям и доменным областям.
- Editor core отделён от React: схема документа, команды и расширения не смешиваются с UI.
- Один источник истины для документа: документ живёт в editor model или Yjs doc.
- Адаптерный подход: коллаборация, сохранение и UI подключаются как отдельные слои.
- Простые границы модулей: каждый модуль имеет собственный публичный API через `index.ts`.

## Слои

### `app/`

Точка входа приложения.

- `providers/` — React providers, theme, query client, editor provider.
- `router/` — маршруты, layout composition и route guards.
- `store/` — глобальное состояние приложения (если нужно).
- `App.tsx` — сборка приложения из провайдеров и роутера.

### `shared/`

Переиспользуемая база.

- `ui/` — кнопки, поля, панели, модалки, общие визуальные элементы.
- `lib/` — утилиты, хелперы, форматтеры, низкоуровневые функции.
- `api/` — базовый HTTP-клиент, общие запросы и транспорт.
- `types/` — общие типы и DTO, не привязанные к одной фиче.
- `styles/` — глобальные стили, токены, базовые переменные и layout primitives.

Tailwind utilities используются напрямую в компонентах для layout, spacing, sizing и composition.
CSS в `shared/styles/` остается для global tokens, reset-слоёв, `@font-face` и редких исключений, где утилиты Tailwind слишком шумные.

### `entities/`

Предметные сущности и доменная логика.

- `page/` — модель страницы, заголовок, контент, метаданные.
- `user/` — пользовательская сущность и права.
- `table/` — модель таблицы как доменный объект.
- `link/` — связи между страницами и backlinks.

### `features/`

Законченные пользовательские действия.

- `page-editor/` — редактор страницы: shell, toolbar, slash-команды, editor state.
- `slash-menu/` — переиспользуемый dropdown/palette для команд.
- `insert-table/` — вставка таблицы.
- `backlinks/` — обратные ссылки.
- `autosave/` — debounce → локальный кеш → backend sync.
- `collaboration/` — Yjs + websocket provider.
- `comments/`, `ai-assist/` и т.д.

### `pages/`

Экранные компоненты и маршруты.

- `workspace/` — рабочее пространство редактора.

## Editor core

Ядро редактора должно быть модулем со строгим API и жить отдельно от React.

### Состав

- `schema` — структура документа и типы блоков.
- `extensions` — Tiptap / ProseMirror extensions.
- `commands` — операции над документом.
- `plugins` — индексация, validation, collaboration.

### Адаптеры

- `collab adapter` — Yjs + transport.
- `persistence adapter` — local cache, autosave, backend sync.
- `UI adapter` — React toolbar, slash-menu, side panels.

Практически это означает, что на текущем этапе editor core живет внутри `features/page-editor`, а не в отдельном пакете. Выносить его дальше стоит только когда появится повторное использование между страницами или отдельная команда для editor platform layer.

## Поток данных (минимальный)

1. Пользователь меняет документ в editor core.
2. Изменение попадает в Yjs doc или локальную модель.
3. Autosave — локальный кеш.
4. Persistence adapter — синхронизация с backend.
5. UI подписывается на состояние и отображает документ.

## Рекомендации

- Не дробите editor core раньше времени: держите его в `features/page-editor`, пока нет повторного использования.
- Используйте semantic tokens и shared UI primitives.
- Начинайте с минимального offline-first сценария и расширяйте адаптерами.
