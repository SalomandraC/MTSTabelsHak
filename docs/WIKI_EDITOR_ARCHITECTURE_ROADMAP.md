# Wiki Editor for MWS Tables: Current Architecture and Evolution Strategy

## 1. Current State Architecture

### 1.1 Architectural Context

Current module architecture is built around three core layers:

1. Tiptap (ProseMirror-based editor) as the document interaction engine.
2. Yjs + Hocuspocus as CRDT synchronization transport for collaborative editing.
3. MWS Tables API (`https://tables.mws.ru/fusion/v1/`) as the external live data source for tables.

At the prototype stage, AI tool logic and direct MWS API calls are implemented on the frontend for maximum delivery speed.

### 1.2 Current Logical Components

- Frontend editor shell (React + Tiptap):
  - renders page content;
  - executes slash commands and toolbar actions;
  - stores document in Tiptap JSON format.
- Collaboration layer (Yjs + Hocuspocus):
  - transforms local editor changes to CRDT updates;
  - propagates updates to other participants in real time;
  - supports offline-first editing with deferred sync.
- Frontend integration adapter to MWS Tables:
  - executes GET/POST/PATCH calls for table entities;
  - uses stable field identifiers (`fld...`) to avoid breakage on field renames;
  - converts API payloads into editor embed model.

### 1.3 Current Synchronization Model

Current collaborative loop:

1. User input updates ProseMirror state.
2. Tiptap transaction updates local document JSON and Yjs document.
3. Yjs emits CRDT updates to Hocuspocus provider.
4. Hocuspocus broadcasts updates to connected clients.
5. Remote clients merge updates deterministically and render the same document state.

Important property: no last-write-wins text overwrite. Consistency is achieved via CRDT merge semantics.

### 1.4 Current Frontend-to-MWS Integration Model

In the current prototype, frontend communicates with MWS Tables directly:

- reads spaces/nodes/datasheets/fields/views/records;
- creates records (`POST`);
- updates records (`PATCH`);
- maps returned IDs to editor block attrs.

This is acceptable for rapid prototyping, but creates known limits:

- API token exposure risk in browser environment;
- business orchestration is distributed across clients;
- complex multi-step operations are difficult to execute atomically.

---

## 2. Data Flow (Current)

### 2.1 Keystroke-to-Table Mutation Path

Below is the current end-to-end path from user action to data mutation in MWS Tables.

1. User types in editor or triggers slash command (for example, "insert table row").
2. Tiptap executes command and produces a ProseMirror transaction.
3. Transaction updates:
   - visible document state (local);
   - Yjs state (for collaboration).
4. Frontend tool handler decides a table operation is required.
5. Frontend builds MWS API request payload (using `fld...` keys).
6. Browser sends HTTP request to MWS Tables API.
7. MWS API returns mutation result (new/updated record metadata).
8. Frontend maps result to block attributes and updates editor JSON.
9. Updated editor state is propagated through Yjs/Hocuspocus to all active collaborators.

### 2.2 Current Data Shapes (Examples)

#### 2.2.1 Tiptap table embed block

```json
{
  "type": "mwsTableEmbed",
  "attrs": {
    "spaceId": "spcA1B2C3",
    "datasheetId": "dst9X8Y7",
    "viewId": "viw123",
    "selectedFieldIds": ["fldTitle", "fldOwner", "fldStatus"],
    "displayMode": "table",
    "lastSyncAt": "2026-04-11T10:15:12.000Z"
  }
}
```

#### 2.2.2 Current frontend direct mutation request to MWS

```json
{
  "records": [
    {
      "fields": {
        "fldTitle": "Подготовить демо",
        "fldOwner": "u_1024",
        "fldStatus": "In Progress"
      }
    }
  ],
  "fieldKey": "id"
}
```

---

## 3. Future Architecture (Frontend-Backend-AI Bridge)

## 3.1 Target Principle: Backend-as-Orchestrator

Target architecture moves all tool orchestration from frontend to backend.

Frontend becomes a thin client:

- sends user intent and page context;
- renders resulting document updates;
- never owns MWS API secrets.

Backend becomes orchestrator:

- executes AI function-calling loop;
- validates and executes tools against MWS API;
- writes authoritative collaborative updates back to Yjs/Hocuspocus.

### 3.2 Target Component Model

- Frontend:
  - Tiptap UI + slash/toolbar intents;
  - transport for command requests (`HTTP` or `WS`);
  - passive consumer of document updates from collab channel.
- Backend Orchestrator:
  - command intake API;
  - AI session manager (memory, context window, tool registry);
  - tool executor for MWS operations;
  - Yjs updater service (server-side document injections).
- AI Layer:
  - function calling decisions;
  - tool selection and parameter generation;
  - structured action plans.
- MWS API Adapter:
  - typed client for spaces/nodes/datasheets/fields/views/records;
  - idempotency wrappers and retry policies;
  - audit logs.

### 3.3 Frontend-Backend Contract (Tool Invocation API)

#### 3.3.1 Request Contract

`POST /api/v1/wiki/tools/execute`

```json
{
  "requestId": "req_01JQXYZ",
  "workspaceId": "ws_001",
  "pageId": "pg_42",
  "userId": "u_1024",
  "documentVersion": 187,
  "intent": {
    "type": "ai_table_assist",
    "command": "create_risk_table_from_text"
  },
  "context": {
    "selectionText": "Риски релиза: нет владельцев задач и дедлайнов",
    "documentSnapshot": {
      "type": "doc",
      "content": []
    }
  }
}
```

#### 3.3.2 Immediate Response Contract

