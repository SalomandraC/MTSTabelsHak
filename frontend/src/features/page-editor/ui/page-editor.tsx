import { EditorContent } from '@tiptap/react';

import { SlashMenu } from '../../slash-menu';
import { usePageEditorController } from '../model/use-page-editor-controller';
import { FloatingToolbar } from './floating-toolbar';
import { PageEditorHeader } from './page-editor-header';
import { PageImageModal } from './page-image-modal';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';

export function PageEditor() {
  const controller = usePageEditorController();

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,#f5f8ff_0%,#ffffff_32%,#ffffff_100%)] px-0 py-0">
      <section className="flex w-full flex-1 flex-col bg-editor-bg-page">
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

        <div className="relative flex-1 px-2 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-5 mx-[20%]">
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
        </div>
      </section>
    </main>
  );
}
