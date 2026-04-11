const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
export const DEFAULT_WIKILIVE_SPACE_ID = import.meta.env.VITE_WIKILIVE_SPACE_ID ?? 'demo-space';

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | null | undefined>;
  skipAuthRetry?: boolean;
  authMode?: 'required' | 'none';
};

type RefreshResponse = {
  accessToken: string;
  expiresInSec: number;
};

export type MeResponse = {
  user: {
    userId: string;
    displayName: string;
  };
};

let accessToken: string | null = null;
let activeUser: MeResponse['user'] | null = null;
let refreshInFlight: Promise<string | null> | null = null;

function getDemoUserFromUrl(): MeResponse['user'] | null {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('userId') ?? params.get('demoUserId');
  const displayName = params.get('userName') ?? params.get('demoUserName');

  if (!userId) {
    return null;
  }

  return {
    userId,
    displayName: displayName ?? `User ${userId.slice(0, 8)}`,
  };
}

export type PageSummary = {
  id: string;
  title: string;
  icon: string | null;
  excerpt: string | null;
  createdAt: string;
  updatedAt: string;
  backlinksCount: number;
};

export type PageDocumentState = {
  encoding: 'base64-yjs-update-v2';
  value: string;
  serverVersion: number;
  checkpointId: string | null;
  persistedAt: string | null;
};

export type PageEmbed = {
  id: string;
  type: 'mwsTableEmbed';
  title: string | null;
  datasheetId: string | null;
  viewId: string | null;
  displayMode: string | null;
};

export type WikiPage = {
  id: string;
  title: string;
  icon: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  plainTextPreview: string | null;
  outgoingLinksCount: number;
  backlinksCount: number;
  embeds: PageEmbed[];
  documentState?: PageDocumentState;
};

export type WikiTreeNode = {
  id: string;
  spaceId: string;
  type: 'folder' | 'page';
  title: string;
  icon: string | null;
  parentId: string | null;
  position: number;
  isArchived: boolean;
  children: WikiTreeNode[];
};

export type CreateFolderPayload = {
  spaceId: string;
  title: string;
  parentNodeId?: string | null;
  icon?: string | null;
};

export type Backlink = {
  pageId: string;
  title: string;
  excerpt: string | null;
  updatedAt: string;
};

export type OutgoingLink = {
  targetPageId: string;
  targetTitle: string;
  mentionCount: number;
};

export type PresenceUser = {
  userId: string;
  displayName: string;
  color: string;
  avatarUrl?: string | null;
};

export type CollabSession = {
  sessionId: string;
  websocket: {
    url: string;
    documentName?: string;
    token: string;
    heartbeatIntervalSec: number;
  };
  documentState: PageDocumentState;
  awareness?: {
    activeUsers?: PresenceUser[];
  };
};

export type MwsSpace = {
  id: string;
  name: string;
  isAdmin?: boolean | null;
};

export type MwsNode = {
  id: string;
  name: string;
  type: string;
  parentId?: string | null;
  path?: string[];
  datasheetId?: string | null;
  dstId?: string | null;
  icon?: string | null;
  isFav?: boolean | null;
  permission?: number | null;
  capabilities?: {
    canRead?: boolean;
    canInlineEdit?: boolean;
    canCreateRecords?: boolean;
    canDeleteRecords?: boolean;
  };
  children?: MwsNode[];
};

export type MwsField = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  property?: Record<string, unknown>;
};

export type MwsView = {
  id: string;
  name: string;
  type: string;
};

export type MwsRecord = {
  recordId: string;
  fields: Record<string, unknown>;
  createdAt?: number | null;
  updatedAt?: number | null;
};

export type MwsRecordList = {
  items: MwsRecord[];
  pageNum: number;
  pageSize: number;
  total: number;
};

export type CreateMwsRecordsPayload = {
  fieldKey: 'id' | 'name';
  records: Array<{ fields: Record<string, unknown> }>;
};

export type UpdateMwsRecordsPayload = {
  fieldKey: 'id' | 'name';
  records: Array<{ recordId: string; fields: Record<string, unknown> }>;
};

export type ResolveTableEmbedRequest = {
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  viewId?: string | null;
  selectedFieldIds?: string[];
  displayMode?: string;
  pageSize?: number;
  filterByFormula?: string | null;
  allowInlineEdit?: boolean;
};

export type ResolveTableEmbedResponse = {
  embed: {
    node: MwsNode;
    datasheetId: string;
    view?: MwsView | null;
    views?: MwsView[];
    fields: MwsField[];
    preview: MwsRecordList;
    total?: number;
    capabilities?: {
      canInlineEdit?: boolean;
      canCreateRecords?: boolean;
      canDeleteRecords?: boolean;
      canUploadAttachments?: boolean;
    };
    openInMwsUrl?: string | null;
  };
};

export type AiTransformType = 'professional' | 'shorten' | 'expand' | 'fix_grammar';

