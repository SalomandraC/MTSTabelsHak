import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { useEffect } from 'react';

import { SlashMenu } from '../../slash-menu';
import { WikiTablePickerModal } from '../../wiki-tables';
import { usePlugins } from '../../plugins';
import type { PresenceUser, WikiPage } from '../../../shared/api/wikilive';
import type { CommentThreadView } from '../model/use-page-comments';
import { usePageEditorController } from '../model/use-page-editor-controller';
import { CommentAnchorOverlay } from './comment-anchor-overlay';
import { FloatingToolbar } from './floating-toolbar';
import { PageEditorHeader } from './page-editor-header';
import { PageImageModal } from './page-image-modal';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';
import { PagePickerModal } from './page-picker-modal';
import { TemplateVariableModal } from './template-variable-modal';

type PageEditorProps = {
  spaceId: string;
  page: WikiPage | null;
  isLoading?: boolean;
  onRenamePage: (title: string) => Promise<void>;
  onCheckpoint: () => Promise<void>;
  onEditorChange?: (editor: Editor | null) => void;
  onDocumentStateEncoderChange?: (encoder: (() => string | null) | null) => void;
  onCreateComment?: (editor: Editor) => void;
  onOpenCommentThread?: (threadId: string) => void;
  onOpenTimeMachine?: () => void;
  commentThreads?: CommentThreadView[];
  activeCommentThreadId?: string | null;
  commentCount?: number;
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
  onCreateComment,
  onOpenCommentThread,
  onOpenTimeMachine,
  commentThreads = [],
  activeCommentThreadId = null,
  commentCount = 0,
}: PageEditorProps) {
  const { isEditorSlotEnabled } = usePlugins();
  const canEdit = page?.access?.capabilities.canEdit ?? true;
  const canComment = page?.access?.capabilities.canComment ?? true;
  const canUseAi = page?.access?.capabilities.canUseAi ?? true;
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
    onEditorChange?.(isLoading || !page ? null : controller.editor);

    return () => {
      onEditorChange?.(null);
    };
  }, [controller.editor, isLoading, onEditorChange, page]);

  useEffect(() => {
    onDocumentStateEncoderChange?.(isLoading || !page ? null : controller.getCurrentDocumentStateValue);

    return () => {
      onDocumentStateEncoderChange?.(null);
    };
  }, [controller.getCurrentDocumentStateValue, isLoading, onDocumentStateEncoderChange, page]);

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
    <main className="flex h-full min-h-0 flex-col bg-editor-bg-page px-0 py-0">
      <section className="flex min-h-0 w-full flex-1 flex-col bg-editor-bg-page">
        <PageEditorHeader
          title={controller.title}
          description={controller.description}
          editable={canEdit}
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
            canEdit={canEdit}
            onOpenLinkModal={controller.openLinkModal}
            onOpenImageModal={controller.openImageModal}
            onCreateComment={canComment ? onCreateComment : undefined}
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
              canEdit={canEdit}
              onOpenLinkModal={() => controller.openLinkModal()}
              onCreateComment={canComment ? onCreateComment : undefined}
              pageTitle={controller.title}
              isAiTransformEnabled={isAiToolbarEnabled}
            />
          )}
          {canEdit ? (
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
          <PagePickerModal {...controller.pagePicker} />
          <TemplateVariableModal {...controller.templateVariableModal} />
          <WikiTablePickerModal {...controller.tablePicker} />
        </div>
      </section>
    </main>
  );
}
