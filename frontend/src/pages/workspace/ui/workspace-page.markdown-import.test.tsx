import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspacePage } from './workspace-page';
import { wikiliveApi } from '../../../shared/api/wikilive';

let isLeftSidebarCollapsed = false;
let importedPageVisible = false;
let latestPageEditorProps: Record<string, unknown> | null = null;

vi.mock('../../../features/auth', () => ({
  useAuthSessionContext: () => ({
    displayName: 'Demo User',
    handleLogout: vi.fn(),
    handleUpdateDisplayName: vi.fn(),
    isUpdatingDisplayName: false,
  }),
}));

vi.mock('../../../features/plugins', () => ({
  usePlugins: () => ({
    items: [],
    plan: null,
    isLoading: false,
    errorMessage: '',
    pendingPluginId: null,
    togglePlugin: vi.fn(),
    updatePluginSettings: vi.fn(),
    aiAssistantFeatures: [],
    toggleAiAssistantFeature: vi.fn(),
    isPluginEnabled: () => false,
    isWorkspaceSidebarEnabled: () => false,
  }),
  NavigationSidebar: () => null,
  PluginsModal: () => null,
}));

vi.mock('../../../features/plugins/ai-assistant', () => ({
  AiSidebarChat: () => null,
}));

vi.mock('../../../features/page-editor', () => ({
  PageEditor: (props: Record<string, unknown>) => {
    latestPageEditorProps = props;
    return (
      <div
        data-testid="page-editor"
        data-page-id={(props.page as { id?: string } | null)?.id ?? ''}
        data-has-seed={props.initialSeedContent ? 'yes' : 'no'}
      />
    );
  },
}));

vi.mock('../../../features/page-editor/model/use-page-comments', () => ({
  usePageComments: () => ({
    activeThread: null,
    activeThreadId: null,
    openThreads: [],
    isLoading: false,
    errorMessage: '',
    isPanelOpen: false,
    commentCount: 0,
    startThreadFromSelection: vi.fn(),
    openThread: vi.fn(),
    closePanel: vi.fn(),
    refreshComments: vi.fn(async () => undefined),
    submitMessage: vi.fn(async () => undefined),
    editMessage: vi.fn(async () => undefined),
    deleteMessage: vi.fn(async () => undefined),
    resolveThread: vi.fn(async () => undefined),
  }),
}));

vi.mock('../../../features/page-editor/model/use-page-history', () => ({
  usePageHistory: () => ({
    items: [],
    selectedCheckpoint: null,
    selectedCheckpointId: null,
    isLoading: false,
    isLoadingCheckpoint: false,
    isRestoring: false,
    errorMessage: '',
    openCheckpoint: vi.fn(async () => null),
    restoreCheckpoint: vi.fn(async () => undefined),
    refreshHistory: vi.fn(async () => undefined),
  }),
}));

vi.mock('../../../features/page-editor/ui/comments-panel', () => ({
  CommentsPanel: () => null,
}));

vi.mock('../../../features/page-editor/ui/time-machine-panel', () => ({
  TimeMachinePanel: () => null,
}));

