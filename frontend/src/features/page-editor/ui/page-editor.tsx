import { EditorContent } from '@tiptap/react';

import { SlashMenu } from '../../slash-menu';
import { usePageEditorController } from '../model/use-page-editor-controller';
import { PageEditorHeader } from './page-editor-header';
import { PageImageModal } from './page-image-modal';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';

export function PageEditor() {
  const controller = usePageEditorController();

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,#f5f8ff_0%,#ffffff_32%,#ffffff_100%)] px-3 py-3 sm:px-6 sm:py-6">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] flex-1 flex-col overflow-hidden rounded-[14px] border border-editor-border-subtle bg-editor-bg-page shadow-[0_6px_24px_rgba(17,25,40,0.05)] sm:min-h-[calc(100vh-3rem)]">
        <PageEditorHeader
          title={controller.title}
          description={controller.description}
          onSave={controller.handleSaveMeta}
        />
        <PageEditorToolbar
          editor={controller.editor}
          onOpenLinkModal={controller.openLinkModal}
          onOpenImageModal={controller.openImageModal}
        />

        <div className="relative flex-1 px-2 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-5">
          <EditorContent editor={controller.editor} />
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
        </div>
      </section>
    </main>
  );
}
