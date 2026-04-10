# Responsive and Accessibility QA

## Skill ID

`frontend/responsive-a11y`

## Purpose

Ensure core editor and page flows remain usable across viewport sizes and keyboard-only navigation.

## Use When

- Any UI/layout update.
- Toolbar/menu interactions change.
- Form/input controls are added.

## Inputs

- Changed UI components
- Required breakpoints
- Keyboard interaction expectations

## Procedure

1. Verify small and large viewport layouts.
2. Ensure focusable controls have meaningful labels.
3. Confirm keyboard flow for menus/dialogs/commands.
4. Keep contrast and text truncation behavior readable.

## Definition of Done

- Primary workflows work on mobile and desktop.
- Keyboard-only usage is viable for editor controls.
- Critical controls include labels/aria attributes.

## Guardrails

- Do not rely on hover-only interactions.
- Do not hide essential actions behind inaccessible controls.
- Do not ship controls without focus-visible states.

## Validation

1. Manual check at common widths (mobile/tablet/desktop).
2. Tab/enter/escape navigation smoke test.
3. Run `npm run build`.

## Response Contract

- Report tested breakpoints.
- Report keyboard navigation results.
- Report a11y improvements made.
