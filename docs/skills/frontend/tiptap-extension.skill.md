# Tiptap Extension Development

## Skill ID

`frontend/tiptap-extension`

## Purpose

Разрабатывать кастомные Tiptap extensions (nodes, marks, commands, keyboard) с предсказуемым поведением и React-интеграцией.

## Use When

- Добавляешь новый node/mark/command.
- Модифицируешь keyboard shortcuts, slash menu.
- Создаёшь React NodeViews для кастомных блоков.

## Inputs

- `src/features/page-editor/extensions/` (существующие extensions)
- `docs/info/page-editor-commands.md` (список команд)
- Tiptap docs (https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new)

## Procedure

1. Определи тип: **Node** (блоки), **Mark** (форматирование), **Extension** (поведение).
2. Создай файл `src/features/page-editor/extensions/MyExtension.ts`.
3. Реализуй базовый шаблон с `name`, `parseHTML/renderHTML`.
4. Добавь `addCommands/addKeyboardShortcuts` для логики.
5. Подключи в `useEditor` и протестируй `editor.commands.myCommand()`.
6. Для React NodeViews — `ReactNodeViewRenderer(MyComponent)`.

## Definition of Done

- Extension регистрируется без ошибок.
- Команды работают на selection/content.
- Keyboard shortcuts не конфликтуют.
- React NodeView обновляется на props/state.

## Guardrails

- **Всегда unique name** (camelCase).
- **Nullable-safe**: `if (!editor) return`.
- **Commands через API**, не прямые мутации.
- **No print/debug в production** — используй `onUpdate` hooks.

## Validation

1. `npm run build` — нет TS ошибок.
2. Smoke test:
   ```
   | Extension type | Test |
   |----------------|------|
   | Node           | Insert → Render → Delete |
   | Mark           | Toggle on text → Toggle off |
   | Keyboard       | Ctrl+B → Command fires |
   | NodeView       | Props change → Re-render |
   ```
3. Performance: typing latency <50ms на 1000 chars.

## Response Contract

```
**Extension**: MyCustomNode [Node/Mark/Extension]
**Features**: insertCommand, Ctrl+K shortcut
**Commands**: editor.commands.insertCustomNode()
**Test results**:
  - Insert/delete: ✅
  - Keyboard: Ctrl+K fires ✅
  - NodeView update: ✅
**Files touched**: extensions/MyCustomNode.ts, useEditor.ts
```

## Пример шаблона

```typescript
// src/features/page-editor/extensions/ExampleNode.ts
import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

export const ExampleNode = Node.create({
  name: 'exampleNode',
  
  group: 'block',
  atom: true,
  
  addAttributes() {
    return { color: { default: 'blue' } }
  },
  
  parseHTML() { return [{ tag: 'div[data-type="example"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'example', style: `color: ${HTMLAttributes.color}` }, 0]
  },
  
  addCommands() {
    return {
      insertExampleNode: attributes => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes
        })
      }
    }
  }
})
```

---

Этот скилл покрывает 95% Tiptap-разработки. Рекомендуется использовать вместе с `frontend/architecture-guard` перед выделением экстеншенов в общий core.
