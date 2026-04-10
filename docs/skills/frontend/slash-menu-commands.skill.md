# Slash Menu Commands

## Skill ID

`frontend/slash-menu-commands`

## Purpose

Deliver reliable slash-triggered command insertion with keyboard-first UX.

## Use When

- Adding slash command items.
- Changing slash trigger parsing/filtering.
- Adjusting overlay positioning and navigation.

## Inputs

- `src/features/slash-menu/`
- `src/features/page-editor/model/slash-command-items.ts`
- Keyboard and overlay behavior requirements

## Procedure

1. Keep command catalog declarative (label, keywords, run handler).
2. Parse query after `/` and filter by label/keywords.
3. Maintain keyboard navigation (up/down/enter/escape).
4. Render menu as overlay with viewport clamping.

## Definition of Done

- Slash menu opens consistently on valid `/query`.
- Keyboard navigation works without mouse.
- Selected command replaces slash range and executes once.

## Guardrails

- Do not block normal typing when menu is closed.
- Do not allow overlay to render off-screen.
- Do not couple menu UI to specific command business logic.

## Validation

1. Manual test `/` open, filtering, and execute command.
2. Manual test escape closes menu.
3. Run `npm run build`.

## Response Contract

- List added/changed commands.
- Describe keyboard and overlay behavior.
- Confirm smoke-test outcomes.