```json
{
  "requestId": "req_01JQXYZ",
  "status": "accepted",
  "operationId": "op_9f8e7d",
  "estimatedMode": "async"
}
```

#### 3.3.3 Operation Event Contract (WS/SSE)

```json
{
  "operationId": "op_9f8e7d",
  "stage": "tool_executed",
  "tool": "create_records",
  "result": {
    "datasheetId": "dst9X8Y7",
    "createdRecordIds": ["rec001", "rec002"]
  }
}
```

### 3.4 Future Execution Chain (Authoritative)

1. Frontend sends intent + context to backend.
2. Backend sends structured prompt to AI with available tool schema.
3. AI returns function call(s), for example `create_table`, `create_records`, `patch_records`.
4. Backend validates tool call arguments against policy and schema.
5. Backend executes MWS API calls using server-side secret token.
6. Backend translates resulting entities into editor operations.
7. Backend writes operations to shared Yjs document via Hocuspocus integration.
8. All connected clients receive CRDT updates and render inserted/updated blocks.

Result: user sees table blocks appear in editor as collaborative updates, independent of local client state quality.

---

## 4. Implementation Strategy

### 4.1 Migration Stages

1. Extract frontend MWS calls to typed adapter interface.
2. Introduce backend tool execution API with no AI (deterministic commands only).
3. Move MWS credentials and request execution to backend.
4. Add AI function-calling loop behind feature flag.
5. Enable server-side Yjs patch/injection for tool results.
6. Remove direct browser access to privileged MWS mutations.

### 4.2 Backend Tool Runtime Design

Tool runtime should expose deterministic, composable operations.

Example internal backend tool registry:

```json
{
  "tools": [
    {
      "name": "create_datasheet",
      "inputSchema": {
        "type": "object",
        "required": ["spaceId", "name"],
        "properties": {
          "spaceId": { "type": "string" },
          "name": { "type": "string" }
        }
      }
    },
    {
      "name": "create_records",
      "inputSchema": {
        "type": "object",
        "required": ["datasheetId", "records"],
        "properties": {
          "datasheetId": { "type": "string" },
          "records": { "type": "array" }
        }
      }
    }
  ]
}
```

### 4.3 Editor Update Strategy: Command-Driven Frontend

Frontend should consume normalized editor commands generated by backend.

#### 4.3.1 Command Envelope Example

```json
{
  "type": "editor.apply",
  "pageId": "pg_42",
  "commands": [
    {
      "op": "insert_block",
      "position": 128,
      "node": {
        "type": "mwsTableEmbed",
        "attrs": {
          "spaceId": "spcA1B2C3",
          "datasheetId": "dst9X8Y7",
          "viewId": "viw123",
          "selectedFieldIds": ["fldTitle", "fldOwner", "fldStatus"],
          "displayMode": "table"
        }
      }
    }
  ]
}
```

Key outcome: frontend editor does not care whether command source is local slash handler or backend AI orchestration.

### 4.4 Yjs/Hocuspocus Integration Pattern for Server Commands

Backend should use one of two safe patterns:

- connect as technical collaborator client and submit Yjs transactions;
- or use Hocuspocus hooks/extensions to apply trusted server-side updates.

In both cases, updates must remain CRDT-native to preserve causality and merge guarantees.

---

## 5. Security and Scalability

### 5.1 Why Backend Tooling is Critical

Moving tools to backend is mandatory for production-level security:

- MWS API tokens never appear in browser code or network inspector.
- Access control is enforced centrally per user/workspace/page.
- Tool calls can be policy-checked (allowed tables, allowed operations, quotas).
- Audit trail can capture intent -> tool call -> external mutation -> editor patch.

### 5.2 Security Controls to Introduce

1. Secret management via vault/KMS, not `.env` in frontend.
2. Per-request authorization checks before any tool execution.
3. Tool argument validation against strict JSON schema.
4. Rate limits and anti-abuse controls for AI-triggered actions.
5. PII/log scrubbing in observability pipeline.

### 5.3 Scalability Controls

1. Async operation queue for long AI + tool chains.
2. Idempotency keys for retried requests.
3. Backpressure and timeout boundaries for MWS API adapter.
4. Horizontal scaling of stateless orchestrator workers.
5. Dedicated channel for operation progress events.

### 5.4 Consistency Strategy

For multi-step mutations (for example, create table + create 5 records + insert block):

- use orchestration transaction semantics at application level;
- persist step state machine;
- apply compensating actions on partial failure when true rollback is impossible.

This is significantly more robust than frontend-side chained requests under unstable network conditions.

---

## 6. Practical Target Sequence (What to Build Next)

1. Define backend API contract and command envelope.
2. Implement minimal orchestrator endpoint for deterministic table operations.
3. Add server-side Yjs update writer and verify live collaborative propagation.
4. Move existing frontend AI handlers behind backend proxy.
5. Enable AI function calling with bounded tool set (`create_datasheet`, `create_records`, `patch_records`, `insert_embed_block`).
6. Add observability: operation trace, tool latency, failure taxonomy.

---

## 7. Final Architectural Position

Current prototype correctly validates product hypothesis: Tiptap + Yjs can host live MWS table interactions.

Target production architecture should institutionalize this into a secure orchestration model where:

- frontend is a thin collaborative client;
- backend is the only execution authority for tools and MWS mutations;
- AI is a planner using bounded function calls;
- Yjs/Hocuspocus remains the real-time distribution fabric for all resulting document updates.

This keeps the demo flow fast while creating a clean path to enterprise-grade reliability, security, and scale.
