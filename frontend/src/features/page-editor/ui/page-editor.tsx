import { EditorContent } from '@tiptap/react';

import { SlashMenu } from '../../slash-menu';
import type { WikiPage } from '../../../shared/api/wikilive';
import { usePageEditorController } from '../model/use-page-editor-controller';
import { FloatingToolbar } from './floating-toolbar';
import { PageEditorHeader } from './page-editor-header';
import { PageImageModal } from './page-image-modal';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';
import { PagePickerModal } from './page-picker-modal';
import { TablePickerModal } from './table-picker-modal';

type PageEditorProps = {
  spaceId: string;
  page: WikiPage | null;
  onRenamePage: (title: string) => Promise<void>;
  onCheckpoint: () => Promise<void>;
};

export function PageEditor({ spaceId, page, onRenamePage, onCheckpoint }: PageEditorProps) {
  const controller = usePageEditorController({ spaceId, page, onRenamePage, onCheckpoint });

  if (!page) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-editor-bg-page">
        <div className="rounded-2xl border border-editor-border-subtle bg-white p-8 text-center shadow-sm">
          <h2 className="font-wide text-xl font-semibold">Выберите страницу</h2>
          <p className="mt-2 text-sm text-editor-text-tertiary">Или создайте новую страницу в sidebar.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,#f5f8ff_0%,#ffffff_32%,#ffffff_100%)] px-0 py-0">
      <section className="flex w-full flex-1 flex-col bg-editor-bg-page">
        <PageEditorHeader
          title={controller.title}
          description={controller.description}
          onSave={controller.handleSaveMeta}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-editor-border-subtle bg-white px-4 py-2 text-xs text-editor-text-tertiary">
          <span className="rounded-full bg-[#eef2ff] px-2 py-1 text-[#34518e]">collab: {controller.connectionStatus}</span>
          <span>{controller.saveStatus}</span>
          {controller.recoveryMessage ? <span className="rounded-full bg-[#fff4df] px-2 py-1 text-[#9a5b00]">{controller.recoveryMessage}</span> : null}
          {controller.activeUsers.length > 0 ? (
            <span>В документе: {controller.activeUsers.map((user) => user.displayName).join(', ')}</span>
          ) : null}
        </div>
        <PageEditorToolbar
          editor={controller.editor}
          onOpenLinkModal={controller.openLinkModal}
          onOpenImageModal={controller.openImageModal}
        />

        <div className="relative mx-auto w-full max-w-4xl flex-1 px-4 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-5">
          <EditorContent editor={controller.editor} />
          {controller.editor && (
            <FloatingToolbar
              editor={controller.editor}
              onOpenLinkModal={() => controller.openLinkModal()}
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
          <TablePickerModal {...controller.tablePicker} />
        </div>
      </section>
    </main>
  );
}
