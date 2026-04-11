import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { MouseEvent } from 'react';

import { handleListAction } from '../model/list-actions';
import { menuBarStateSelector } from '../model/menu-state';

import VectorLeft from '../../../app/images/VectorLeft.svg';
import VectorRight from '../../../app/images/VectorRight.svg';
import B from '../../../app/images/B.svg';
import Tk from '../../../app/images/Tk.svg';
import H1 from '../../../app/images/H1.svg';
import H2 from '../../../app/images/H2.svg';
import H3 from '../../../app/images/H3.svg';
import T from '../../../app/images/T.svg';
import T1 from '../../../app/images/T1.svg';
import U from '../../../app/images/U.svg';
import List from '../../../app/images/list.svg';
import ListOrdered from '../../../app/images/list-ordered.svg';
import ListChecks from '../../../app/images/list-checks.svg';
import Code2 from '../../../app/images/code-xml.svg';
import Quote from '../../../app/images/quote.svg';
import BrushCleaning from '../../../app/images/brush-cleaning.svg';
import AtSign from '../../../app/images/at-sign.svg';
import Picture from '../../../app/images/Picture.svg';

import { History, MessageSquare, TextAlignCenter, TextAlignEnd, TextAlignStart } from 'lucide-react';

const redFilter = 'brightness(0) saturate(100%) invert(36%) sepia(94%) saturate(2665%) hue-rotate(346deg) brightness(101%) contrast(97%)';

type PageEditorToolbarProps = {
  editor: Editor | null;
  onOpenLinkModal: (position?: { top: number; left: number }) => void;
  onOpenImageModal: () => void;
  onCreateComment?: (editor: Editor) => void;
  onOpenTimeMachine?: () => void;
  commentCount?: number;
};

type ToolbarButtonProps = {
  label?: React.ReactNode;
  icon?: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  noBorder?: boolean;

  size?: 'sm' | 'md';
  isFirst?: boolean; 
  isLast?: boolean;
  isInGroup?: boolean;

  'aria-label'?: string;

  onClick: ((event: React.MouseEvent<HTMLButtonElement>) => void) | (() => void);
};

function areMenuStatesEqual(
  previous: ReturnType<typeof menuBarStateSelector> | null,
  next: ReturnType<typeof menuBarStateSelector> | null,
) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return false;
  }

  return (
    previous.isBold === next.isBold &&
    previous.canBold === next.canBold &&
    previous.isItalic === next.isItalic &&
    previous.canItalic === next.canItalic &&
    previous.isStrike === next.isStrike &&
    previous.canStrike === next.canStrike &&
    previous.isCode === next.isCode &&
    previous.canCode === next.canCode &&
    previous.isUnderline === next.isUnderline &&
    previous.canUnderline === next.canUnderline &&
    previous.canClearNodes === next.canClearNodes &&
    previous.isParagraph === next.isParagraph &&
    previous.isHeading1 === next.isHeading1 &&
    previous.isHeading2 === next.isHeading2 &&
    previous.isHeading3 === next.isHeading3 &&
    previous.isAlignLeft === next.isAlignLeft &&
    previous.isAlignCenter === next.isAlignCenter &&
    previous.isAlignRight === next.isAlignRight &&
    previous.isBulletList === next.isBulletList &&
    previous.canBulletList === next.canBulletList &&
    previous.isOrderedList === next.isOrderedList &&
    previous.canOrderedList === next.canOrderedList &&
    previous.isTaskList === next.isTaskList &&
    previous.canTaskList === next.canTaskList &&
    previous.isBlockquote === next.isBlockquote &&
    previous.isCodeBlock === next.isCodeBlock &&
    previous.canCodeBlock === next.canCodeBlock &&
    previous.isLink === next.isLink &&
    previous.linkHref === next.linkHref &&
    previous.linkLabel === next.linkLabel &&
    previous.canUnsetLink === next.canUnsetLink &&
    previous.isImageSelected === next.isImageSelected &&
    previous.canUndo === next.canUndo &&
    previous.canRedo === next.canRedo &&
    previous.canClearFormatting === next.canClearFormatting
  );
}

