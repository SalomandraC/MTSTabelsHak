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

export type AuthSessionRefresh = RefreshResponse;

export type MeResponse = {
  user: {
    userId: string;
    clientId: string | null;
    displayName: string;
  };
};

export type LoginResponse =
  | { status: 'authorized' }
  | {
      status: 'display_name_required';
      profile: {
        userId: string;
        clientId: string | null;
        suggestedDisplayName: string | null;
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
  settings?: Record<string, boolean>;
};

export type PluginCatalogResponse = {
  plan: PluginPlan;
  items: PluginCatalogItem[];
};

let accessToken: string | null = null;
let activeUser: MeResponse['user'] | null = null;
let refreshInFlight: Promise<RefreshResponse | null> | null = null;

function getDemoUserFromUrl(): MeResponse['user'] | null {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('userId') ?? params.get('demoUserId');
  const displayName = params.get('userName') ?? params.get('demoUserName');

  if (!userId) {
    return null;
  }

  return {
    userId,
    clientId: null,
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
  role?: DocumentRole | null;
  canView?: boolean;
  canEdit?: boolean;
  isLocked?: boolean;
};

export type TemplateField = {
  key: string;
  label: string;
  description: string;
  kind: 'text' | 'multiline';
  required: boolean;
  defaultValue?: string;
};

export type TemplateAccessLevel = 'private' | 'space' | 'public';
export type TemplateSource = 'builtIn' | 'custom';

export type PageTemplateSummary = {
  id: string;
  title: string;
  summary: string;
  category: string;
  categoryId: string;
  audience: string;
  icon: string;
  fields: TemplateField[];
  accessLevel: TemplateAccessLevel;
  source: TemplateSource;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};

export type TemplateCategorySummary = {
  id: string;
  title: string;
};

export type TemplateListScope = 'all' | 'mine' | 'space';
export type TemplateListSort = 'relevance' | 'newest' | 'popular';

export type TemplateListQuery = {
  spaceId?: string | null;
  scope?: TemplateListScope;
  sort?: TemplateListSort;
  search?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
};

export type TemplateListResponse = {
  items: PageTemplateSummary[];
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
};

export type CreateTemplatePayload = {
  spaceId: string;
  title: string;
  summary?: string;
  categoryId: string;
  icon?: string;
  accessLevel: TemplateAccessLevel;
  pageTitleTemplate?: string;
  document: Record<string, unknown>;
};

export type UpdateTemplatePayload = {
  title?: string;
  summary?: string;
  categoryId?: string;
  icon?: string;
  accessLevel?: TemplateAccessLevel;
  pageTitleTemplate?: string;
  document?: Record<string, unknown> | null;
};

export type PageDocumentState = {
  encoding: 'base64-yjs-update-v2';
  value: string;
  serverVersion: number;
  checkpointId: string | null;
  persistedAt: string | null;
};

export type PageHistoryTrigger = 'editor_idle' | 'before_unload' | 'manual' | 'reconnect' | 'collab_store' | 'restore';

export type PageHistoryItem = {
  id: string;
  serverVersion: number;
  trigger: PageHistoryTrigger;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  excerpt: string | null;
  restoredFromCheckpointId: string | null;
};

export type PageHistoryCheckpoint = {
  checkpoint: PageHistoryItem;
  documentState: PageDocumentState;
  document: {
    type: string;
    content?: unknown[];
  };
};

export type PageEmbed = {
  id: string;
  type: 'mwsTableEmbed';
  title: string | null;
  datasheetId: string | null;
  viewId: string | null;
  displayMode: string | null;
};

export type DocumentRole = 'owner' | 'editor' | 'commentator' | 'guest';

export type DocumentCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canManageAccess: boolean;
  canDelete: boolean;
  canUseAi: boolean;
  canUseAdvancedPlugins: boolean;
};

export type DocumentAccessPolicy = {
  ownerUserId: string;
  viewAccess: 'owner_only' | 'space_members' | 'link_holders';
  commentAccess: 'owner_only' | 'space_members' | 'link_holders';
  editAccess: 'owner_only' | 'space_members' | 'link_holders';
};

export type DocumentAccessSummary = {
  role: DocumentRole | null;
  principal: 'authenticated' | 'anonymous';
  isSpaceMember: boolean;
  isOwner: boolean;
  capabilities: DocumentCapabilities;
  policy: DocumentAccessPolicy;
};

export type WikiPage = {
  id: string;
  title: string;
  icon: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  plainTextPreview: string | null;
  headingNumberingEnabled: boolean;
  outgoingLinksCount: number;
  backlinksCount: number;
  access?: DocumentAccessSummary;
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
  externalParentNodeId?: string | null;
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

export type CommentThreadStatus = 'open' | 'resolved';
export type CommentResolveReason = 'manual' | 'anchor_removed_by_restore';

export type PageCommentMessage = {
  id: string;
  threadId: string;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type PageCommentThread = {
  id: string;
  pageId: string;
  anchorText: string;
  status: CommentThreadStatus;
  createdBy: string;
  createdByName: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolvedReason: CommentResolveReason | null;
  createdAt: string;
  updatedAt: string;
  messages: PageCommentMessage[];
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
  access?: {
    role: DocumentRole | null;
    capabilities: DocumentCapabilities;
  };
  awareness?: {
    activeUsers?: PresenceUser[];
  };
};

export type WorkspaceRealtimeEvent =
  | {
      type: 'connected';
      spaceId: string;
    }
  | {
      type: 'page_access_updated';
      spaceId: string;
      pageId: string;
    }
  | {
      type: 'page_updated';
      spaceId: string;
      pageId: string;
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
  kind: 'mwsFolder' | 'mwsTable' | 'mwsNode' | 'wikiFolder' | 'wikiPage';
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

export type MwsCellValue = {
  cell: {
    datasheetId: string;
    recordId: string;
    fieldId: string;
    value: unknown;
    displayValue: string;
    updatedAt?: string | null;
  };
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

export type AiTransformType = 'professional' | 'shorten' | 'expand' | 'fix_grammar';
export type AiTransformStyleId = 'standard' | 'business' | 'military' | 'medieval' | 'church' | 'fix' | 'expand';

export type AiAutocompletePayload = {
  currentText: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
};

export type AiGeneratePayload = {
  prompt: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
};

export type AiTransformPayload = {
  text: string;
  transformation: AiTransformType;
  styleId?: AiTransformStyleId;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
};

export type AiChatPayload = {
  question: string;
  spaceId?: string;
  contextScope?: 'currentFile' | 'documents' | 'folders' | 'space';
  pageId?: string;
  datasheetId?: string;
  viewId?: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
  selectedPageIds?: string[];
  selectedFolderIds?: string[];
  contextDocuments?: Array<{
    pageId: string;
    title: string;
    markdown: string;
  }>;
  workspaceStructure?: {
    scope: 'currentFile' | 'documents' | 'folders' | 'space';
    spaceId: string;
    truncated?: boolean;
    nodes: Array<{
      id: string;
      title: string;
      kind: string;
      parentId: string | null;
      depth: number;
    }>;
  };
  useVectorSearch?: boolean;
};

export type SearchDocumentsPayload = {
  spaceId: string;
  query: string;
  pageIds?: string[];
  folderIds?: string[];
  topK?: number;
};

export type SearchDocumentsResponse = {
  items: Array<{
    pageId: string;
    title: string;
    snippet: string;
    score: number;
    chunkIndex: number;
  }>;
};

export type AiGenerateResponse = {
  document: {
    type: 'doc';
    content: unknown[];
  };
};

export type AiChatResponse = {
  answer: string;
  needsRefresh?: boolean;
  usedTools?: Array<{ toolName: string; args: Record<string, unknown> }>;
  contextMarkdown?: string;
  references?: Array<Record<string, unknown>>;
};

export type AiExecuteToolPayload = {
  toolName: string;
  args: Record<string, unknown>;
  pageId?: string;
  workspaceId?: string;
};

export type AiExecuteToolResponse = {
  ok: boolean;
  toolName: string;
  data?: Record<string, unknown>;
  canonicalRecords?: Array<{
    recordId: string;
    fields: Record<string, unknown>;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>;
  error?: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
  };
};

export type AiPlanMutationPayload = {
  operation: 'create_records' | 'add_table_column';
  prompt: string;
  spaceId: string;
  datasheetId: string;
  viewId?: string;
  tableSnapshot?: {
    datasheetId?: string;
    viewId?: string | null;
    fields?: Array<Record<string, unknown>>;
    records?: Array<Record<string, unknown>>;
    total?: number;
    updatedAt?: number;
  };
};

export type AiPlanMutationResponse = {
  toolName: 'create_records' | 'add_table_column';
  args: Record<string, unknown>;
  summary: string;
};

export type AiPlanWorkflowPayload = {
  prompt: string;
  spaceId: string;
  datasheetId: string;
  viewId?: string;
  tableSnapshot?: {
    datasheetId?: string;
    viewId?: string | null;
    fields?: Array<Record<string, unknown>>;
    records?: Array<Record<string, unknown>>;
    total?: number;
    updatedAt?: number;
  };
};

export type AiPlanWorkflowResponse = {
  summary: string;
  commands: Array<
    | {
        type: 'ADD_COLUMN';
        column: {
          name: string;
          type: string;
          property?: Record<string, unknown>;
        };
      }
    | {
        type: 'ADD_ROW';
        rows: Array<{ fields: Record<string, unknown> }>;
      }
    | {
        type: 'UPDATE_RECORDS';
        records: Array<{ recordId: string; fields: Record<string, unknown> }>;
      }
  >;
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

async function refreshAccessToken(): Promise<RefreshResponse | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
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
      return payload;
    } catch {
      setAccessToken(null);
      setActiveUser(null);
      return null;
    }
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
    const session = await refreshAccessToken();
    if (session?.accessToken) {
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

  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return undefined as T;
  }

  const payloadText = await response.text();
  if (!payloadText.trim()) {
    return undefined as T;
  }

  return JSON.parse(payloadText) as T;
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
  async login(apiKey: string, displayName?: string) {
    return request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      authMode: 'none',
      body: JSON.stringify({ apiKey, displayName }),
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
  async updateMeDisplayName(displayName: string) {
    const response = await request<MeResponse>('/api/v1/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
    setActiveUser(response.user);
    return response;
  },
  async restoreSession() {
    const session = await refreshAccessToken();
    if (!session) {
      if (!getDemoUserFromUrl()) {
        return null;
      }

      try {
        const me = await this.getMe();
        return {
          user: me.user,
          expiresInSec: null,
        };
      } catch {
        return null;
      }
    }

    const me = await this.getMe();
    return {
      user: me.user,
      expiresInSec: session.expiresInSec,
    };
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
  updatePluginSettings(pluginId: string, settings: Record<string, boolean>) {
    return request<PluginCatalogResponse>(`/api/v1/plugins/${pluginId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
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
  createPage(spaceId: string, title: string, parentNodeId?: string | null, externalParentNodeId?: string | null) {
    return request<{ page: PageSummary }>('/api/v1/pages', {
      method: 'POST',
      body: JSON.stringify({
        spaceId,
        title,
        icon: 'doc',
        parentNodeId: parentNodeId ?? null,
        externalParentNodeId: externalParentNodeId ?? null,
      }),
    });
  },
  listTemplates(query?: TemplateListQuery) {
    return request<TemplateListResponse>('/api/v1/templates', {
      query: {
        spaceId: query?.spaceId ?? undefined,
        scope: query?.scope ?? undefined,
        sort: query?.sort ?? undefined,
        search: query?.search ?? undefined,
        categoryId: query?.categoryId ?? undefined,
        page: query?.page ?? undefined,
        pageSize: query?.pageSize ?? undefined,
      },
    });
  },
  listTemplateCategories() {
    return request<{ items: TemplateCategorySummary[] }>('/api/v1/templates/categories');
  },
  createTemplate(payload: CreateTemplatePayload) {
    return request<{ template: PageTemplateSummary }>('/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: payload.spaceId,
        title: payload.title,
        summary: payload.summary,
        categoryId: payload.categoryId,
        icon: payload.icon,
        accessLevel: payload.accessLevel,
        pageTitleTemplate: payload.pageTitleTemplate,
        document: payload.document,
      }),
    });
  },
  updateTemplate(templateId: string, payload: UpdateTemplatePayload) {
    return request<{ template: PageTemplateSummary }>(`/api/v1/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteTemplate(templateId: string) {
    return request<void>(`/api/v1/templates/${templateId}`, {
      method: 'DELETE',
    });
  },
  instantiateTemplate(templateId: string, payload: {
    spaceId: string;
    parentNodeId?: string | null;
    title?: string;
    values: Record<string, string>;
  }) {
    return request<{ page: PageSummary }>(`/api/v1/templates/${templateId}/instantiate`, {
      method: 'POST',
      body: JSON.stringify({
        spaceId: payload.spaceId,
        parentNodeId: payload.parentNodeId ?? null,
        title: payload.title?.trim() || undefined,
        values: payload.values,
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
        externalParentNodeId: payload.externalParentNodeId ?? null,
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
  moveNode(nodeId: string, payload: { targetParentId?: string | null; targetExternalParentNodeId?: string | null }) {
    return request<{ node: WikiTreeNode }>(`/api/v1/nodes/${nodeId}/move`, {
      method: 'POST',
      body: JSON.stringify({
        targetParentId: payload.targetParentId ?? null,
        targetExternalParentNodeId: payload.targetExternalParentNodeId ?? null,
      }),
    });
  },
  getPage(pageId: string) {
    return request<{ page: WikiPage }>(`/api/v1/pages/${pageId}`, {
      query: { includeDocumentState: true },
    });
  },
  getPageAccess(pageId: string) {
    return request<{ access: DocumentAccessSummary }>(`/api/v1/pages/${pageId}/access`);
  },
  updatePage(
    pageId: string,
    payload: { title?: string; icon?: string | null; headingNumberingEnabled?: boolean },
  ) {
    return request<{ page: WikiPage }>(`/api/v1/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  updatePageAccess(pageId: string, payload: DocumentAccessPolicy) {
    return request<{ access: DocumentAccessSummary }>(`/api/v1/pages/${pageId}/access`, {
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
  getComments(pageId: string, includeResolved = true) {
    return request<{ items: PageCommentThread[] }>(`/api/v1/pages/${pageId}/comments`, {
      query: { includeResolved },
    });
  },
  createCommentThread(pageId: string, payload: { threadId: string; anchorText: string; body: string }) {
    return request<{ thread: PageCommentThread }>(`/api/v1/pages/${pageId}/comments/threads`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  addCommentMessage(pageId: string, threadId: string, payload: { body: string }) {
    return request<{ thread: PageCommentThread }>(`/api/v1/pages/${pageId}/comments/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateCommentMessage(pageId: string, threadId: string, messageId: string, payload: { body: string }) {
    return request<{ thread: PageCommentThread }>(`/api/v1/pages/${pageId}/comments/threads/${threadId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteCommentMessage(pageId: string, threadId: string, messageId: string) {
    return request<{ thread: PageCommentThread }>(`/api/v1/pages/${pageId}/comments/threads/${threadId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  },
  updateCommentThread(pageId: string, threadId: string, payload: { status: CommentThreadStatus }) {
    return request<{ thread: PageCommentThread }>(`/api/v1/pages/${pageId}/comments/threads/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  openCollabSession(pageId: string, payload: {
    clientId: string;
    deviceId: string;
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
        },
        localDraftAvailable: payload.localDraftAvailable,
        lastCheckpointId: payload.lastCheckpointId,
        knownServerVersion: payload.knownServerVersion,
      }),
    });
  },
  openWorkspaceRealtime(
    spaceId: string,
    handlers: {
      onMessage: (event: WorkspaceRealtimeEvent) => void;
      onError?: () => void;
    },
  ) {
    const wsBaseUrl = API_BASE_URL.replace(/^http/i, 'ws');
    const socket = new WebSocket(`${wsBaseUrl}/api/v1/realtime${toQueryString({ spaceId })}`);

    socket.addEventListener('message', (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data) as WorkspaceRealtimeEvent);
      } catch {
        handlers.onError?.();
      }
    });

    socket.addEventListener('error', () => {
      handlers.onError?.();
    });

    return {
      close() {
        socket.close();
      },
    };
  },
  createCheckpoint(
    pageId: string,
    value: string,
    trigger: 'editor-idle' | 'manual' | 'before-unload' | 'reconnect' | 'restore' = 'editor-idle',
    restoredFromCheckpointId?: string | null,
  ) {
    return request<{ checkpointId: string; persistedAt: string; serverVersion: number }>(
      `/api/v1/pages/${pageId}/checkpoints`,
      {
        method: 'POST',
        body: JSON.stringify({
          trigger,
          restoredFromCheckpointId: restoredFromCheckpointId ?? undefined,
          documentState: {
            encoding: 'base64-yjs-update-v2',
            value,
          },
        }),
      },
    );
  },
  listPageHistory(pageId: string, limit = 50) {
    return request<{ items: PageHistoryItem[] }>(`/api/v1/pages/${pageId}/history`, {
      query: { limit },
    });
  },
  getPageHistoryCheckpoint(pageId: string, checkpointId: string) {
    return request<PageHistoryCheckpoint>(`/api/v1/pages/${pageId}/history/${checkpointId}`);
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
  getMwsCellValue(datasheetId: string, recordId: string, fieldId: string) {
    return request<MwsCellValue>(`/api/v1/mws/datasheets/${datasheetId}/records/${recordId}/fields/${fieldId}`);
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
      const session = await refreshAccessToken();
      if (session?.accessToken) {
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
      const session = await refreshAccessToken();
      if (session?.accessToken) {
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
  searchDocuments(payload: SearchDocumentsPayload) {
    return requestWithAuth<SearchDocumentsResponse>('/api/v1/search/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiExecuteTool(payload: AiExecuteToolPayload) {
    return requestWithAuth<AiExecuteToolResponse>('/api/v1/ai/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiPlanMutation(payload: AiPlanMutationPayload) {
    return requestWithAuth<AiPlanMutationResponse>('/api/v1/ai/plan-mutation', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  aiPlanWorkflow(payload: AiPlanWorkflowPayload) {
    return requestWithAuth<AiPlanWorkflowResponse>('/api/v1/ai/plan-workflow', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
