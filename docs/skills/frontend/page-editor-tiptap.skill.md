# Page Editor Tiptap Development

## Skill ID

`frontend/page-editor-tiptap`

## Purpose

Implement editor behavior in Tiptap with predictable UX and clean integration into React UI.

## Use When

- Adding/changing editor commands.
- Modifying editor extensions, schema, keyboard behavior.
- Updating editor shell and toolbar integration.

## Inputs

- Files in `src/features/page-editor/`
- Tiptap extension requirements
- UX expectations (toolbar, slash, placeholders)

## Procedure

1. Update editor setup (`useEditor`, extensions, content/init behavior).
2. Keep command logic in model/core-oriented files where possible.
3. Wire UI controls through editor API with focused and null-safe checks.
4. Verify keyboard flow and text selection behavior.

## Definition of Done

- Command behavior is deterministic.
- Toolbar reflects current selection/active marks.
- No TypeScript nullability errors around editor instance.

## Guardrails

- Do not put large command logic directly inside JSX handlers.
- Do not add extension dependencies without clear need.
- Do not regress editor typing latency.

## Validation

1. Run `npm run build`.
2. Manual smoke test: typing, bold/italic/heading toggles.
3. Manual smoke test: selection changes and focus transitions.

## Response Contract

- Explain changed editor behavior.
- Mention touched extensions/commands.
- Share verification results.