export type AiAutocompletePayload = {
  currentText: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown>;
};

export type AiGeneratePayload = {
  prompt: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown>;
};

export type AiTransformPayload = {
  text: string;
  transformation: AiTransformType;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown>;
};

export type AiChatPayload = {
  question: string;
  pageId?: string;
  datasheetId?: string;
  viewId?: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown>;
};

export type AiGenerateResponse = {
  document: {
    type: 'doc';
    content: unknown[];
  };
};

export type AiChatResponse = {
  answer: string;
  usedTools?: Array<{ toolName: string; args: Record<string, unknown> }>;
  contextMarkdown?: string;
  references?: Array<Record<string, unknown>>;
};

function toQueryString(query: RequestOptions['query']) {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const value = (payload as { message?: unknown }).message;
    if (typeof value === 'string') {
      return value;
    }
  }

  return fallback;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;
  try {
    return readErrorMessage(await response.json(), fallback);
  } catch {
    return fallback;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function getCurrentUser() {
  return activeUser ?? getDemoUserFromUrl();
}

function setAccessToken(token: string | null): void {
  accessToken = token;
}

function setActiveUser(user: MeResponse['user'] | null): void {
  activeUser = user;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      setAccessToken(null);
      setActiveUser(null);
      return null;
    }

    const payload = (await response.json()) as RefreshResponse;
    setAccessToken(payload.accessToken);
    return payload.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, body, skipAuthRetry, authMode = 'required', ...init } = options;
  const demoUser = getDemoUserFromUrl();

  let requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(headers ?? {}),
  };

  if (authMode === 'required' && !accessToken && demoUser) {
    requestHeaders = {
      ...requestHeaders,
      'x-user-id': demoUser.userId,
      'x-user-name': demoUser.displayName,
    };
  }

  if (authMode === 'required' && accessToken) {
    requestHeaders = {
      ...requestHeaders,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  const response = await fetch(`${API_BASE_URL}${path}${toQueryString(query)}`, {
    ...init,
    body,
    credentials: 'include',
    headers: requestHeaders,
  });

  const isAuthEndpoint = path.startsWith('/api/v1/auth/');
  if (response.status === 401 && authMode === 'required' && !skipAuthRetry && !isAuthEndpoint) {
    const token = await refreshAccessToken();
    if (token) {
      return request<T>(path, {
        ...options,
        skipAuthRetry: true,
      });
    }
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function requestWithAuth<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!accessToken) {
    await refreshAccessToken();
  }

  return request<T>(path, {
    ...options,
    authMode: 'required',
  });
}

export const wikiliveApi = {
  async login(apiKey: string) {
    await request<void>('/api/v1/auth/login', {
      method: 'POST',
      authMode: 'none',
      body: JSON.stringify({ apiKey }),
    });
  },
  async refreshSession() {
    return refreshAccessToken();
  },
  async logout() {
    setAccessToken(null);
    setActiveUser(null);
    await request<void>('/api/v1/auth/logout', {
      method: 'POST',
      authMode: 'none',
    });
  },
  async getMe() {
    const response = await request<MeResponse>('/api/v1/me');
    setActiveUser(response.user);
    return response;
  },
  async restoreSession() {
    const token = await refreshAccessToken();
    if (!token) {
      if (!getDemoUserFromUrl()) {
        return null;
      }

      try {
        const me = await this.getMe();
        return me.user;
      } catch {
        return null;
      }
    }

    const me = await this.getMe();
    return me.user;
  },
  listPages(spaceId: string, query = '') {
    return request<{ items: PageSummary[] }>('/api/v1/pages', {
      query: { spaceId, query, limit: 30 },
    });
  },
  getWikiTree(spaceId: string) {
    return request<{ items: WikiTreeNode[] }>(`/api/v1/spaces/${spaceId}/wiki/tree`);
  },
  createPage(spaceId: string, title: string, parentNodeId?: string | null) {
    return request<{ page: PageSummary }>('/api/v1/pages', {
      method: 'POST',
      body: JSON.stringify({
        spaceId,
        title,
        icon: 'doc',
        parentNodeId: parentNodeId ?? null,
      }),
    });
  },
  createFolder(payload: CreateFolderPayload) {
    return request<{ folder: WikiTreeNode }>('/api/v1/folders', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: payload.spaceId,
        title: payload.title,
        icon: payload.icon ?? 'folder',
        parentNodeId: payload.parentNodeId ?? null,
      }),
    });
  },
  updateFolder(folderId: string, payload: { title?: string; icon?: string | null; isArchived?: boolean }) {
    return request<{ folder: WikiTreeNode }>(`/api/v1/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteFolder(folderId: string) {
    return request<void>(`/api/v1/folders/${folderId}`, {
      method: 'DELETE',
    });
  },
  moveNode(nodeId: string, payload: { targetParentId?: string | null; position?: number }) {
    return request<{ node: WikiTreeNode }>(`/api/v1/nodes/${nodeId}/move`, {
      method: 'POST',
      body: JSON.stringify({
        targetParentId: payload.targetParentId ?? null,
        position: payload.position,
      }),
    });
  },
  getPage(pageId: string) {
    return request<{ page: WikiPage }>(`/api/v1/pages/${pageId}`, {
      query: { includeDocumentState: true },
    });
  },
  updatePage(pageId: string, payload: { title?: string; icon?: string | null }) {
    return request<{ page: WikiPage }>(`/api/v1/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deletePage(pageId: string) {
    return request<void>(`/api/v1/pages/${pageId}`, {
      method: 'DELETE',
    });
  },
  getBacklinks(pageId: string) {
    return request<{ items: Backlink[]; total: number }>(`/api/v1/pages/${pageId}/backlinks`);
  },
  getOutgoingLinks(pageId: string) {
    return request<{ items: OutgoingLink[] }>(`/api/v1/pages/${pageId}/outgoing-links`);
  },
  openCollabSession(pageId: string, payload: {
    clientId: string;
    deviceId: string;
    userDisplayName: string;
    localDraftAvailable: boolean;
    lastCheckpointId?: string | null;
    knownServerVersion?: number | null;
  }) {
    return request<CollabSession>(`/api/v1/pages/${pageId}/collab/session`, {
      method: 'POST',
      body: JSON.stringify({
        client: {
          clientId: payload.clientId,
          deviceId: payload.deviceId,
          editorVersion: 'wikilive-tiptap-mvp',
          userDisplayName: payload.userDisplayName,
        },
        localDraftAvailable: payload.localDraftAvailable,
        lastCheckpointId: payload.lastCheckpointId,
        knownServerVersion: payload.knownServerVersion,
      }),
    });
  },
  createCheckpoint(pageId: string, value: string, trigger: 'editor-idle' | 'manual' | 'before-unload' | 'reconnect' = 'editor-idle') {
    return request<{ checkpointId: string; persistedAt: string; serverVersion: number }>(
      `/api/v1/pages/${pageId}/checkpoints`,
      {
        method: 'POST',
        body: JSON.stringify({
          trigger,
          documentState: {
            encoding: 'base64-yjs-update-v2',
            value,
          },
        }),
      },
    );
  },
  listMwsSpaces() {
    return request<{ items: MwsSpace[] }>('/api/v1/mws/spaces');
  },
  listMwsNodes(spaceId: string, type?: string) {
    return request<{ items: MwsNode[] }>(`/api/v1/mws/spaces/${spaceId}/nodes`, {
      query: { includeChildren: true, type },
    });
  },
  listMwsFields(datasheetId: string, viewId?: string | null) {
    return request<{ items: MwsField[] }>(`/api/v1/mws/datasheets/${datasheetId}/fields`, {
      query: { viewId },
    });
  },
  listMwsViews(datasheetId: string) {
    return request<{ items: MwsView[] }>(`/api/v1/mws/datasheets/${datasheetId}/views`);
  },
  listMwsRecords(datasheetId: string, query: {
    viewId?: string | null;
    pageSize?: number;
    pageNum?: number;
    fields?: string[];
    filterByFormula?: string | null;
  } = {}) {
    return request<MwsRecordList>(`/api/v1/mws/datasheets/${datasheetId}/records`, {
      query: {
        viewId: query.viewId,
        pageSize: query.pageSize,
        pageNum: query.pageNum,
        fields: query.fields?.join(','),
        filterByFormula: query.filterByFormula,
        fieldKey: 'id',
        cellFormat: 'json',
      },
    });
  },
  createMwsRecords(datasheetId: string, payload: CreateMwsRecordsPayload) {
    return request<{ items: MwsRecord[] }>(`/api/v1/mws/datasheets/${datasheetId}/records`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMwsRecords(datasheetId: string, payload: UpdateMwsRecordsPayload) {
    return request<{ items: MwsRecord[] }>(`/api/v1/mws/datasheets/${datasheetId}/records`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteMwsRecords(datasheetId: string, recordIds: string[]) {
    return request<{ deleted: boolean }>(`/api/v1/mws/datasheets/${datasheetId}/records`, {
      method: 'DELETE',
      query: { recordIds: recordIds.join(',') },
    });
  },
  resolveTableEmbed(payload: ResolveTableEmbedRequest) {
    return request<ResolveTableEmbedResponse>('/api/v1/mws/table-embeds/resolve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiAutocomplete(payload: AiAutocompletePayload) {
    return requestWithAuth<{ text: string }>('/api/v1/ai/autocomplete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiGenerate(payload: AiGeneratePayload) {
    return requestWithAuth<AiGenerateResponse>('/api/v1/ai/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiTransform(payload: AiTransformPayload) {
    return requestWithAuth<{ text: string }>('/api/v1/ai/transform', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiChat(payload: AiChatPayload) {
    return requestWithAuth<AiChatResponse>('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
