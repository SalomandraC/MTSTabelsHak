import type { Content, Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect } from 'react';

import { SlashMenu } from '../../slash-menu';
import { WikiTablePickerModal } from '../../wiki-tables';
import { usePlugins } from '../../plugins';
import type { PageHistoryCheckpoint, WikiPage } from '../../../shared/api/wikilive';
import type { CommentThreadView } from '../model/use-page-comments';
import { createPageEditorExtensions } from '../model/editor-config';
import { usePageEditorController } from '../model/use-page-editor-controller';
import { CommentAnchorOverlay } from './comment-anchor-overlay';
import { FloatingToolbar } from './floating-toolbar';
import { PageEditorHeader } from './page-editor-header';
import { PageImageModal } from './page-image-modal';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';
import { PagePickerModal } from './page-picker-modal';
import { TemplateVariableModal } from './template-variable-modal';
import { IframeModal } from './iframe-modal';

type PageEditorProps = {
  spaceId: string;
  page: WikiPage | null;
  isLoading?: boolean;
  onRenamePage: (title: string) => Promise<void>;
  onCheckpoint: () => Promise<void>;
  onEditorChange?: (editor: Editor | null) => void;
  onDocumentStateEncoderChange?: (encoder: (() => string | null) | null) => void;
  onDocumentStateRestorerChange?: (restorer: ((value: string) => boolean) | null) => void;
  onCreateComment?: (editor: Editor) => void;
  onOpenCommentThread?: (threadId: string) => void;
  onOpenTimeMachine?: () => void;
  commentThreads?: CommentThreadView[];
  activeCommentThreadId?: string | null;
  commentCount?: number;
  historyPreview?: PageHistoryCheckpoint | null;
};

function formatHistoryPreviewDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ReadOnlyPreviewOverlay({
  checkpoint,
}: {
  checkpoint: PageHistoryCheckpoint;
}) {
  const editor = useEditor({
    extensions: createPageEditorExtensions(),
    content: checkpoint.document as Content,
    editable: false,
    editorProps: {
      attributes: {
        class: 'tiptap h-full min-h-full',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        autocomplete: 'off',
        writingsuggestions: 'false',
        translate: 'no',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'data-lt-active': 'false',
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.commands.setContent(checkpoint.document as Content);
  }, [checkpoint, editor]);

  return (
    <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-editor-bg-page">
      <div className="border-b border-editor-border-subtle bg-[#fff7e8] px-4 py-3 text-sm text-[#8a5a00]">
        Открыт предпросмотр версии от {formatHistoryPreviewDate(checkpoint.checkpoint.createdAt)}. Живой документ остается подключенным, поэтому восстановление сразу синхронизируется для всех участников.
      </div>
      <div
        className="relative mx-auto w-full max-w-4xl flex-1 px-2 pb-4 pt-4 sm:px-6 sm:pb-10 sm:pt-5"
        data-page-editor-history-preview
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function PageEditorLoadingSkeleton() {
  return (
    <main className="flex min-h-screen flex-col bg-editor-bg-page" aria-busy="true" aria-label="Загрузка страницы">
      <section className="flex h-[68px] items-start gap-[6px] border-b border-editor-border-subtle bg-editor-bg-page px-4 py-4">
        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] bg-[#eef0f3]" />
        <div className="min-w-0 space-y-[6px]">
          <p className="h-[15px] w-[97px] rounded-[4px] bg-[#eef0f3] text-transparent">Новая страница</p>
          <p className="h-[15px] w-[116px] rounded-[4px] bg-[#f2f3f5] text-transparent">Добавить описание</p>
        </div>
      </section>
      <section className="flex min-h-[732px] flex-1 justify-center bg-editor-bg-page px-4">
        <div className="mt-[250px] w-full max-w-[700px] space-y-6">
          <div className="h-10 w-[min(311px,70%)] animate-pulse rounded-[8px] bg-[#eef0f3]" />
          <div className="h-6 w-[min(629px,90%)] animate-pulse rounded-[8px] bg-[#f2f3f5]" />
          <div className="h-6 w-full animate-pulse rounded-[8px] bg-[#f2f3f5]" />
          <div className="h-6 w-[94.7%] animate-pulse rounded-[8px] bg-[#f2f3f5]" />
          <div className="h-6 w-[60.9%] animate-pulse rounded-[8px] bg-[#f2f3f5]" />
        </div>
      </section>
    </main>
  );
}

export function PageEditor({
  spaceId,
  page,
  isLoading = false,
  onRenamePage,
  onCheckpoint,
  onEditorChange,
  onDocumentStateEncoderChange,
  onDocumentStateRestorerChange,
  onCreateComment,
  onOpenCommentThread,
  onOpenTimeMachine,
  commentThreads = [],
  activeCommentThreadId = null,
  commentCount = 0,
  historyPreview = null,
}: PageEditorProps) {
  if (isLoading) {
    return <PageEditorLoadingSkeleton />;
  }

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
    <LivePageEditor
      spaceId={spaceId}
      page={page}
      onRenamePage={onRenamePage}
      onCheckpoint={onCheckpoint}
      onEditorChange={onEditorChange}
      onDocumentStateEncoderChange={onDocumentStateEncoderChange}
      onDocumentStateRestorerChange={onDocumentStateRestorerChange}
      onCreateComment={onCreateComment}
      onOpenCommentThread={onOpenCommentThread}
      onOpenTimeMachine={onOpenTimeMachine}
      commentThreads={commentThreads}
      activeCommentThreadId={activeCommentThreadId}
      commentCount={commentCount}
      historyPreview={historyPreview}
    />
  );
}

function LivePageEditor({
  spaceId,
  page,
  onRenamePage,
  onCheckpoint,
  onEditorChange,
  onDocumentStateEncoderChange,
  onDocumentStateRestorerChange,
  onCreateComment,
  onOpenCommentThread,
  onOpenTimeMachine,
  commentThreads = [],
  activeCommentThreadId = null,
  commentCount = 0,
  historyPreview = null,
}: Omit<PageEditorProps, 'isLoading'> & { page: WikiPage }) {
  const { isEditorSlotEnabled } = usePlugins();
  const canEdit = page.access?.capabilities.canEdit ?? true;
  const canComment = page.access?.capabilities.canComment ?? true;
  const canUseAi = page.access?.capabilities.canUseAi ?? true;
  const isHistoryPreviewActive = Boolean(historyPreview);
  const effectiveCanEdit = canEdit && !isHistoryPreviewActive;
  const effectiveCanComment = canComment && !isHistoryPreviewActive;
  const isAiSlashEnabled = isEditorSlotEnabled('slash_menu') && canUseAi;
  const isAiToolbarEnabled = isEditorSlotEnabled('toolbar_bubble') && canUseAi;
  const isAiExtensionEnabled = isEditorSlotEnabled('editor_extension') && canUseAi;

  const controller = usePageEditorController({
    spaceId,
    page,
    canEdit,
    onRenamePage,
    onCheckpoint,
    onOpenCommentThread,
    isAiSlashEnabled,
    isAiEditorExtensionEnabled: isAiExtensionEnabled,
  });

  useEffect(() => {
    onEditorChange?.(controller.editor);

    return () => {
      onEditorChange?.(null);
    };
  }, [controller.editor, onEditorChange]);

  useEffect(() => {
    onDocumentStateEncoderChange?.(controller.getCurrentDocumentStateValue);

    return () => {
      onDocumentStateEncoderChange?.(null);
    };
  }, [controller.getCurrentDocumentStateValue, onDocumentStateEncoderChange]);

  useEffect(() => {
    onDocumentStateRestorerChange?.(controller.applyDocumentStateValue);

    return () => {
      onDocumentStateRestorerChange?.(null);
    };
  }, [controller.applyDocumentStateValue, onDocumentStateRestorerChange]);

  useEffect(() => {
    controller.editor?.setEditable(effectiveCanEdit);
  }, [controller.editor, effectiveCanEdit]);

  return (
    <main className="flex h-full min-h-0 flex-col bg-editor-bg-page px-0 py-0">
      <section className="flex min-h-0 w-full flex-1 flex-col bg-editor-bg-page">
        <PageEditorHeader
          title={controller.title}
          description={controller.description}
          editable={effectiveCanEdit}
          onSave={controller.handleSaveMeta}
          connectionStatus={controller.connectionStatus}
          saveStatus={controller.saveStatus}
          recoveryMessage={controller.recoveryMessage}
          activeUsers={controller.activeUsers}
        />
        <PageEditorToolbar
          editor={controller.editor}
          canEdit={effectiveCanEdit}
          onOpenLinkModal={controller.openLinkModal}
          onOpenImageModal={controller.openImageModal}
          onOpenIframeModal={controller.openIframeModal}
          onCreateComment={effectiveCanComment ? onCreateComment : undefined}
          onOpenTimeMachine={canEdit ? onOpenTimeMachine : undefined}
          commentCount={commentCount}
        />

        <div
          className="relative mx-auto w-full max-w-4xl flex-1 px-2 pb-4 pt-1 sm:px-6 sm:pb-10 sm:pt-5"
          data-page-editor-surface
        >
          <EditorContent editor={controller.editor} />
          <CommentAnchorOverlay
            editor={controller.editor}
            threads={commentThreads}
            activeThreadId={activeCommentThreadId}
            onOpenThread={(threadId) => onOpenCommentThread?.(threadId)}
          />
          {controller.editor && (
            <FloatingToolbar
              editor={controller.editor}
              canEdit={effectiveCanEdit}
              onOpenLinkModal={() => controller.openLinkModal()}
              onOpenIframeModal={controller.openIframeModal}
              onCreateComment={effectiveCanComment ? onCreateComment : undefined}
              pageTitle={controller.title}
              isAiTransformEnabled={isAiToolbarEnabled}
            />
          )}
          {effectiveCanEdit ? (
            <SlashMenu
              isOpen={controller.slashState.isOpen}
              items={controller.filteredItems}
              selectedIndex={controller.selectedIndex}
              position={{ top: controller.slashState.top, left: controller.slashState.left }}
              onHover={controller.setSelectedIndex}
              onSelect={controller.applySlashItem}
            />
          ) : null}
          <PageLinkModal {...controller.linkModal} />
          <PageImageModal {...controller.imageModal} />
          <IframeModal {...controller.iframeModal} />
          <PagePickerModal {...controller.pagePicker} />
          <TemplateVariableModal {...controller.templateVariableModal} />
          <WikiTablePickerModal {...controller.tablePicker} />
          {historyPreview ? <ReadOnlyPreviewOverlay checkpoint={historyPreview} /> : null}
        </div>
      </section>
    </main>
  );
}
