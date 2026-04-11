const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
export const WIKILIVE_SPACE_ID = import.meta.env.VITE_WIKILIVE_SPACE_ID ?? 'demo-space';

const DEMO_USER_ID = import.meta.env.VITE_DEMO_USER_ID ?? 'demo-user-1';
const DEMO_USER_NAME = import.meta.env.VITE_DEMO_USER_NAME ?? 'Demo User';

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | null | undefined>;
};

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
  datasheetId?: string | null;
  dstId?: string | null;
  icon?: string | null;
  isFav?: boolean | null;
  permission?: number | null;
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
    fields: MwsField[];
    preview: MwsRecordList;
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, body, ...init } = options;
  const response = await fetch(`${API_BASE_URL}${path}${toQueryString(query)}`, {
    ...init,
    body,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': DEMO_USER_ID,
      'x-user-name': DEMO_USER_NAME,
      ...headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const error = (await response.json()) as { message?: string };
      message = error.message ?? message;
    } catch {
      // Keep fallback message when backend returns non-JSON error body.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const wikiliveApi = {
  listPages(query = '') {
    return request<{ items: PageSummary[] }>('/api/v1/pages', {
      query: { spaceId: WIKILIVE_SPACE_ID, query, limit: 30 },
    });
  },
  getWikiTree() {
    return request<{ items: WikiTreeNode[] }>(`/api/v1/spaces/${WIKILIVE_SPACE_ID}/wiki/tree`);
  },
  createPage(title: string, parentNodeId?: string | null) {
    return request<{ page: PageSummary }>('/api/v1/pages', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: WIKILIVE_SPACE_ID,
        title,
        icon: 'doc',
        parentNodeId: parentNodeId ?? null,
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
  listMwsNodes(spaceId: string) {
    return request<{ items: MwsNode[] }>(`/api/v1/mws/spaces/${spaceId}/nodes`, {
      query: { includeChildren: true },
    });
  },
  resolveTableEmbed(payload: ResolveTableEmbedRequest) {
    return request<ResolveTableEmbedResponse>('/api/v1/mws/table-embeds/resolve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
