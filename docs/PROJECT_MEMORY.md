# Project Memory

## Confirmed Context

- This solution is being built for the `WikiLive` hackathon case.
- The frontend stack uses `React + Tiptap`.
- The editor collaboration model is based on `CRDT`.
- The backend must receive CRDT-related updates/events from the Tiptap collaboration flow.
- The backend is responsible for persisting collaboration data to the database and synchronizing document state between users.
- The solution will be embedded into the existing `MWS Tables` ecosystem rather than positioned as a standalone product.

## Integration Notes

- MWS Tables public API base URL: `https://tables.mws.ru/fusion/v1/`
- API usage model: obtain an API token and call the public endpoints from the integration layer.
- Integration should feel native to MWS Tables and keep tables as live entities inside wiki pages.

## Open Architecture Decisions

The following still need explicit selection and design:

- primary database
- persistence strategy for CRDT data
- caching system
- database schema
- synchronization model between persisted state and active collaboration sessions

## Backend Responsibility Envelope

The backend is expected to cover at least:

- page/document storage
- page links and backlinks
- table embed metadata and integration adapters
- CRDT event or update ingestion from the editor layer
- persistence of collaboration state into the database
- synchronization of updates between concurrent users
- autosave and recovery support boundaries where backend participation is required

## Guardrails

- Do not reduce the collaboration implementation to plain last-write-wins text saving if it weakens the verifiable CRDT story.
- Keep the architecture compatible with an embedded enterprise module inside MWS Tables.
- Favor implementation choices that are easy to demo, inspect, and explain to hackathon judges.
