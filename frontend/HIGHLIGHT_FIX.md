# Добавление Highlight в редактор

## Реализация
Добавлена функциональность выделения текста маркером (highlight) в редактор WikiLive.

## Изменения

### 1. Состояние highlight в menu-state.ts
Добавлены поля `isHighlight` и `canHighlight` в `menuBarStateSelector` для отслеживания состояния выделения.

### 2. Кнопка в PageEditorToolbar
Добавлена кнопка с иконкой `Highlighter` из lucide-react после кнопки подчёркивания:
- Иконка меняет цвет на красный (#d92c2c) когда highlight активен
- Кнопка disabled когда редактирование недоступно
- Aria-label: "Выделить маркером"

### 3. Кнопка в FloatingToolbar
Добавлена кнопка highlight в плавающий тулбар между кнопками Underline и Code:
- Та же иконка и логика активации
- Появляется при выделении текста

### 4. CSS стили
Добавлены стили для `<mark>` в `global.css`:
```css
.tiptap mark {
  background-color: #fef08a;
  border-radius: 0.25rem;
  padding: 0.1rem 0.2rem;
  box-decoration-break: clone;
}
```

### 5. Extension
Highlight extension уже был подключен в `editor-config.ts`, дополнительная настройка не требовалась.

## Как использовать
1. Выделите текст в редакторе
2. Нажмите кнопку с иконкой маркера (Highlighter) в toolbar или floating toolbar
3. Текст будет выделен жёлтым цветом (#fef08a)
4. Повторное нажатие снимает выделение

## Технические детали
- Extension: `@tiptap/extension-highlight` (уже установлен)
- HTML: `<mark>текст</mark>`
- Цвет: жёлтый (#fef08a) - один цвет по умолчанию
- Иконка: `Highlighter` из lucide-react

## Следующие шаги (опционально)
Для добавления multicolor highlight:
1. Настроить extension с `multicolor: true`
2. Добавить палитру цветов в UI
3. Добавить CSS для разных цветов с `data-color` атрибутом