function ToolbarButton({ 
  label, 
  icon, 
  pressed = false, 
  disabled = false, 
  noBorder = false, 
  size = 'md',
  isFirst = false,
  isLast = false,
  isInGroup = false,
  onClick,
  'aria-label': ariaLabel,
}: ToolbarButtonProps) {
  const sizeClasses = size === 'sm' 
    ? 'h-7 w-7 min-w-7' 
    : 'h-8 min-w-8';

  const radiusClasses = noBorder 
    ? '' 
    : isFirst && isLast
      ? 'rounded-md'  
      : isFirst 
        ? 'rounded-l-md'  
        : isLast 
          ? 'rounded-r-md' 
          : 'rounded-none'; 
  
  const marginClass = isInGroup && !isFirst ? '-ml-px' : '';
  
  const paddingClass = isInGroup ? 'px-1.5' : 'px-2';

  const zIndexClass = pressed ? 'z-20' : (isInGroup && isFirst ? 'z-10' : '');
  
  const className = [
    'inline-flex shrink-0 items-center justify-center py-0.5 text-xs font-semibold transition-colors relative',
    marginClass,
    paddingClass,
    sizeClasses,
    radiusClasses,
    zIndexClass, 
    noBorder ? '' : 'border border-editor-border-control',
    isInGroup 
      ? 'bg-transparent text-[rgba(80,87,98,1)] hover:bg-[#d5d9e0]' 
      : 'bg-transparent text-editor-icon hover:bg-[#e8ebf1] hover:text-editor-text-primary',
    pressed ? '!border-2 border-red-500 !border-opacity-100' : '',
    disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button 
      type="button" 
      onClick={onClick} 
      disabled={disabled} 
      className={className}
      aria-label={ariaLabel}
    >
      {icon || label}
    </button>
  );
}

