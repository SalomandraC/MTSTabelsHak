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

export type PluginPlan = {
  id: 'free' | 'pro' | 'enterprise';
  title: string;
  description: string;
};

export type PluginCatalogItem = {
  id: string;
  title: string;
  description: string;
  category: 'core' | 'insights' | 'assistant' | 'collaboration';
  kind: 'core' | 'optional';
  placement: string[];
  requiredPlans: string[];
  implemented: boolean;
  enabled: boolean;
  canToggle: boolean;
  status: 'core' | 'enabled' | 'available' | 'locked' | 'comingSoon';
  lockedReason: string | null;
};

export type PluginCatalogResponse = {
  plan: PluginPlan;
  items: PluginCatalogItem[];
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
  spaceId?: string | null;
  parentId?: string | null;
  path?: string[];
  datasheetId?: string | null;
  dstId?: string | null;
  openInMwsUrl?: string | null;
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

export type WorkspaceTreeNode = {
  id: string;
  kind: 'mwsFolder' | 'mwsTable' | 'mwsNode' | 'wikiPage';
  title: string;
  spaceId: string;
  parentId: string | null;
  children: WorkspaceTreeNode[];
  mwsNode?: MwsNode;
  wikiPage?: PageSummary;
  datasheetId?: string | null;
  linkedPageId?: string | null;
  openInMwsUrl?: string | null;
};

export type MwsField = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  property?: Record<string, unknown>;
};

export type CreateMwsFieldPayload = {
  spaceId: string;
  name: string;
  type: string;
  property?: Record<string, unknown>;
};

export type UploadMwsAttachmentPayload = {
  file: File;
  recordId?: string | null;
  fieldId?: string | null;
};

export type DownloadMwsAttachmentPayload = {
  token: string;
  fileName?: string | null;
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
  sort?: Array<{
    fieldId: string;
    desc: boolean;
  }>;
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
  listPlugins() {
    return request<PluginCatalogResponse>('/api/v1/plugins/catalog');
  },
  activatePlugin(pluginId: string) {
    return request<PluginCatalogResponse>(`/api/v1/plugins/${pluginId}/activate`, {
      method: 'POST',
    });
  },
  deactivatePlugin(pluginId: string) {
    return request<PluginCatalogResponse>(`/api/v1/plugins/${pluginId}/deactivate`, {
      method: 'POST',
    });
  },
  listPages(spaceId: string, query = '') {
    return request<{ items: PageSummary[] }>('/api/v1/pages', {
      query: { spaceId, query, limit: 30 },
    });
  },
  getWikiTree(spaceId: string) {
    return request<{ items: WikiTreeNode[] }>(`/api/v1/spaces/${spaceId}/wiki/tree`);
  },
  getWorkspaceTree(spaceId: string) {
    return request<{ items: WorkspaceTreeNode[] }>(`/api/v1/spaces/${spaceId}/workspace/tree`);
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
  createMwsField(datasheetId: string, payload: CreateMwsFieldPayload) {
    return request<{ field: MwsField }>(`/api/v1/mws/datasheets/${datasheetId}/fields`, {
      method: 'POST',
      query: { spaceId: payload.spaceId },
      body: JSON.stringify({
        name: payload.name,
        type: payload.type,
        property: payload.property,
      }),
    });
  },
  deleteMwsField(datasheetId: string, fieldId: string, spaceId: string) {
    return request<{ deleted: boolean }>(`/api/v1/mws/datasheets/${datasheetId}/fields/${fieldId}`, {
      method: 'DELETE',
      query: { spaceId },
    });
  },
  moveMwsField(datasheetId: string, viewId: string, fieldId: string, index: number) {
    return request<{ moved: boolean }>(`/api/v1/mws/datasheets/${datasheetId}/views/${viewId}/fields/${fieldId}/index`, {
      method: 'PATCH',
      body: JSON.stringify({ index }),
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
    sort?: Array<{
      fieldId: string;
      desc: boolean;
    }>;
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
        sort: query.sort ? JSON.stringify(query.sort) : undefined,
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
  deleteMwsDatasheet(spaceId: string, datasheetId: string) {
    return request<{ deleted: boolean }>(`/api/v1/mws/spaces/${spaceId}/datasheets/${datasheetId}`, {
      method: 'DELETE',
    });
  },
  async uploadMwsAttachment(
    datasheetId: string,
    payload: UploadMwsAttachmentPayload,
  ): Promise<{
    attachment: {
      token?: string;
      name?: string;
      mimeType?: string;
      size?: number;
      url?: string;
    };
  }> {
    const demoUser = getDemoUserFromUrl();
    const formData = new FormData();
    formData.append('file', payload.file);

    const headers = new Headers();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    } else if (demoUser) {
      headers.set('x-user-id', demoUser.userId);
      headers.set('x-user-name', demoUser.displayName);
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/mws/datasheets/${datasheetId}/attachments${toQueryString({
        recordId: payload.recordId,
        fieldId: payload.fieldId,
      })}`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      },
    );

    if (response.status === 401) {
      const token = await refreshAccessToken();
      if (token) {
        return this.uploadMwsAttachment(datasheetId, payload);
      }
    }

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }
    return response.json() as Promise<{
      attachment: {
        token?: string;
        name?: string;
        mimeType?: string;
        size?: number;
        url?: string;
      };
    }>;
  },
  async downloadMwsAttachment(datasheetId: string, payload: DownloadMwsAttachmentPayload): Promise<void> {
    const demoUser = getDemoUserFromUrl();
    const headers = new Headers();

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    } else if (demoUser) {
      headers.set('x-user-id', demoUser.userId);
      headers.set('x-user-name', demoUser.displayName);
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/mws/datasheets/${datasheetId}/attachments${toQueryString({ token: payload.token })}`,
      {
        method: 'GET',
        credentials: 'include',
        headers,
      },
    );

    if (response.status === 401) {
      const token = await refreshAccessToken();
      if (token) {
        return this.downloadMwsAttachment(datasheetId, payload);
      }
    }

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = payload.fileName?.trim() || `attachment-${Date.now()}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  },
  resolveTableEmbed(payload: ResolveTableEmbedRequest) {
    return request<ResolveTableEmbedResponse>('/api/v1/mws/table-embeds/resolve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createMwsTablePage(payload: { spaceId: string; nodeId: string; datasheetId?: string | null; title?: string }) {
    return request<{ page: PageSummary; node: MwsNode; created: boolean; openInMwsUrl: string | null }>('/api/v1/mws/table-pages', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: payload.spaceId,
        nodeId: payload.nodeId,
        datasheetId: payload.datasheetId ?? undefined,
        title: payload.title,
      }),
    });
  },
};
