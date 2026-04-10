# Tailwind Consistency Guard

## Skill ID

`frontend/tailwind-consistency`

## Purpose

Preserve Tailwind-first styling while keeping global CSS minimal and intentional.

## Use When

- Building new UI blocks.
- Refactoring component styling.
- Reviewing style regressions.

## Inputs

- `docs/info/color-tokens.md`
- `docs/info/fonts.md`
- `src/shared/styles/global.css`

## Procedure

1. Prefer Tailwind utilities for layout, spacing, size, and composition.
2. Use semantic color/token classes where available.
3. Keep CSS additions only for globals/reset/fonts and rare editor-specific cases.
4. Remove dead/duplicate style rules during refactors.

## Definition of Done

- Most styling lives in component className utilities.
- Global CSS changes are justified and minimal.
- No visual regression in affected components.

## Guardrails

- Do not introduce large per-component CSS files without need.
- Do not duplicate token values across files.
- Do not bypass existing design tokens when equivalent exists.

## Validation

1. Run `npm run build`.
2. Manual desktop/mobile visual check.
3. Confirm no unused style blocks in touched files.

## Response Contract

- Explain why Tailwind/CSS split is correct.
- Mention removed style debt (if any).
- Confirm visual checks.
