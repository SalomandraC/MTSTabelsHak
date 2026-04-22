# WikiLive

WikiLive - совместный wiki-модуль для хакатон-кейса "WikiLive: живые таблицы внутри текста".

Основная идея продукта: объединить обычные wiki-страницы и "живые" таблицы MWS Tables в одном рабочем пространстве, где текст, данные, ссылки между страницами и совместное редактирование работают как единый сценарий.

## Что реализовано

### Обязательные функции (MVP)

- Интеграция с MWS Tables API через backend/BFF слой.
- Создание и редактирование wiki-страниц рядом с сущностями MWS Tables.
- Встраивание существующей таблицы MWS Tables в тело страницы как отдельный live-блок.
- Автосохранение во время редактирования + восстановление из локального черновика.
- Slash-menu для быстрой вставки блоков.
- Клавиатурная навигация и горячие клавиши для редактора/slash-menu.
- Ссылки между страницами + обратные ссылки (backlinks).
- Совместное редактирование документа в проверяемом real-time сценарии.
- Редактор на open-source стеке с permissive лицензированием (Tiptap/Hocuspocus).

### Дополнительные функции

- "Живой" table embed с синхронизацией с MWS Tables (не статичный снимок).
- Комментарии к документу.
- История правок/версии + локальные черновики.
- AI-панель, inline-подсказки и генерация блоков через MWS GPT API.
- Граф связей страниц.
- Каталог плагинов и расширяемость по entitlement-модели.
- Встраивание внешних элементов: iframe, Canvas, Mermaid.
- Контекстный поиск по векторному индексу.
- Вопросы по документу с помощью LLM.
- Шаблоны страниц и маркетплейс шаблонов.
- Live-переменные и формулы из таблиц в тексте.
- MWS-first проводник (структура как в MWS Tables).
- Разграничение доступов к страницам.
- Экспорт документов в PDF/DOCX/MD.
- Автоструктурирование по заголовкам и paged-представление документа.
- Выбор рабочего пространства пользователя.
- Ориентация на предоставленный Design Kit при проектировании интерфейса.

## Obsidian plugin (импорт из vault)

В репозитории есть отдельный community plugin scaffold для Obsidian:

- Путь: `obsidian-plugin/wikilive-importer/`
- Назначение: импорт `.md`-заметок из Obsidian vault в WikiLive через backend API.
- Документация по потоку импорта: [docs/OBSIDIAN_PLUGIN_IMPORT.md](docs/OBSIDIAN_PLUGIN_IMPORT.md)

Что умеет плагин сейчас:

- Конфигурация `apiKey` + `base_url`.
- Загрузка доступных пространств (spaces).
- Режимы импорта: текущая заметка, список файлов, папка, папка рекурсивно, весь vault.
- Preview перед импортом с подсветкой конфликтов.
- Поддержка локальных изображений внутри markdown (через `data:` URL в процессе импорта).

Быстрый запуск разработки плагина:

```bash
cd obsidian-plugin/wikilive-importer
npm install
npm run dev
```

Затем папку плагина нужно положить в:

```text
<vault>/.obsidian/plugins/wikilive-importer
```

После этого включить Community Plugins в Obsidian и активировать `WikiLive Importer`.

## Живые графики (Live Charts)

В редакторе поддержан отдельный live-chart блок, который строится по данным встроенных таблиц MWS и обновляется при изменениях данных.

Что уже реализовано:

- Отдельный node/block в документе для графика.
- Типы графиков: `bar`, `line`, `pie`.
- Выбор таблицы (`datasheet`), поля для оси X и поля метрики для оси Y.
- Обновление графика при обновлении snapshot данных таблицы.
- Вставка как вручную (через UI), так и из AI-сценария (`insert_live_chart`).

## Ограничения текущего MVP (что пока не поддерживается)

### Obsidian import

- Импортируется только Markdown-контент и локальные изображения, не-изображения вложений пока не переносятся.
- `[[wikilinks]]` из Obsidian пока импортируются как plain text.
- Конфликты определяются по совпадению `title + target folder` (без более сложной дедупликации).

### Live charts

- В текущем UI-конструкторе выбирается одна метрика по Y за раз (мульти-ось/мульти-метрики как отдельный сценарий пока не выведены в UI).
- Нет расширенной аналитики (агрегации, фильтры, группировки, вычисляемые серии) на уровне визуального конструктора.
- Нет отдельного экспорта графика как изображения/отчета из chart-блока.
- Нет продвинутых аналитических типов (`scatter`, `heatmap`, `candlestick` и т.д.) - только `bar/line/pie`.

## Стек проекта

### Frontend

- Ядро UI: React 18 + TypeScript.
- Сборка и dev-сервер: Vite 8.
- Стилизация: Tailwind CSS 4.
- Редактор: Tiptap 3 (кастомные extension-и для slash-menu, table/embed, шаблонов, комментариев, ссылок, блоков).
- Совместное редактирование: Yjs + Hocuspocus provider.
- Визуализация связей и графов: Cytoscape + D3.
- Диаграммы и rich embeds: Mermaid + iframe/canvas блоки.
- Тестирование: Vitest + Testing Library.

