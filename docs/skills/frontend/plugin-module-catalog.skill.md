# Frontend Plugin Module Catalog

## Skill ID

`frontend/plugin-module-catalog`

## Purpose

Помочь разработать или изменить frontend-модуль так, чтобы он корректно попал в каталог плагинов, соблюдал архитектуру проекта и подключался через runtime registry.

## Use When

- Добавляется новый optional plugin для workspace или editor.
- Нужно вывести модуль во вкладку или модалку плагинов.
- Нужно перевести существующую frontend-фичу на plugin-first модель.

## Inputs

- `src/features/plugins/`
- `src/pages/workspace/`
- `src/shared/api/wikilive.ts`
- backend plugin catalog contract
- текущие требования к UX и подпискам

## Procedure

1. Определи, является ли модуль `core` или `optional`; обязательный контур WikiLive не переводить в отключаемые плагины.
2. Добавь или обнови backend definition так, чтобы frontend получал `id`, русское название, описание, статусы, placement и доступность по плану.
3. На frontend внеси модуль в `src/features/plugins/model/plugin-registry.ts` и определи, в какие runtime slots он подключается.
4. Если модуль влияет на workspace, editor sidebar, toolbar или slash-menu, подключай его через registry/provider, а не через новый hardcoded if в случайном месте.
5. Убедись, что в каталоге плагинов модуль имеет понятные русские тексты: название, описание, category-label, placement-tags и причину недоступности.
6. Если модуль недоступен по подписке или выключен, показывай в UI аккуратный fallback-state вместо пропажи интерфейса без объяснения.
7. Если модуль только планируется, пометь его как `comingSoon`, но все равно отобрази в каталоге как часть продуктовой карты.

## Definition of Done

- Модуль отображается в каталоге плагинов.
- Модуль подключается через plugin registry/provider, а не случайным хардкодом.
- Недоступность по тарифу или выключенное состояние объясняются пользователю в UI.
- Русские тексты каталога выглядят продуктово и согласованно.

## Guardrails

- Не переводить mandatory contour в отключаемые плагины.
- Не дублировать plugin metadata в нескольких несвязанных местах без необходимости.
- Не смешивать transport/API-логику с чисто визуальными компонентами каталога.
- Не оставлять английские системные тексты в пользовательском UI каталога.

## Validation

1. Проверить, что модуль виден в каталоге и имеет корректный статус.
2. Проверить сценарии `enabled`, `disabled`, `locked`, `comingSoon`.
3. Проверить, что включение/выключение отражается в соответствующем runtime slot.
4. Запустить `npm run build` во frontend и, если менялся backend catalog, собрать backend.

## Response Contract

- Какие plugin definitions и runtime slots были изменены.
- Как модуль теперь попадает в каталог плагинов.
- Какие fallback-состояния предусмотрены.
- Результат сборки и проверки.
