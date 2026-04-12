import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageEditor } from './page-editor';

const toolbarSpy = vi.fn();
const floatingToolbarSpy = vi.fn();
const slashMenuSpy = vi.fn();
const usePluginsSpy = vi.fn();
const usePageEditorControllerSpy = vi.fn();

vi.mock('@tiptap/react', () => ({
  EditorContent: () => <div data-testid="editor-content" />,
  useEditor: () => ({
    commands: {
      setContent: vi.fn(),
    },
  }),
}));

vi.mock('../../plugins', () => ({
  usePlugins: () => usePluginsSpy(),
}));

vi.mock('../model/use-page-editor-controller', () => ({
  usePageEditorController: (options: unknown) => usePageEditorControllerSpy(options),
}));

vi.mock('./floating-toolbar', () => ({
  FloatingToolbar: (props: unknown) => {
    floatingToolbarSpy(props);
    return <div data-testid="floating-toolbar" />;
  },
}));

vi.mock('./page-editor-toolbar', () => ({
  PageEditorToolbar: (props: unknown) => {
    toolbarSpy(props);
    return <div data-testid="page-editor-toolbar" />;
  },
}));

vi.mock('../../slash-menu', () => ({
  SlashMenu: (props: unknown) => {
    slashMenuSpy(props);
    return <div data-testid="slash-menu" />;
  },
}));

vi.mock('../../wiki-tables', () => ({
  WikiTablePickerModal: () => null,
  MwsTableEmbed: {},
}));

vi.mock('./comment-anchor-overlay', () => ({
  CommentAnchorOverlay: () => null,
}));

vi.mock('./page-link-modal', () => ({
  PageLinkModal: () => null,
}));

vi.mock('./page-image-modal', () => ({
  PageImageModal: () => null,
}));

vi.mock('./page-picker-modal', () => ({
  PagePickerModal: () => null,
}));

vi.mock('./template-variable-modal', () => ({
  TemplateVariableModal: () => null,
}));

describe('PageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePluginsSpy.mockReturnValue({
      isEditorSlotEnabled: () => true,
      isAiAssistantFeatureEnabled: () => false,
      isPluginEnabled: () => false,
    });
    usePageEditorControllerSpy.mockReturnValue({
      editor: {
        isMockEditor: true,
        setEditable: vi.fn(),
      },
      title: 'Документ',
      description: 'Описание',
      saveStatus: 'Документ подключен',
      connectionStatus: 'online',
      recoveryMessage: '',
      activeUsers: [],
      handleSaveMeta: vi.fn(),
      slashState: { isOpen: true, top: 10, left: 10 },
      selectedIndex: 0,
      setSelectedIndex: vi.fn(),
      filteredItems: [{ id: 'heading', label: 'Heading' }],
      applySlashItem: vi.fn(),
      openLinkModal: vi.fn(),
      openImageModal: vi.fn(),
      linkModal: {},
      imageModal: {},
      pagePicker: {},
      tablePicker: {},
      templateVariableModal: {},
      getCurrentDocumentStateValue: vi.fn(),
    });
  });

  it('hides editing affordances for read-only users', () => {
    render(
      <PageEditor
        spaceId="space-1"
        page={{
          id: 'page-1',
          title: 'Документ',
          icon: null,
          isArchived: false,
          createdAt: '2026-04-12T10:00:00.000Z',
          updatedAt: '2026-04-12T10:00:00.000Z',
          plainTextPreview: 'Описание',
          outgoingLinksCount: 0,
          backlinksCount: 0,
          embeds: [],
          access: {
            role: 'guest',
            principal: 'anonymous',
            isSpaceMember: false,
            isOwner: false,
            capabilities: {
              canView: true,
              canEdit: false,
              canComment: false,
              canDelete: false,
              canManageAccess: false,
              canUseAi: false,
              canUseAdvancedPlugins: false,
            },
            policy: {
              ownerUserId: 'owner-1',
              viewAccess: 'link_holders',
              commentAccess: 'owner_only',
              editAccess: 'owner_only',
            },
          },
        }}
        onRenamePage={vi.fn(async () => undefined)}
        onCheckpoint={vi.fn(async () => undefined)}
        onCreateComment={vi.fn()}
        onOpenTimeMachine={vi.fn()}
      />,
    );

    expect(usePageEditorControllerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canEdit: false,
        isAiSlashEnabled: false,
        isAiGhostEnabled: false,
      }),
    );
    expect(toolbarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        onCreateComment: undefined,
        onOpenTimeMachine: undefined,
      }),
    );
    expect(floatingToolbarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        onCreateComment: undefined,
        isAiTransformEnabled: false,
      }),
    );
    expect(screen.queryByTestId('slash-menu')).not.toBeInTheDocument();
  });

  it('renders history preview without opening live editor controller', () => {
    render(
      <PageEditor
        spaceId="space-1"
        page={{
          id: 'page-1',
          title: 'Документ',
          icon: null,
          isArchived: false,
          createdAt: '2026-04-12T10:00:00.000Z',
          updatedAt: '2026-04-12T10:00:00.000Z',
          plainTextPreview: 'Описание',
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
              ownerUserId: 'owner-1',
              viewAccess: 'space_members',
              commentAccess: 'space_members',
              editAccess: 'space_members',
            },
          },
        }}
        historyPreview={{
          checkpoint: {
            id: 'cp-1',
            serverVersion: 7,
            trigger: 'manual',
            createdBy: 'owner-1',
            createdByName: 'Owner',
            createdAt: '2026-04-12T11:00:00.000Z',
            excerpt: 'Сохраненная версия',
            restoredFromCheckpointId: null,
          },
          documentState: {
            encoding: 'base64-yjs-update-v2',
            value: 'encoded',
            serverVersion: 7,
            checkpointId: 'cp-1',
            persistedAt: '2026-04-12T11:00:00.000Z',
          },
          document: {
            type: 'doc',
            content: [],
          },
        }}
        onRenamePage={vi.fn(async () => undefined)}
        onCheckpoint={vi.fn(async () => undefined)}
      />,
    );

    expect(usePageEditorControllerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canEdit: true,
        isAiSlashEnabled: true,
        isAiGhostEnabled: false,
      }),
    );
    expect(screen.getByText(/Открыт предпросмотр версии/i)).toBeInTheDocument();
    expect(screen.getByTestId('page-editor-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('floating-toolbar')).toBeInTheDocument();
  });
});
