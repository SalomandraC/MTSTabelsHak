import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { useEffect } from 'react';

import { SlashMenu } from '../../slash-menu';
import { WikiTablePickerModal } from '../../wiki-tables';
import { usePlugins } from '../../plugins';
import type { PresenceUser, WikiPage } from '../../../shared/api/wikilive';
import { usePageEditorController } from '../model/use-page-editor-controller';
import { FloatingToolbar } from './floating-toolbar';
import { PageEditorHeader } from './page-editor-header';
import { PageImageModal } from './page-image-modal';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';
import { PagePickerModal } from './page-picker-modal';

type PageEditorProps = {
  spaceId: string;
  page: WikiPage | null;
  onRenamePage: (title: string) => Promise<void>;
  onCheckpoint: () => Promise<void>;
  onEditorChange?: (editor: Editor | null) => void;
};

function PresenceStrip({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) {
    return <span className="rounded-full bg-[#f7f7f8] px-2 py-1 text-[#767676]">В документе никого нет</span>;
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-editor-border-subtle bg-white px-2 py-1 shadow-sm">
      <span className="font-semibold text-[#1d2023]">{users.length} в документе</span>
      <div className="flex -space-x-1">
        {users.slice(0, 5).map((user) => (
          <span
            key={user.userId}
            title={user.displayName}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: user.color ?? '#111827' }}
          >
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span className="max-w-[18rem] truncate text-[#505762]">{users.map((user) => user.displayName).join(', ')}</span>
    </div>
  );
}

export function PageEditor({ spaceId, page, onRenamePage, onCheckpoint, onEditorChange }: PageEditorProps) {
  const { isEditorSlotEnabled } = usePlugins();
  const isAiSlashEnabled = isEditorSlotEnabled('slash_menu');
  const isAiToolbarEnabled = isEditorSlotEnabled('toolbar_bubble');
  const isAiExtensionEnabled = isEditorSlotEnabled('editor_extension');

  const controller = usePageEditorController({
    spaceId,
    page,
    onRenamePage,
    onCheckpoint,
    isAiSlashEnabled,
    isAiEditorExtensionEnabled: isAiExtensionEnabled,
  });

  useEffect(() => {
    onEditorChange?.(controller.editor);

    return () => {
      onEditorChange?.(null);
    };
  }, [controller.editor, onEditorChange]);

  if (!page) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-editor-bg-page">
        <div className="rounded-2xl border border-editor-border-subtle bg-white p-8 text-center shadow-sm">
          <h2 className="font-wide text-xl font-semibold">Выберите страницу</h2>
          <p className="mt-2 text-sm text-editor-text-tertiary">Или создайте новую страницу в sidebar.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-editor-bg-page px-0 py-0">
      <section className="flex min-h-0 w-full flex-1 flex-col bg-editor-bg-page">
        <PageEditorHeader
          title={controller.title}
          description={controller.description}
          onSave={controller.handleSaveMeta}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-editor-border-subtle bg-white px-4 py-2 text-xs text-editor-text-tertiary">
          <span className="rounded-full bg-[#111827] px-2 py-1 font-semibold text-white">collab: {controller.connectionStatus}</span>
          <span>{controller.saveStatus}</span>
          {controller.recoveryMessage ? <span className="rounded-full bg-[#fff4df] px-2 py-1 text-[#9a5b00]">{controller.recoveryMessage}</span> : null}
          <PresenceStrip users={controller.activeUsers} />
        </div>
        <PageEditorToolbar
          editor={controller.editor}
          onOpenLinkModal={controller.openLinkModal}
          onOpenImageModal={controller.openImageModal}
        />

        <div className="relative mx-auto w-full max-w-4xl flex-1 px-2 pb-4 pt-1 sm:px-6 sm:pb-10 sm:pt-5">
          <EditorContent editor={controller.editor} />
          {controller.editor && (
            <FloatingToolbar
              editor={controller.editor}
              onOpenLinkModal={() => controller.openLinkModal()}
              pageTitle={controller.title}
              isAiTransformEnabled={isAiToolbarEnabled}
            />
          )}
          <SlashMenu
            isOpen={controller.slashState.isOpen}
            items={controller.filteredItems}
            selectedIndex={controller.selectedIndex}
            position={{ top: controller.slashState.top, left: controller.slashState.left }}
            onHover={controller.setSelectedIndex}
            onSelect={controller.applySlashItem}
          />
          <PageLinkModal {...controller.linkModal} />
          <PageImageModal {...controller.imageModal} />
          <PagePickerModal {...controller.pagePicker} />
          <WikiTablePickerModal {...controller.tablePicker} />
        </div>
      </section>
    </main>
  );
}
