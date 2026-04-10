import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { useEditorState } from '@tiptap/react';
import type { MouseEvent } from 'react';

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

import {
  List,
  ListOrdered,
  Quote,
  Code2,
  Image,
  ListChecks,
} from 'lucide-react';

const redFilter = 'brightness(0) saturate(100%) invert(36%) sepia(94%) saturate(2665%) hue-rotate(346deg) brightness(101%) contrast(97%)';

type PageEditorToolbarProps = {
  editor: Editor | null;
  onOpenLinkModal: (position?: { top: number; left: number }) => void;
  onOpenImageModal: () => void;
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
    pressed && isInGroup ? 'border-red-500 !border-opacity-100' : '',
    pressed && !isInGroup ? 'border-red-500 !border-opacity-100' : '',
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

export function PageEditorToolbar({ editor, onOpenLinkModal, onOpenImageModal }: PageEditorToolbarProps) {
  const state =
    useEditorState({
      editor,
      selector: menuBarStateSelector,
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
      isImage: false,
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

  const getSelectedRootBlocks = () => {
    const { state } = editor;
    const { selection, schema, doc } = state;
    const rootBlockType = schema.nodes.rootblock;

    if (!rootBlockType || selection.empty) {
      return [] as Array<{ pos: number; node: ProseMirrorNode }>;
    }

    const selectedRootBlocks: Array<{ pos: number; node: ProseMirrorNode }> = [];

    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (node.type === rootBlockType && parent === doc) {
        selectedRootBlocks.push({ pos, node });
      }
    });

    return selectedRootBlocks;
  };

  const unwrapSelectionFromList = (listTypeName: 'bulletList' | 'orderedList' | 'taskList') => {
    const { state, view } = editor;
    const { selection, schema } = state;

    if (selection.empty) {
      return false;
    }

    const selectedRootBlocks = getSelectedRootBlocks();
    if (selectedRootBlocks.length === 0) {
      return false;
    }

    const rootBlockType = schema.nodes.rootblock;
    const paragraphType = schema.nodes.paragraph;
    const listType = schema.nodes[listTypeName];

    if (!rootBlockType || !paragraphType || !listType) {
      return false;
    }

    // Unwrap only when the whole selected region is this exact list type.
    if (!selectedRootBlocks.every(({ node }) => node.firstChild?.type === listType)) {
      return false;
    }

    let hasSelectedItems = false;
    let tr = state.tr;

    [...selectedRootBlocks]
      .sort((a, b) => b.pos - a.pos)
      .forEach(({ pos, node }) => {
        const listNode = node.firstChild;
        if (!listNode) {
          return;
        }

        const listPos = pos + 1;
        const selectedIndexes = new Set<number>();

        listNode.forEach((item, offset, index) => {
          const itemFrom = listPos + 1 + offset;
          const itemTo = itemFrom + item.nodeSize;
          const intersectsSelection = itemFrom < selection.to && itemTo > selection.from;

          if (intersectsSelection) {
            selectedIndexes.add(index);
          }
        });

        if (selectedIndexes.size === 0) {
          return;
        }

        hasSelectedItems = true;
        const replacementNodes: ProseMirrorNode[] = [];
        let pendingListItems: ProseMirrorNode[] = [];

        listNode.forEach((item, _offset, index) => {
          const isSelected = selectedIndexes.has(index);

          if (!isSelected) {
            pendingListItems.push(item);
            return;
          }

          if (pendingListItems.length > 0) {
            replacementNodes.push(rootBlockType.create(null, [listType.create(listNode.attrs, pendingListItems)]));
            pendingListItems = [];
          }

          const paragraphSource = item.firstChild;
          const paragraphContent = paragraphSource?.type === paragraphType ? paragraphSource.content : item.textContent ? schema.text(item.textContent) : null;
          const paragraphNode = paragraphType.create(
            paragraphSource?.type === paragraphType ? paragraphSource.attrs : null,
            paragraphContent,
          );

          replacementNodes.push(rootBlockType.create(null, [paragraphNode]));
        });

        if (pendingListItems.length > 0) {
          replacementNodes.push(rootBlockType.create(null, [listType.create(listNode.attrs, pendingListItems)]));
        }

        if (replacementNodes.length > 0) {
          tr = tr.replaceWith(pos, pos + node.nodeSize, replacementNodes);
        }
      });

    if (!hasSelectedItems) {
      return false;
    }

    tr = tr.scrollIntoView();
    view.dispatch(tr);
    editor.commands.focus(Math.max(1, selectedRootBlocks[0].pos + 2));
    return true;
  };

  const convertSelectionToList = (listTypeName: 'bulletList' | 'orderedList' | 'taskList') => {
    if (!editor) {
      return false;
    }

    const { state, view } = editor;
    const { selection, schema, doc } = state;

    if (selection.empty) {
      return false;
    }

    const rootBlockType = schema.nodes.rootblock;
    const paragraphType = schema.nodes.paragraph;
    const listType = schema.nodes[listTypeName];
    const itemType = listTypeName === 'taskList' ? schema.nodes.taskItem : schema.nodes.listItem;

    if (!rootBlockType || !paragraphType || !listType || !itemType) {
      return false;
    }

    const selectedRootBlocks = getSelectedRootBlocks();

    if (selectedRootBlocks.length === 0) {
      return false;
    }

    const listItems = selectedRootBlocks
      .map(({ node }) => {
        const firstChild = node.firstChild;
        const text = (firstChild?.textContent ?? '').trim();
        const paragraphContent = text ? state.schema.text(text) : null;
        const paragraph = paragraphType.create(
          firstChild?.type === paragraphType ? firstChild.attrs : null,
          firstChild?.type === paragraphType ? firstChild.content : paragraphContent,
        );

        if (listTypeName === 'taskList') {
          return itemType.create({ checked: false }, [paragraph]);
        }

        return itemType.create(null, [paragraph]);
      })
      .filter(Boolean);

    if (listItems.length === 0) {
      return false;
    }

    const from = selectedRootBlocks[0].pos;
    const last = selectedRootBlocks[selectedRootBlocks.length - 1];
    const to = last.pos + last.node.nodeSize;
    const listNode = listType.create(null, listItems);
    const newRootBlock = rootBlockType.create(null, [listNode]);

    let tr = state.tr.replaceWith(from, to, newRootBlock);
    tr = tr.scrollIntoView();
    view.dispatch(tr);
    editor.commands.focus(from + 2);

    return true;
  };

  const handleListAction = (listTypeName: 'bulletList' | 'orderedList' | 'taskList') => {
    if (unwrapSelectionFromList(listTypeName)) {
      return;
    }

    if (convertSelectionToList(listTypeName)) {
      return;
    }

    if (listTypeName === 'bulletList') {
      editor.chain().focus().toggleBulletList().run();
      return;
    }

    if (listTypeName === 'orderedList') {
      editor.chain().focus().toggleOrderedList().run();
      return;
    }

    editor.chain().focus().toggleTaskList().run();
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
          size="sm"
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
          size="sm"
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
          size="sm"
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
          size="sm"
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
          label="L"
          onClick={() => alignSelection('left')}
          pressed={state.isAlignLeft}
          isFirst={true}
          isLast={false}
          isInGroup={true}
        />
        <ToolbarButton
          label="C"
          onClick={() => alignSelection('center')}
          pressed={state.isAlignCenter}
          isFirst={false}
          isLast={false}
          isInGroup={true}
        />
        <ToolbarButton
          label="R"
          onClick={() => alignSelection('right')}
          pressed={state.isAlignRight}
          isFirst={false}
          isLast={true}
          isInGroup={true}
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={<List className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
          onClick={() => handleListAction('bulletList')}
          pressed={state.isBulletList}
          disabled={!state.canBulletList}
          isFirst={true}
          isLast={false}
          isInGroup={true}
          aria-label="Маркированный список"
        />
        <ToolbarButton
          icon={<ListOrdered className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
          onClick={() => handleListAction('orderedList')}
          pressed={state.isOrderedList}
          disabled={!state.canOrderedList}
          isFirst={false}
          isLast={false}
          isInGroup={true}
          aria-label="Нумерованный список"
        />
        <ToolbarButton
          icon={<ListChecks className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
          onClick={() => handleListAction('taskList')}
          pressed={state.isTaskList}
          disabled={!state.canTaskList}
          isFirst={false}
          isLast={true}
          isInGroup={true}
          aria-label="Чеклист"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          label="@"
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenLinkModal({ top: rect.bottom + 8, left: rect.left });
          }}
          pressed={state.isLink}
          isFirst={true}
          isLast={true}
          isInGroup={true}
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={<Code2 className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          pressed={state.isCodeBlock}
          disabled={!state.canCodeBlock}
          isFirst={false}
          isLast={true}
          isInGroup={true}
          aria-label="Блок кода"
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          icon={<Quote className="h-4 w-4" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
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
            <Image className="h-4 w-4" 
              style={{ color: 'rgba(80, 87, 98, 1)' }} 
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
            <Image className="h-4 w-4" 
              style={{ color: 'rgba(80, 87, 98, 1)' }} 
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