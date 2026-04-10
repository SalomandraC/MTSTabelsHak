# Global Color Tokens

These tokens are extracted from the editor page design and should be used as the single source of truth.

## Token Map

- `editor-brand`: `#7B67EE`
- `editor-bg-page`: `#FFFFFF`
- `editor-bg-toolbar`: `#F5F7FA`
- `editor-bg-control`: `#F0F1F3`
- `editor-border-subtle`: `#E0E0E0`
- `editor-border-control`: `#D7D9DD`
- `editor-icon`: `#505762`
- `editor-text-primary`: `#1D2023`
- `editor-text-tertiary`: `#969FA8`

## Usage Rules

- Use semantic tokens (`editor-text-primary`, `editor-border-subtle`) instead of hardcoded hex values.
- Prefer Tailwind utility classes built from tokens, for example `text-editor-text-primary` and `bg-editor-bg-toolbar`.
- Use plain CSS only when utility classes become noisy or when defining globals, resets, pseudo-elements, or component-specific edge cases.
- New UI components must reuse this palette before introducing new colors.