### Backend

- Framework/API слой: NestJS 11 (REST + BFF для MWS Tables + bootstrap collaboration).
- ORM: Prisma.
- Основная база данных: PostgreSQL.
- Кеш и инфраструктурный брокер: Redis.
- Очереди и фоновые задачи: BullMQ (индексация, сервисные процессы).
- Совместное редактирование документа: Hocuspocus server (Yjs transport/session flow).
- Валидация DTO: class-validator + class-transformer.
- HTTP-интеграции: @nestjs/axios + form-data.
- Логирование: pino + nestjs-pino.
- API-документация: Swagger (@nestjs/swagger).
- Тестирование: Jest (unit/integration).

### AI и поиск

- Отдельный сервис semantic search: Python FastAPI (`services/context-engine`).
- Векторное хранилище: Qdrant (локально-персистентный режим).
- Retrieval pipeline: индексирование текстовых снапшотов страниц + поиск по пространству.
- LLM-интеграция: MWS GPT API через backend (чат, генерация, трансформации, tool execution).

### Document export

- Отдельный сервис: Node.js + TypeScript (`document-generator`).
- HTTP слой: Express.
- Генерация форматов: PDF (через Puppeteer), DOCX (через docx), Markdown.
- Шаблоны: Handlebars.

### Инфраструктура и запуск

- Контейнеризация и оркестрация локального стенда: Docker + Docker Compose.
- Основные сервисы окружения: Postgres, Redis, backend API, collab endpoint, frontend, context-engine, document-generator.

## Архитектура

Репозиторий состоит из нескольких сервисов:

- `frontend/` - клиентское приложение (редактор, проводник, backlinks, embeds, AI UI).
- `backend/` - основной API/BFF, бизнес-логика страниц, ссылок, прав доступа, плагинов, MWS интеграции и collaboration bootstrap.
- `services/context-engine/` - semantic search и AI retrieval по снапшотам документов.
- `document-generator/` - сервис экспорта документов.
- `docs/` - OpenAPI, архитектурные заметки, схемы и дополнительные материалы.

Поток данных (укрупненно):

1. Пользователь редактирует страницу в Tiptap.
2. Изменения синхронизируются между клиентами через Yjs/Hocuspocus.
3. Backend сохраняет состояние документа (snapshot/update/checkpoint), ссылки и метаданные.
4. Фоновые задачи индексируют контент в context-engine.
5. Встроенные таблицы читаются/обновляются через backend, который обращается к MWS Tables API.

Компонентная диаграмма: [docs/component-diagram.puml](docs/component-diagram.puml)

## Быстрый запуск (рекомендуется)

Требования:

- Docker + Docker Compose.

Запуск всей системы одной командой:

```bash
docker compose up --build
```

Поднимутся сервисы:

- frontend: http://localhost:5173
- backend API: http://localhost:8080
- swagger: http://localhost:8080/docs
- realtime (collab): порт 8081
- context-engine: http://localhost:8090
- document-generator: http://localhost:3200
- postgres: 5432
- redis: 6379

## Демо-ключи MWS Tables

Для демонстрации интеграции с MWS Tables можно войти в приложение одним из подготовленных API-ключей:

```text
uskIRDS4OJAAa1kBVt9phPH
uskYhPEOvGY4XlXWZVF2ld7
uskHeGbxZwSmFCERZOEBpnT
```

После входа обратите внимание на переключатель пространств слева вверху. У одного ключа может быть доступно несколько пространств, и часть из них может быть пустой или не подготовленной для демонстрации. Если в проводнике нет таблиц и папок, переключитесь на другое пространство через этот селектор.

Эти ключи предназначены только для локальной демонстрации в приватном контуре хакатона. Для публичного репозитория или production-окружения их нужно вынести в защищенное хранилище секретов.

Остановка:

```bash
docker compose down
```

С удалением томов (если нужен "чистый" старт):

```bash
docker compose down -v
```

## Политика env.example

Для хакатон-демо проект специально настроен так, чтобы запускаться без ручного редактирования переменных окружения:

- `docker-compose.yml` подключает `backend/.env.example` напрямую.
- `frontend/.env.example` содержит дефолтные локальные URL.

Это сделано осознанно, чтобы упростить проверку и раскатку в рамках приватного репозитория MWS GitLab.

Важно:

- Текущее решение предполагает приватный контур хранения кода.
- Для публичных репозиториев/production необходимо вынести чувствительные токены в защищенный secret storage и не хранить их в открытых env-файлах.

## Локальная разработка без Docker Compose

### 1) Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3) Context Engine

```bash
cd services/context-engine
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090
```

### 4) Document Generator

```bash
cd document-generator
npm install
npm run dev
```

Дополнительно должны быть доступны PostgreSQL и Redis (локально или в контейнерах).

## Основные URL и API

