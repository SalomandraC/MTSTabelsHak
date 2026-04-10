# Frontend Skills Index

Canonical frontend skills for this project.

## Core Skills

- `frontend/architecture-guard` -> `architecture-guard.skill.md`
- `frontend/page-editor-tiptap` -> `page-editor-tiptap.skill.md`
- `frontend/slash-menu-commands` -> `slash-menu-commands.skill.md`
- `frontend/page-metadata` -> `page-metadata.skill.md`
- `frontend/autosave-sync` -> `autosave-sync.skill.md`
- `frontend/tailwind-consistency` -> `tailwind-consistency.skill.md`
- `frontend/responsive-a11y` -> `responsive-a11y.skill.md`
- `frontend/quality-gate` -> `quality-gate.skill.md`

## Skill Selection Guide

- Any structural refactor: use `architecture-guard` + `quality-gate`.
- Editor behavior changes: use `page-editor-tiptap` + `slash-menu-commands` + `responsive-a11y`.
- Title/description/content save flow: use `page-metadata` + `autosave-sync`.
- Realtime updates: (skill not present) consider `collaboration-yjs` when available.
- Table embeds: (skill not present) consider `table-embed` when available.
- Styling/UI cleanup: use `tailwind-consistency` + `responsive-a11y`.
