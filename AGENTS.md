# AGENTS.md

## Project Overview

This repository contains a hackathon solution for the `WikiLive: live tables inside text` case.

The product goal is to turn isolated text pages into a collaborative knowledge workspace where:

- text pages, live MWS Tables tables, and links between pages coexist in one editor
- users can insert existing MWS Tables tables directly into page content
- content autosaves inline, is mirrored to browser local cache, and syncs with backend
- users can create links between pages and see backlinks
- editing remains fast through slash-menu actions and keyboard shortcuts
- collaborative editing is demonstrable in a verifiable form

## Product Rules

Treat the following as non-negotiable requirements:

- embed an existing MWS Tables table into the page body as a live object, not a static screenshot or dead export
- inline autosave while typing
- local draft/cache recovery in the browser
- backend synchronization
- backlinks between pages
- slash-menu with keyboard support
- collaborative editing in any verifiable form

Additional features are welcome only after the mandatory contour works reliably.

## Delivery Priorities

When making product or engineering tradeoffs, optimize in this order:

1. Mandatory functionality works end-to-end in demo conditions
2. Integration with MWS Tables feels native and convincing
3. UX is clean, fast, and understandable without explanation
4. Demo reliability is higher than feature count
5. Extra features strengthen the core scenario instead of distracting from it

## Expected Deliverables

The final repository should support the full hackathon submission package:

- open source code repository
- one-command local run, preferably via `docker compose up` or equivalent
- launch instructions in `README.md`
- component/integration diagram
- filled feature matrix from the hackathon template
- demo video
- presentation deck for a 7-minute final pitch

## Recommended Architecture Direction

Unless the user explicitly asks otherwise, prefer an architecture that is easy to demo and explain:

- `frontend/`: React application with Tiptap for the editor, page navigation, backlinks, table embeds, and collaboration UI
- `backend/`: service that receives CRDT updates from Tiptap collaboration flows, persists document state/events, manages sync between users, and integrates with MWS Tables APIs
- local persistence in the frontend for draft recovery
- explicit API boundaries between wiki pages, links, embeds, revisions, comments, and collaboration

If the codebase is still being bootstrapped, choose pragmatic tools that are easy to run locally and easy for judges to verify.

## Editor Expectations

The base editor must rely on an open-source editor with a clear permissive license.

Prefer an editor stack that supports:

- React + Tiptap as the current chosen editor direction
- slash commands
- rich block content
- keyboard-first workflows
- custom embed blocks for MWS Tables
- extensibility for backlinks, comments, AI help, and version history
- collaboration support or a realistic integration path

Any editor choice should be justified in docs by:

- license
- extension model
- collaboration story
- implementation speed

## MWS Tables Integration

Design all table-related behavior as if this module will live next to the real MWS Tables product.

Important constraints:

- table embeds should preserve identity, not become copied text blobs
- use API-driven data flow wherever possible
- keep the UX consistent with a host product integration scenario
- if a real API is unavailable in local development, isolate mocks/adapters clearly so the integration story stays honest

When building the integration, favor:

- a dedicated table embed block with loading, error, and empty states
- clear metadata for linked table id / space id / view id if relevant
- refresh and sync behavior that is understandable in the demo
- API integration via the public MWS Tables base URL: `https://tables.mws.ru/fusion/v1/`

## Collaboration Expectations

Collaboration must be demonstrable. Acceptable implementation paths can include:

- real-time presence and shared editing
- optimistic locking plus visible multi-user state
- section or document-level concurrent edit handling with clear conflict resolution

If full CRDT-grade collaboration is not feasible, implement the most reliable verifiable version possible and document the tradeoff honestly.

## UX Guidance

This project will be judged heavily on usability. Prefer:

- fast primary flows with minimal clicks
- clear page structure and navigation
- backlinks and related pages that are visible without hunting
- resilient autosave states with explicit feedback
- polished empty/loading/error states
- UI decisions that can plausibly fit an existing enterprise design kit

Do not add visual noise that weakens the core editor scenario.

## AI Features

AI features are optional. If implemented:

- keep them secondary to the mandatory contour
- explicitly document dependencies, limitations, and failure modes
- explain where MWS GPT is used and where it is not used
- avoid making the core product depend on AI availability

Never hardcode secrets into committed frontend code or public docs.

## Engineering Guidelines

- prefer boring, reliable implementations over clever ones
- keep modules small and demo-friendly
- document assumptions when real platform behavior is mocked
- add tests for critical flows where practical
- avoid introducing infrastructure that makes one-command launch fragile
- keep configuration centralized and example env files up to date

## Working Agreement For Agents

When contributing to this repository:

- first preserve or improve the mandatory feature contour
- prefer edits that move the project toward a shippable demo
- update `README.md` when setup or behavior changes
- keep architecture easy to explain in a short pitch
- if you add a new dependency, justify it by impact on required functionality or demo quality
- if a shortcut is taken for the hackathon, document it explicitly instead of hiding it

## Definition Of Done

A task is not complete unless most of the following are true when applicable:

- the change is implemented end-to-end
- the repository still has a clear local run path
- affected docs are updated
- basic verification has been performed
- the change strengthens the hackathon submission rather than only internal code quality

## Immediate Build Objective

The near-term objective for the team is to produce a convincing MVP that demonstrates:

- page creation and editing
- slash-menu driven block insertion
- live MWS Tables embed
- local autosave and backend sync
- page-to-page links and backlinks
- collaborative editing or visible multi-user coordination

Everything else should support that story.
