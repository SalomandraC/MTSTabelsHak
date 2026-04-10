export interface CanonicalMwsRecord {
  recordId: string;
  fields: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SmartImportCandidate {
  score: number;
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  viewId?: string | null;
  selectedFieldIds: string[];
  reason: string;
}

export interface EditorCommandEnvelope {
  type: 'editor.apply';
  pageId?: string;
  commands: Array<Record<string, unknown>>;
}

export interface ToolExecutionSuccess {
  ok: true;
  toolName: string;
  data: Record<string, unknown>;
  canonicalRecords?: CanonicalMwsRecord[];
  editorCommand?: EditorCommandEnvelope;
}

export interface ToolExecutionFailure {
  ok: false;
  toolName: string;
  error: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
  };
}

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

export interface ToolExecutionContext {
  pageId?: string;
  workspaceId?: string;
  applyToDocument?: boolean;
}