The user wants a comprehensive project summary based on the conversation history. Let me extract the key information and format it as markdown.# Project Summary

## Overall Goal
Implement a `WikiLive` hackathon case — collaborative wiki editor with live MWS Tables embeds, slash-menu, backlinks, autosave, and a plugin-first architecture with configurable editor modules (canvas drawing, iframe embed).

## Key Knowledge

### Architecture
- **Frontend**: React + Tiptap editor, Vite, Tailwind CSS, Yjs for CRDT collaboration
- **Backend**: NestJS with Hocuspocus collaboration server (port 8081), HTTP API on port 8080
- **Database**: PostgreSQL 16 + Redis 7 (via Docker Compose)
- **Local run**: `docker compose up` from repo root

### Document Storage (Prisma models)
- `PageDocument` — current Yjs snapshot (`ydocSnapshot` binary), `stateVector`, `serverVersion`
- `PageCrdtUpdate` — CRDT update stream (`updatePayload` binary, sequential `seq`)
- `PageCheckpoint` — full snapshots for history/restore, `trigger` enum (`editor_idle`, `manual`, `restore`)
- `WikiPage` — page metadata, links to `latestCheckpointId`

### Plugin System
- Backend defines plugins in `backend/src/plugins/plugin-definitions.ts` — each has `id`, `defaultEnabled`, `implemented`, `requiredPlans`, `defaultSettings`
- Frontend reads catalog via API and controls enablement through `PluginsContext`
- Runtime slots defined in `plugin-registry.ts` — `workspaceSidebarSlots`, `editorSlots`
- Plugin settings (`toolbar`, `floating-toolbar`, `slash-menu` booleans) stored in DB and control button visibility

### Implemented Plugins
- **Core** (always enabled): `live-tables`, `backlinks`, `slash-menu`, `autosave-sync`, `collaboration`
- **Optional** (toggleable): `document-graph`, `comments`, `time-machine`, `ai-assistant`, `canvas-draw`, `iframe-embed`

### Build & Run
```bash
# Clean rebuild (removes all data):
docker compose down -v && docker compose build --no-cache && docker compose up

# If DB schema conflicts (P3005 error), baseline migrations:
docker compose run --rm api npx prisma migrate resolve --applied <migration_name>
# Then: docker compose run --rm api npx prisma migrate deploy
```

### Editor Extensions
- `CanvasBlock` — drawing canvas with color/size tools, stores lines as normalized coordinates
- `IframeBlock` — embeds external content (YouTube, maps) via `setIframe` command, 16:9 responsive ratio
- Both plugins use same settings pattern: checkboxes in plugins modal control visibility in toolbar / floating-toolbar / slash-menu

### Known Issues / Tradeoffs
- YouTube iframe controls may not work until video interaction (known YouTube Player API bug, not fixable from our side)
- `d3` and `cytoscape` dependencies were in conflict — `cytoscape` restored (used by `document-link-graph`), `d3` unused
- `uuid` package needed `npm install` after conflict resolution

## Recent Actions

### Conflict Resolution (merge `dev` → `feature/20`)
1. Resolved 8 files with merge conflicts — prioritized incoming (`dev`) but preserved `canvas-draw` plugin additions
2. Fixed `plugins` variable missing in `use-page-editor-controller.ts` — added `usePlugins()` destructuring
3. Fixed `slashCommandItems` reference — changed to `slashItems` (from `getSlashCommandItems(plugins)`)
4. Fixed `filteredItems` deps — added `slashItems` to dependency array so plugin changes update slash-menu immediately
5. Added missing `Pencil`, `MonitorPlay` lucide icons, restored `updatePluginSettings` in workspace-page
6. Fixed Prisma migration baseline issue after `docker compose down -v`

### Iframe Embed Plugin (full implementation)
1. Created `IframeBlock` Tiptap Node extension (`iframe-block.ts`)
2. Created React component (`iframe-block-component.tsx`) with URL input and responsive 16:9 iframe
3. Registered in `editor-config.ts`
4. Added to `slash-command-items.ts` with plugin flag check
5. Added buttons to both `page-editor-toolbar.tsx` and `floating-toolbar.tsx` with settings-based visibility
6. Created `IframeModal` with `ModalActionButton` (consistent with other modals)
7. Integrated into `use-page-editor-controller.ts` with `openIframeModal` / `handleConfirmIframe`
8. Added `isIframeBlock` to `menu-state.ts` and equality check
9. Added backend plugin definition with `defaultSettings`
10. Added `getIframeEmbedSettings()` to `plugin-registry.ts`
11. Added iframe-embed to `runtimePluginRegistry`
12. Added iframe settings checkboxes in `plugins-modal.tsx`

### Bug Fixes
- Canvas drawing video freeze issue — reverted overlay/interaction pattern to simple iframe
- Plugin enablement not reflecting in slash-menu — added `slashItems` to `filteredItems` useMemo deps

## Current Plan

### [DONE]
- [DONE] Core merge conflict resolution
- [DONE] Canvas-draw plugin integration
- [DONE] Iframe-embed plugin (full feature: extension, modal, toolbar buttons, settings)
- [DONE] Plugin settings checkboxes for iframe-embed
- [DONE] Slash-menu reactivity fix for plugin toggles
- [DONE] Iframe modal with ModalActionButton pattern

### [TODO]
- [TODO] Verify full e2e flow with fresh Docker rebuild (clean DB + migrations)
- [TODO] Test iframe embed with YouTube/video URLs (known YouTube controls bug)
- [TODO] Verify canvas-draw plugin works end-to-end (toolbar, floating toolbar, slash-menu, plugins modal settings)
- [TODO] Verify iframe-embed plugin works end-to-end (all three slots + settings checkboxes)

---

## Summary Metadata
**Update time**: 2026-04-12T19:20:47.071Z 