- OpenAPI контракт: [docs/openapi.yaml](docs/openapi.yaml)
- Анализ интеграции MWS Tables: [docs/MWS_TABLES_API_ANALYSIS.md](docs/MWS_TABLES_API_ANALYSIS.md)
- Короткая карта CRUD-синхронизации: [docs/MWS_TABLES_CRUD_SYNC_SHORT.md](docs/MWS_TABLES_CRUD_SYNC_SHORT.md)
- Документация экспорта документов: [docs/DOCUMENT_EXPORT_MODULE.md](docs/DOCUMENT_EXPORT_MODULE.md)
- Документация импорта Markdown: [docs/MARKDOWN_IMPORT_MODULE.md](docs/MARKDOWN_IMPORT_MODULE.md)
- Документация импорта из Obsidian: [docs/OBSIDIAN_PLUGIN_IMPORT.md](docs/OBSIDIAN_PLUGIN_IMPORT.md)
- История задач frontend (тикеты): [frontend/docs/tickets](frontend/docs/tickets)
- Память проекта: [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md)
- Postman коллекция: [docs/postman/wikilive-api.postman_collection.json](docs/postman/wikilive-api.postman_collection.json)
- Postman окружение: [docs/postman/wikilive-local.postman_environment.json](docs/postman/wikilive-local.postman_environment.json)

## Проверка демо-сценария

Минимальный сценарий для проверки ключевого value proposition:

1. Открыть пространство и создать wiki-страницу.
2. Через slash-menu встроить существующую таблицу MWS Tables в документ.
3. Отредактировать текст и убедиться в автосохранении.
4. Перезагрузить страницу и проверить восстановление черновика.
5. Добавить ссылку на другую страницу и проверить backlinks.
6. Открыть ту же страницу во втором окне/профиле и проверить real-time совместное редактирование.

## Горячие клавиши

Ниже перечислены все явно реализованные в коде горячие клавиши и клавиатурные действия.

### Редактор и slash-menu

- `/` - открыть slash-menu в позиции курсора.
- `ArrowDown` - перейти к следующему пункту slash-menu.
- `ArrowUp` - перейти к предыдущему пункту slash-menu.
- `ArrowRight` - применить текущий пункт slash-menu.
- `Enter` - применить текущий пункт slash-menu.
- `ArrowLeft` - закрыть slash-menu.
- `Escape` - закрыть slash-menu.

### Блочный редактор (кастомные шорткаты)

- `Enter` - вставить перенос строки внутри текущего root-блока (hard break).
- `Shift+Enter` - вставить перенос строки (hard break).
- `Ctrl+Enter` / `Cmd+Enter` - создать новый root-блок ниже текущего.
- `Ctrl+X` / `Cmd+X` - удалить текущий root-блок (кастомная команда удаления блока).
- `Enter` два раза в пустом пункте списка - выйти из списка в обычный абзац.

### AI inline-подсказки (ghost text)

- `Tab` - принять inline-подсказку целиком.
- `Escape` - скрыть текущую inline-подсказку.
- `Enter` - сбросить подсказку и продолжить обычное поведение Enter.

### AI чат и copilot-поля ввода

- `Enter` - отправить сообщение.
- `Shift+Enter` - перенос строки без отправки.

### Таблицы и embed-редактирование

- `Enter` - подтвердить редактирование ячейки.
- `Escape` - отменить редактирование ячейки.

### Модальные окна и панели

- `Escape` - закрыть активное модальное окно/панель (link, image, template variable, live reference picker, live formula, plugins modal, view/participants menu и т.д.).
- `Enter` - подтвердить действие в инпутах, где это предусмотрено (например, вставка iframe URL, подтверждение редактирования заголовка/описания страницы).
- `Space` / `Enter` - переключить checkbox-настройки в модуле плагинов.

### Базовые сочетания Tiptap

Также доступны стандартные сочетания редактора (StarterKit + подключенные extensions). Основные:

- `Ctrl/Cmd + B` - полужирный.
- `Ctrl/Cmd + I` - курсив.
- `Ctrl/Cmd + E` - inline code.
- `Ctrl/Cmd + U` - подчеркивание.
- `Ctrl/Cmd + Z` - undo.
- `Ctrl/Cmd + Shift + Z` - redo.
- `Ctrl/Cmd + Y` - redo (в ряде браузеров/платформ).
- `Ctrl/Cmd + A` - выделить все.
- `Ctrl/Cmd + Shift + 7` - нумерованный список.
- `Ctrl/Cmd + Shift + 8` - маркированный список.
- `Ctrl/Cmd + Shift + B` - цитата.

Для списков/таблиц также работают стандартные клавиши навигации редактора (Tab, Shift+Tab, Enter, Backspace) в зависимости от текущего контекста курсора.

## Тесты и качество

Backend тесты:

```bash
cd backend
npm test -- --runInBand
```

Сборка backend:

```bash
cd backend
npm run build
```

Frontend тесты:

```bash
cd frontend
npm test
```

## Лицензии ключевых компонентов

- Tiptap (open-source core).
- Yjs.
- Hocuspocus.
- React/NestJS/FastAPI и сопутствующий open-source стек.

Это соответствует требованию использовать расширяемую open-source основу для редактора и коллаборации.
