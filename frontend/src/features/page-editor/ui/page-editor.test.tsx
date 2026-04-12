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
    });
    usePageEditorControllerSpy.mockReturnValue({
      editor: { isMockEditor: true },
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
        isAiEditorExtensionEnabled: false,
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
});
