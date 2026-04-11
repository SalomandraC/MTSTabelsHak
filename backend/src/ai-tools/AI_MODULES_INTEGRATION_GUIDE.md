# AI Modules Integration Guide

## 1. Цель документа

Этот документ фиксирует текущую архитектуру AI-контура в backend и дает практический план для frontend-интеграции.

Документ также отмечает временные тестовые части, которые нужно убрать перед выходом на основной контур.

## 2. Карта модулей

### 2.1 AiToolsModule

Файл: src/ai-tools/ai-tools.module.ts

Что делает:
- собирает весь AI-контур в одном NestJS модуле;
- подключает контроллеры;
- регистрирует сервисы провайдера, ассистента, чата и tool registry.

### 2.2 AiProviderClientService

Файл: src/ai-tools/ai-provider-client.service.ts

Что делает:
- отправляет запросы в MWS GPT API;
- использует OpenAI-совместимый формат chat completions;
- поддерживает tools и tool_choice.

Текущая конфигурация:
- base URL: https://api.gpt.mws.ru/v1
- модель: kimi-k2-instruct
- токен: MWS_AI_TOKEN

### 2.3 AiAssistantService

Файл: src/ai-tools/ai-assistant.service.ts

Что делает:
- getCompletion: ghost text для продолжения текста;
- generateContent: генерация ProseMirror JSON;
- transformText: стилистические трансформации текста.

Важно:
- все ответы валидируются;
- для generateContent требуется валидный doc JSON.

### 2.4 AiChatService

Файл: src/ai-tools/ai-chat.service.ts

Что делает:
- принимает вопрос пользователя;
- запускает tool-calling цикл (до нескольких раундов);
- при tool_calls вызывает executeTool через registry;
- отправляет результат tool в модель;
- возвращает финальный human-readable ответ.

Это и есть контур MWS AI -> Tool Call -> MWS Tables -> Final AI Answer.

### 2.5 AiToolRegistryService

Файл: src/ai-tools/ai-tool-registry.service.ts

Что делает:
- хранит tool definitions;
- валидирует аргументы по JSON schema;
- исполняет операции через MwsService;
- возвращает унифицированный ToolExecutionResult.

Поддерживаемые инструменты:
- create_records
- patch_records
- get_records
- delete_records
- smart_import

### 2.6 Tool Definitions и Validator

Файлы:
- src/ai-tools/tool-definitions.ts
- src/ai-tools/tool-schema-validator.ts

Что делают:
- задают схемы для function-calling;
- проверяют аргументы до выполнения операций.

### 2.7 WikiDocumentInjectionService

Файл: src/ai-tools/wiki-document-injection.service.ts

Что делает:
- формирует командные envelope для insert и refresh блоков;
- помогает связать backend AI-результат и документный контур.

## 3. HTTP API для frontend

Основной контроллер:
- src/ai-tools/ai-tools.controller.ts

Эндпоинты:

1. POST /api/v1/ai/autocomplete
Назначение: короткое продолжение текущего текста.

2. POST /api/v1/ai/generate
Назначение: генерация структурированного ProseMirror JSON.

3. POST /api/v1/ai/transform
Назначение: переписать выделенный текст в выбранном стиле.

4. POST /api/v1/ai/chat
Назначение: вопрос к AI с возможностью tool-calling к MWS Tables.

5. POST /api/v1/ai/execute
Назначение: прямой вызов tool registry (технический endpoint, полезен для отладки и внутреннего orchestration).

6. GET /api/v1/ai/definitions
Назначение: получить список доступных tools и схем.

## 4. Как фронтенду использовать модуль

### 4.1 Рекомендуемый путь интеграции

1. Для ghost text
- дергать POST /api/v1/ai/autocomplete на pause в наборе;
- вставлять ответ как inline suggestion.

2. Для генерации блока
- дергать POST /api/v1/ai/generate;
- принимать document и вставлять в editor chain.

3. Для переписывания выделения
- дергать POST /api/v1/ai/transform;
- заменять выбранный фрагмент на результат.

4. Для Q&A и аналитики по таблицам
- дергать POST /api/v1/ai/chat;
- показывать ответ;
- при необходимости отрисовывать debug_steps в dev панели.

### 4.2 Минимальные payload примеры

Generate request:
{
  "prompt": "Сделай краткое описание страницы",
  "pageTitle": "Sprint notes",
  "pageSnapshot": {
    "type": "doc",
    "content": []
  }
}

Chat request:
{
  "question": "Какие задачи в таблице?",
  "datasheetId": "dstf2fJvxaGwEoKbMU",
  "viewId": "viwqsvV5QzMvA",
  "pageSnapshot": {
    "type": "doc",
    "content": []
  }
}

## 5. Что временное и что убрать

Ниже перечислены временные тестовые части.

### 5.1 Временный AI smoke endpoint

Файл:
- src/ai-tools/ai-smoke-test.controller.ts

Назначение:
- ручная интеграционная проверка цепочки AI + tools.

Что сделать перед финализацией:
- удалить контроллер;
- убрать его импорт из src/ai-tools/ai-tools.module.ts.

### 5.2 Временный MWS тестовый endpoint

Файлы:
- src/mws/mws-test.controller.ts
- вспомогательный raw метод в src/mws/mws.service.ts для этого контроллера

Назначение:
- ручной тест боевого POST в таблицы.

Что сделать перед финализацией:
- удалить mws-test.controller.ts;
- удалить testCreateRecordsRaw и связанный вспомогательный путь, если он больше не нужен;
- убрать регистрацию контроллера из src/mws/mws.module.ts.

## 6. План перехода на основной контур

1. Оставить только продуктовые endpoints в ai-tools.controller.ts.
2. Удалить временные smoke и test-post контроллеры.
3. Добавить разграничение прав для execute endpoint или скрыть его за internal route.
4. Добавить аудит tool вызовов в логах и трассировке.
5. Закрыть e2e сценарии на chat flow с реальным tool roundtrip.

## 7. Быстрый чеклист для следующего агента

1. Проверить env переменные MWS_AI_TOKEN и MWS_AI_MODEL.
2. Проверить что POST /api/v1/ai/chat возвращает usedTools не пустой при вопросах про таблицу.
3. Убедиться, что tool get_records получает datasheetId из контекста.
4. Проверить, что возвращается финальный ответ модели после tool-calls.
5. Удалить временные контроллеры и обновить модульные импорты.

## 8. Ключевой результат

Текущий backend уже поддерживает полноценную связку:
- MWS AI function calling
- backend tool execution
- запросы в MWS Tables
- возврат результата обратно в модель
- выдача финального ответа фронтенду

Это означает, что фронтенд можно подключать напрямую к продуктовым AI endpoints без дополнительного middleware слоя.