export function PageEditorToolbar({
  editor,
  onOpenLinkModal,
  onOpenImageModal,
  onCreateComment,
  onOpenTimeMachine,
  commentCount = 0,
}: PageEditorToolbarProps) {
  const state =
    useEditorState({
      editor,
      selector: menuBarStateSelector,
      equalityFn: areMenuStatesEqual,
    }) ??
    {
      isBold: false,
      canBold: false,
      isItalic: false,
      canItalic: false,
      isStrike: false,
      canStrike: false,
      isCode: false,
      canCode: false,
      isUnderline: false,
      canUnderline: false,
      canClearNodes: false,
      isParagraph: false,
      isHeading1: false,
      isHeading2: false,
      isHeading3: false,
      isAlignLeft: false,
      isAlignCenter: false,
      isAlignRight: false,
      isBulletList: false,
      canBulletList: false,
      isOrderedList: false,
      canOrderedList: false,
      isTaskList: false,
      canTaskList: false,
      isBlockquote: false,
      isCodeBlock: false,
      canCodeBlock: false,
      isLink: false,
      linkHref: undefined,
      linkLabel: undefined,
      canUnsetLink: false,
      isImageSelected: false,
      canUndo: false,
      canRedo: false,
      canClearFormatting: false,
    };

  if (!editor) {
    return null;
  }

  const alignSelection = (align: 'left' | 'center' | 'right') => {
    editor.chain().focus().setTextAlign(align).run();
  };

  return (
    <div className="sticky top-0 z-20 bg-[rgba(245,247,250,1)] px-2 py-2 sm:px-4">
      <div className="flex items-center gap-0 overflow-x-auto whitespace-nowrap pb-0.5" role="toolbar" aria-label="Панель инструментов редактора">

        <ToolbarButton 
          icon={
            <img 
              src={VectorLeft} 
              alt="Отменить действие" 
              className="h-4 w-4" 
            />
          } 
          onClick={() => editor.chain().focus().undo().run()} 
          disabled={!state.canUndo} 
          noBorder
          aria-label="Отменить (Ctrl+Z)"
        />
        <ToolbarButton 
          icon={
            <img 
              src={VectorRight} 
              alt="Повторить действие" 
              className="h-4 w-4" 
            />
          } 
          onClick={() => editor.chain().focus().redo().run()} 
          disabled={!state.canRedo} 
          noBorder
          aria-label="Повторить (Ctrl+Y)"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={B} 
              alt="Полужирное начертание" 
              className="h-4 w-4"
              style={state.isBold ? { filter: redFilter } : {}}
            />
          }
          onClick={() => editor.chain().focus().toggleBold().run()}
          pressed={state.isBold}
          disabled={!state.canBold}
          noBorder={false}
          isFirst={true}  
          isLast={false}
          isInGroup={true}
          aria-label="Полужирный (Ctrl+B)"
        />
        <ToolbarButton
          icon={
            <img 
              src={Tk} 
              alt="Курсивное начертание" 
              className="h-4 w-4"
              style={state.isItalic ? { filter: redFilter } : {}}
            />
          }
          onClick={() => editor.chain().focus().toggleItalic().run()}
          pressed={state.isItalic}
          disabled={!state.canItalic}
          noBorder={false}
          isFirst={false}
          isLast={false}
          isInGroup={true}
          aria-label="Курсив (Ctrl+I)"
        />
        <ToolbarButton
          icon={
            <img 
              src={T1} 
              alt="Зачёркнутый текст" 
              className="h-4 w-4"
              style={state.isStrike ? { filter: redFilter } : {}}
            />
          }
          onClick={() => editor.chain().focus().toggleStrike().run()}
          pressed={state.isStrike}
          disabled={!state.canStrike}
          noBorder={false}
          isFirst={false}
          isLast={false}
          isInGroup={true}
          aria-label="Зачёркнутый"
        />
        <ToolbarButton
          icon={
            <img 
              src={U} 
              alt="Подчёркнутый текст" 
              className="h-4 w-4"
              style={state.isUnderline ? { filter: redFilter } : {}}
            />
          }
          onClick={() => editor.chain().focus().toggleUnderline?.().run()}
          pressed={state.isUnderline}
          disabled={!state.canUnderline}
          noBorder={false}
          isFirst={false}
          isLast={true}
          isInGroup={true}
          aria-label="Подчёркнутый (Ctrl+U)"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton 
          icon={
            <img 
              src={T} 
              alt="Обычный текст (параграф)" 
              className="h-4 w-4"
              style={state.isParagraph ? { filter: redFilter } : {}}
            />
          } 
          onClick={() => editor.chain().focus().setParagraph().run()} 
          pressed={state.isParagraph} 
          isFirst={true}
          isLast={true}
          isInGroup={true}
          aria-label="Обычный текст"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={H1} 
              alt="Заголовок 1 уровня" 
              className="h-4 w-4"
              style={state.isHeading1 ? { filter: redFilter } : {}}
            />
          } 
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          pressed={state.isHeading1}
          isFirst={true}
          isLast={false}
          isInGroup={true}
          aria-label="Заголовок 1"
        />
        <ToolbarButton
          icon={
            <img 
              src={H2} 
              alt="Заголовок 2 уровня" 
              className="h-4 w-4"
              style={state.isHeading2 ? { filter: redFilter } : {}}
            />
          } 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          pressed={state.isHeading2}
          isFirst={false}
          isLast={false}
          isInGroup={true}
          aria-label="Заголовок 2"
        />
        <ToolbarButton
          icon={
            <img 
              src={H3} 
              alt="Заголовок 3 уровня" 
              className="h-4 w-4"
              style={state.isHeading3 ? { filter: redFilter } : {}}
            />
          } 
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          pressed={state.isHeading3}
          isFirst={false}
          isLast={true}
          isInGroup={true}
          aria-label="Заголовок 3"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <TextAlignStart className="h-4 w-4" 
              style={{ color: 'rgba(80, 87, 98, 1)' }} 
            />
          }
          onClick={() => alignSelection('left')}
          pressed={state.isAlignLeft}
          isFirst={true}
          isLast={false}
          isInGroup={true}
          aria-label="Выровнять по левому краю"
        />
        <ToolbarButton
          icon={
            <TextAlignCenter className="h-4 w-4" 
              style={{ color: 'rgba(80, 87, 98, 1)' }} 
            />
          }
          onClick={() => alignSelection('center')}
          pressed={state.isAlignCenter}
          isFirst={false}
          isLast={false}
          isInGroup={true}
          aria-label="Выровнять по центру"
        />
        <ToolbarButton
          icon={
            <TextAlignEnd className="h-4 w-4" 
              style={{ color: 'rgba(80, 87, 98, 1)' }} 
            />
          }
          onClick={() => alignSelection('right')}
          pressed={state.isAlignRight}
          isFirst={false}
          isLast={true}
          isInGroup={true}
          aria-label="Выровнять по правому краю"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
                src={List} 
                alt="Маркированный список" 
                className="h-4 w-4"
                style={state.isBulletList ? { filter: redFilter } : {}}
            />
          }
          onClick={() => handleListAction(editor, 'bulletList')}
          pressed={state.isBulletList}
          disabled={!state.canBulletList}
          isFirst={true}
          isLast={false}
          isInGroup={true}
          aria-label="Маркированный список"
        />
        <ToolbarButton
          icon={
            <img 
                src={ListOrdered} 
                alt="Нумерованный список" 
                className="h-4 w-4"
                style={state.isOrderedList ? { filter: redFilter } : {}}
              />
          }
          onClick={() => handleListAction(editor, 'orderedList')}
          pressed={state.isOrderedList}
          disabled={!state.canOrderedList}
          isFirst={false}
          isLast={false}
          isInGroup={true}
          aria-label="Нумерованный список"
        />
        <ToolbarButton
          icon={
            <img 
                src={ListChecks} 
                alt="Чеклист" 
                className="h-4 w-4"
                style={state.isTaskList ? { filter: redFilter } : {}}
              />
          }
          onClick={() => handleListAction(editor, 'taskList')}
          pressed={state.isTaskList}
          disabled={!state.canTaskList}
          isFirst={false}
          isLast={true}
          isInGroup={true}
          aria-label="Чеклист"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={AtSign} 
              alt="Ссылка" 
              className="h-4 w-4"
              style={state.isLink ? { filter: redFilter } : {}}
            />
          }
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenLinkModal({ top: rect.bottom + 8, left: rect.left });
          }}
          pressed={state.isLink}
          isFirst={true}
          isLast={true}
          isInGroup={true}
          aria-label="Вставить ссылку"
        />

        {onCreateComment ? (
          <ToolbarButton
            icon={
              <span className="flex items-center gap-1 px-0.5">
                <MessageSquare className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />
                {commentCount > 0 ? <span className="text-[11px] font-semibold">{commentCount}</span> : null}
              </span>
            }
            onClick={() => onCreateComment(editor)}
            isFirst={true}
            isLast={true}
            isInGroup={true}
            aria-label="Комментировать выделение"
          />
        ) : null}

        {onOpenTimeMachine ? (
          <ToolbarButton
            icon={<History className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
            onClick={onOpenTimeMachine}
            isFirst={true}
            isLast={true}
            isInGroup={true}
            aria-label="Открыть машину времени"
          />
        ) : null}

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={Code2} 
              alt="Блок кода" 
              className="h-4 w-4"
              style={state.isCodeBlock ? { filter: redFilter } : {}}
            />
          }
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          pressed={state.isCodeBlock}
          disabled={!state.canCodeBlock}
          isFirst={true}
          isLast={true}
          isInGroup={true}
          aria-label="Блок кода"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={Quote} 
              alt="Цитата" 
              className="h-4 w-4"
              style={state.isBlockquote ? { filter: redFilter } : {}}
            />
          }
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          pressed={state.isBlockquote}
          isFirst={true}
          isLast={true}
          isInGroup={true}
          aria-label="Цитата"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={Picture} 
              alt="Картинка" 
              className="h-4 w-4"
            />
          }
          label="Img"
          onClick={() => onOpenImageModal()}
          isFirst={true}
          isLast={true}
          isInGroup={true}
        />

        {state.isLink && state.linkHref ? (
          <div className="mx-1 inline-flex h-8 min-w-[15rem] items-center rounded-md border border-[#d2d8e3] bg-[#eef2ff] px-2 text-xs text-[#2a3962]">
            <span className="mr-2 shrink-0 font-semibold">Ссылка:</span>
            <span className="truncate">{state.linkLabel}</span>
            <span className="mx-2 text-[#6b7898]">|</span>
            <span className="truncate text-[#546384]">{state.linkHref}</span>
          </div>
        ) : null}

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={
            <img 
              src={BrushCleaning} 
              alt="Очистить форматирование" 
              className="h-4 w-4"
            />
          }
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().setParagraph().run()}
          disabled={!state.canClearFormatting}
          isFirst={true}
          isLast={true}
          isInGroup={true}
          aria-label="Очистить форматирование"
        />
      </div>
    </div>
  );
}
