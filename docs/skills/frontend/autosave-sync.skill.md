# Autosave and Backend Sync

## Skill ID

`frontend/autosave-sync`

## Purpose

Guarantee safe autosave flow from editor updates to local cache and backend sync.

## Use When

- Introducing autosave behavior.
- Changing debounce/window strategy.
- Integrating local draft restore and backend sync status.

## Inputs

- `src/features/autosave/`
- Editor update events
- Backend save API contract

## Procedure

1. Observe editor/metadata changes and enqueue save.
2. Debounce writes and avoid excessive API calls.
3. Persist draft locally before backend request.
4. Surface status: saving, saved, retry/error.

## Definition of Done

- Local draft is always newer-or-equal to last typed state.
- Backend sync is retriable.
- User sees current save status.

## Guardrails

- Do not block typing on save operations.
- Do not overwrite newer local data with stale server response.
- Do not spam backend on every keystroke without debounce.

## Validation

1. Manual test with rapid typing and short pauses.
2. Manual offline simulation and later reconnect.
3. Run `npm run build`.

## Response Contract

- Explain save pipeline and debounce values.
- Describe failure/retry behavior.
- Provide validation summary.
