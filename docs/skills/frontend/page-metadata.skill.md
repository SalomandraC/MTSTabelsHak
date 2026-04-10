# Page Metadata Management

## Skill ID

`frontend/page-metadata`

## Purpose

Implement reliable editing of page title and description with clear persistence behavior.

## Use When

- Adding/editing title and description fields.
- Wiring metadata to local cache or backend sync.
- Aligning metadata with workspace/editor shell.

## Inputs

- `src/features/page-editor/ui/page-editor-header.tsx`
- `src/features/page-editor/ui/page-editor.tsx`
- Backend contract (if available)

## Procedure

1. Keep metadata state in page editor shell.
2. Expose controlled inputs in header UI with save/cancel flow.
3. Persist to local cache first (offline-friendly).
4. Add API sync hook point (or adapter) for backend integration.

## Definition of Done

- User can edit and save title/description.
- Metadata persists across page reload.
- UI fallback values are safe when fields are empty.

## Guardrails

- Do not mutate metadata directly from child components.
- Do not hardcode backend logic inside presentational header.
- Do not lose user input on toggling edit mode accidentally.

## Validation

1. Manual test: edit -> save -> reload retains values.
2. Manual test: cancel restores previous values.
3. Run `npm run build`.

## Response Contract

- Describe state ownership and persistence keys.
- Mention fallback behavior.
- Report validation results.
