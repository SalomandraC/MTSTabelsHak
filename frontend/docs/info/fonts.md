# Fonts and Usage

This document describes the fonts used by the editor and recommended cases for each.

## Installed / expected local fonts

- `MTS Compact` — expected at `src/app/fonts/MTS-Compact.woff2`.
- `MTS Wide` — expected at `src/app/fonts/MTS-Wide.woff2`.

Note: font files are not included in the repository by default. Place the WOFF2 files into `src/app/fonts/`.

## System / fallback stack

- `Inter` and system UI fonts are used as the default fallbacks: `Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`.

## Usage / cases

- `MTS Wide` — headings and display titles (H1/H2). Use for strong, wide-set display typography.

  Example CSS: `font-family: var(--font-wide); font-weight: 500;`.

- `MTS Compact` — paragraph and UI text where a condensed, compact face is desired (labels, small captions).

  Example CSS: `font-family: var(--font-compact); font-weight: 400;`.

- `Inter` (fallback) — general UI, body and form inputs.

  Use when custom font files are missing or for faster first paint.

## Performance and loading

- Use WOFF2 for best compression.
- Use `font-display: swap` in `@font-face` so text remains readable during font load.
- Consider preloading critical fonts in `index.html`:

```html
<link rel="preload" href="/src/app/fonts/MTS-Compact.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/src/app/fonts/MTS-Wide.woff2" as="font" type="font/woff2" crossorigin>
```

## Fallback strategy

1. If local fonts exist, the browser will use `MTS Compact` / `MTS Wide`.
2. If not, the stack falls back to `Inter` and system fonts.

## Adding more weights or italics

- Add additional `@font-face` rules with `font-weight` and `font-style` ranges for each weight and italic variant.

## Applying fonts in components

- Use the CSS variables defined in `src/shared/styles/global.css`:

  - `var(--font-sans)` — default UI stack
  - `var(--font-compact)` — compact/paragraph face
  - `var(--font-wide)` — display/headings face

Example Tailwind integration: extend `fontFamily` in `tailwind.config.js` to reference the CSS variables or the font names.