vi.mock('../../../shared/ui', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/ui')>('../../../shared/ui');

  return {
    ...actual,
    ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ModalActionButton: ({
      children,
      onClick,
      disabled,
    }: {
      children: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

vi.mock('../../../shared/lib/workspace-route', () => ({
  readWorkspaceRoute: () => ({ spaceId: 'space-1', pageId: null, readOnly: false }),
  resolveAccessibleSpaceId: () => 'space-1',
  writeWorkspaceRoute: vi.fn(),
}));

vi.mock('./workspace-layout', () => ({
  LEFT_SIDEBAR_MAX_WIDTH: 420,
  LEFT_SIDEBAR_MIN_WIDTH: 280,
  RIGHT_SIDEBAR_MAX_WIDTH: 420,
  RIGHT_SIDEBAR_MIN_WIDTH: 280,
  useResizableSidebar: ({ side }: { side: 'left' | 'right' }) => ({
    width: side === 'left' ? 300 : 320,
    isCollapsed: side === 'left' ? isLeftSidebarCollapsed : true,
    collapse: vi.fn(),
    expand: vi.fn(),
    startResize: vi.fn(),
  }),
}));

vi.mock('./document-link-graph', () => ({
  DocumentLinkGraph: () => null,
}));

vi.mock('./create-template-from-page-modal', () => ({
  CreateTemplateFromPageModal: () => null,
}));

vi.mock('./workspace-access-summary', () => ({
  WorkspaceAccessSummary: () => null,
}));

vi.mock('./page-template-marketplace-modal', () => ({
  PageTemplateMarketplaceModal: () => null,
}));

vi.mock('./workspace-page-actions-menu', () => ({
  WorkspacePageActionsMenu: () => null,
}));

vi.mock('./workspace-node-permissions', () => ({
  isWorkspaceFolder: (node: { kind: string }) => node.kind === 'wikiFolder',
  shouldShowWorkspacePageActions: () => false,
}));

vi.mock('./workspace-node-icon', () => ({
  getWorkspaceNodeIcon: () => null,
}));

vi.mock('../../../shared/lib/export-document', () => ({
  exportDocument: vi.fn(async () => undefined),
}));

vi.mock('../../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/wikilive')>(
    '../../../shared/api/wikilive',
  );

  return {
    ...actual,
    wikiliveApi: {
      ...actual.wikiliveApi,
      listMwsSpaces: vi.fn(),
      getWorkspaceTree: vi.fn(),
      getOutgoingLinks: vi.fn(),
      getBacklinks: vi.fn(),
      getPage: vi.fn(),
      openWorkspaceRealtime: vi.fn(),
      listTemplates: vi.fn(),
      listTemplateCategories: vi.fn(),
      createPage: vi.fn(),
    },
  };
});

class SuccessfulFileReaderMock {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsText(file: Blob) {
    void file.text().then((result) => {
      this.onload?.({ target: { result } } as ProgressEvent<FileReader>);
    });
  }
}

function createWorkspaceTree() {
  if (!importedPageVisible) {
    return [];
  }

  return [
    {
      id: 'node-page-1',
      kind: 'wikiPage',
      title: 'Imported Page',
      spaceId: 'space-1',
      parentId: null,
      children: [],
      linkedPageId: 'page-1',
      wikiPage: {
        id: 'page-1',
        title: 'Imported Page',
        icon: 'doc',
        excerpt: null,
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        backlinksCount: 0,
      },
    },
  ];
}

function createWikiPage() {
  return {
    id: 'page-1',
    title: 'Imported Page',
    icon: null,
    isArchived: false,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    plainTextPreview: 'Imported body',
    headingNumberingEnabled: false,
    outgoingLinksCount: 0,
    backlinksCount: 0,
    embeds: [],
    access: {
      role: 'owner',
      principal: 'authenticated',
      isSpaceMember: true,
      isOwner: true,
      capabilities: {
        canView: true,
        canEdit: true,
        canComment: true,
        canDelete: true,
        canManageAccess: true,
        canUseAi: true,
        canUseAdvancedPlugins: true,
      },
      policy: {
        ownerUserId: 'user-1',
        viewAccess: 'space_members',
        commentAccess: 'space_members',
        editAccess: 'space_members',
      },
    },
    document: {
      type: 'doc',
      content: [],
    },
    documentState: null,
  };
}

describe('WorkspacePage markdown import integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    importedPageVisible = false;
    isLeftSidebarCollapsed = false;
    latestPageEditorProps = null;
    vi.stubGlobal('FileReader', SuccessfulFileReaderMock as unknown as typeof FileReader);

    vi.mocked(wikiliveApi.listMwsSpaces).mockResolvedValue({
      items: [{ id: 'space-1', name: 'Demo Space' }],
    });
    vi.mocked(wikiliveApi.getWorkspaceTree).mockImplementation(async () => ({
      items: createWorkspaceTree(),
    }));
    vi.mocked(wikiliveApi.getOutgoingLinks).mockResolvedValue({ items: [] });
    vi.mocked(wikiliveApi.getBacklinks).mockResolvedValue({ items: [] });
    vi.mocked(wikiliveApi.getPage).mockResolvedValue({ page: createWikiPage() });
    vi.mocked(wikiliveApi.openWorkspaceRealtime).mockReturnValue({
      close: vi.fn(),
    } as { close: () => void });
    vi.mocked(wikiliveApi.listTemplates).mockResolvedValue({
      items: [],
      pageInfo: {
        page: 1,
        pageSize: 20,
        total: 0,
        hasNextPage: false,
      },
    });
    vi.mocked(wikiliveApi.listTemplateCategories).mockResolvedValue({ items: [] });
    vi.mocked(wikiliveApi.createPage).mockImplementation(async () => {
      importedPageVisible = true;
      return {
        page: {
          id: 'page-1',
          title: 'Imported Page',
          icon: 'doc',
          excerpt: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          backlinksCount: 0,
        },
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a page from markdown and passes imported content into PageEditor seed flow', async () => {
    render(<WorkspacePage />);

    const importButton = await screen.findByRole('button', { name: 'Импортировать Markdown' });
    fireEvent.click(importButton);

    const dialog = await screen.findByRole('dialog', { name: 'Импортировать Markdown' });
    const input = within(dialog).getByLabelText('Импортировать Markdown') as HTMLInputElement;

    const file = new File(['---\ntitle: Imported Page\n---\n\n# Imported heading'], 'imported.md', {
      type: 'text/markdown',
    });
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });

    fireEvent.change(input);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Импортировать' }));

    await waitFor(() => {
      expect(wikiliveApi.createPage).toHaveBeenCalledWith('space-1', 'Imported Page');
    });

    await waitFor(() => {
      expect(latestPageEditorProps).toEqual(
        expect.objectContaining({
          initialSeedContent: expect.objectContaining({
            type: 'doc',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'heading',
                attrs: { level: 1 },
              }),
            ]),
          }),
          page: expect.objectContaining({
            id: 'page-1',
          }),
        }),
      );
    });
  });

  it('hides the import button when the left sidebar is collapsed', async () => {
    isLeftSidebarCollapsed = true;

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Импортировать Markdown' })).not.toBeInTheDocument();
    });
  });
});
