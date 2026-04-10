# Frontend Architecture Guard

## Skill ID

`frontend/architecture-guard`

## Purpose

Keep frontend changes aligned with the project architecture and avoid overengineering.

## Use When

- Adding a new feature or module.
- Moving files between layers.
- Refactoring shared/editor code boundaries.

## Inputs

- `docs/info/architecture.md`
- Touched frontend files under `src/`
- User request scope

## Procedure

1. Map requested change to current layer: `pages`, `features`, `entities`, `shared`, `app`.
2. Keep public API through `index.ts` in feature/entity modules.
3. Ensure editor behavior stays in `features/page-editor` unless reuse requires extraction.
4. Keep adapters (`autosave`, `collaboration`, backend sync) separated from pure UI concerns.

## Definition of Done

- New code is placed in the correct architectural layer.
- No cross-layer leakage of feature internals.
- Change can be explained in 2-3 sentences with existing architecture terms.

## Guardrails

- Do not create abstractions without immediate use.
- Do not mix transport/persistence logic into presentational UI components.
- Do not break existing module public exports.

## Validation

1. Check imports in touched files for layer violations.
2. Ensure `index.ts` exports remain clean and minimal.
3. Run `npm run build` in `frontend`.

## Response Contract

- List architectural placement decisions.
- Mention what was intentionally not abstracted.
- Provide build result.
