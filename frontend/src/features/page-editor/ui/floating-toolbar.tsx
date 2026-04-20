import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Code2, List, ListOrdered, ListChecks, MessageSquare, MonitorPlay, Highlighter, BookmarkPlus, Link } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { handleListAction } from '../model/list-actions';
import { menuBarStateSelector } from '../model/menu-state';
import { getCanvasDrawSettings, getIframeEmbedSettings, getBookmarkSettings } from '../../plugins/model/plugin-registry';
import { ensureBoundaryBlocksAfterInsert } from '../model/boundary-block-utils';
import { usePlugins } from '../../plugins';
import { type AiTransformStyleId, wikiliveApi } from '../../../shared/api/wikilive';
import { HighlightColorPicker } from './highlight-color-picker';
import { CreateBookmarkModal, BookmarkPickerModal, collectBookmarks } from './bookmark-modal';

import B from '../../../app/images/B.svg';
import Tk from '../../../app/images/Tk.svg';
import T1 from '../../../app/images/T1.svg';
import U from '../../../app/images/U.svg';
import H1 from '../../../app/images/H1.svg';
import H2 from '../../../app/images/H2.svg';
import H3 from '../../../app/images/H3.svg';

const redFilter = 'brightness(0) saturate(100%) invert(36%) sepia(94%) saturate(2665%) hue-rotate(346deg) brightness(101%) contrast(97%)';
const STYLE_USAGE_STORAGE_KEY = 'wikilive:ai-style-usage';
const QUICK_ACCESS_DEFAULT_STYLE_ID: AiTransformStyleId = 'executive_summary';

type StyleUsageCounters = Partial<Record<AiTransformStyleId, number>>;

const IMPROVE_STYLE_OPTIONS: Array<{
  id: string;
  styleId: AiTransformStyleId;
  label: string;
  transformation: 'professional' | 'shorten' | 'fix_grammar';
  omitStyleId?: boolean;
}> = [
  { id: 'technical', styleId: 'technical', label: '🛠️ Технический', transformation: 'professional' },
  { id: 'executive_summary', styleId: 'executive_summary', label: '📊 Кратко для руководства', transformation: 'shorten' },
  { id: 'shorten_plain', styleId: 'technical', label: '✂️ Сократить', transformation: 'shorten', omitStyleId: true },
  { id: 'action_plan', styleId: 'action_plan', label: '✅ План действий', transformation: 'professional' },
  { id: 'legal_formal', styleId: 'legal_formal', label: '🧾 Официально-деловой', transformation: 'professional' },
  { id: 'fix_grammar', styleId: 'fix_grammar', label: '✍️ Корректор', transformation: 'fix_grammar' },
];

function readStyleUsageCounters(): StyleUsageCounters {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STYLE_USAGE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const counters: StyleUsageCounters = {};

    for (const option of IMPROVE_STYLE_OPTIONS) {
      const value = parsed[option.styleId];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        counters[option.styleId] = value;
      }
    }

    return counters;
  } catch {
    return {};
  }
}

type FloatingToolbarProps = {
  editor: Editor | null;
  canEdit?: boolean;
  onOpenLinkModal: () => void;
  onOpenIframeModal: () => void;
  onCreateComment?: (editor: Editor) => void;
  pageTitle?: string;
  isAiTransformEnabled?: boolean;
};

type ToolbarButtonProps = {
  icon: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onClick: ((event: React.MouseEvent<HTMLButtonElement>) => void) | (() => void);
  'aria-label'?: string;
};

type AiTransformUndoEntry = {
  from: number;
  transformedText: string;
  originalText: string;
};

function ToolbarButton({
  icon,
  pressed = false,
  disabled = false,
  isFirst = false,
  isLast = false,
  onClick,
  'aria-label': ariaLabel,
}: ToolbarButtonProps) {
  const radiusClasses = isFirst && isLast
    ? 'rounded'
    : isFirst
      ? 'rounded-l'
      : isLast
        ? 'rounded-r'
        : 'rounded-none';

  const marginClass = !isFirst ? '-ml-px' : '';

  const className = [
    'inline-flex shrink-0 items-center justify-center transition-colors relative',
    'h-7 min-w-7 px-1',
    marginClass,
    radiusClasses,
    'border border-editor-border-control bg-white text-[rgba(80,87,98,1)] hover:bg-[#e8ebf1]',
    pressed ? 'border-red-500 !border-opacity-100 bg-[#f5f7fa]' : '',
    disabled ? 'cursor-not-allowed opacity-45 hover:bg-white' : '',
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
      {icon}
    </button>
  );
}

export function FloatingToolbar({
  editor,
  canEdit = true,
  onOpenLinkModal,
  onOpenIframeModal,
  onCreateComment,
  pageTitle,
  isAiTransformEnabled = true,
}: FloatingToolbarProps) {
  const { items: plugins } = usePlugins();
  const canvasSettings = getCanvasDrawSettings(plugins);
  const iframeSettings = getIframeEmbedSettings(plugins);
  const bookmarkSettings = getBookmarkSettings(plugins);
  const showCanvasButton = plugins.some(p => p.id === 'canvas-draw' && p.enabled) && canvasSettings['floating-toolbar'];
  const showIframeButton = plugins.some(p => p.id === 'iframe-embed' && p.enabled) && iframeSettings['floating-toolbar'];
  const showBookmarkButtons = plugins.some(p => p.id === 'bookmarks' && p.enabled) && bookmarkSettings['floating-toolbar'];
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxWidth: 0 });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [highlightPickerAnchor, setHighlightPickerAnchor] = useState<DOMRect | null>(null);
  const [createBookmarkAnchor, setCreateBookmarkAnchor] = useState<DOMRect | null>(null);
  const [bookmarkPickerAnchor, setBookmarkPickerAnchor] = useState<DOMRect | null>(null);
  const [isImproveMenuOpen, setIsImproveMenuOpen] = useState(false);
  const [aiLoadingAction, setAiLoadingAction] = useState<'styles' | 'default_style' | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [styleUsageCounters, setStyleUsageCounters] = useState<StyleUsageCounters>(() => readStyleUsageCounters());
  const toolbarRef = useRef<HTMLDivElement>(null);
  const lastAiTransformUndoRef = useRef<AiTransformUndoEntry | null>(null);

  const quickAccessPreset = useMemo(() => {
    let best = IMPROVE_STYLE_OPTIONS.find((option) => option.styleId === QUICK_ACCESS_DEFAULT_STYLE_ID) ?? IMPROVE_STYLE_OPTIONS[0];
    let bestScore = Number(styleUsageCounters[best.styleId] ?? 0);

    for (const option of IMPROVE_STYLE_OPTIONS) {
      const score = Number(styleUsageCounters[option.styleId] ?? 0);
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }

    return best;
  }, [styleUsageCounters]);

  const quickAccessButtonLabel =
    quickAccessPreset.styleId === QUICK_ACCESS_DEFAULT_STYLE_ID
      ? '✂️ Сократить'
      : '⚡ Наиболее частая функция';

  const registerStyleUsage = useCallback((styleId: AiTransformStyleId) => {
    setStyleUsageCounters((previous) => {
      const nextValue = Number(previous[styleId] ?? 0) + 1;
      const next: StyleUsageCounters = {
        ...previous,
        [styleId]: nextValue,
      };

      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STYLE_USAGE_STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        // Ignore local storage failures; quick access still works for current session.
      }

      return next;
    });
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z') {
        return;
      }

      if (!editor.isFocused) {
        return;
      }

      const canUndoNatively = editor.commands.undo?.();
      if (canUndoNatively) {
        return;
      }

      const snapshot = lastAiTransformUndoRef.current;
      if (!snapshot) {
        return;
      }

      const current = editor.state.doc.textBetween(
        snapshot.from,
        snapshot.from + snapshot.transformedText.length,
        '\n',
      );

      if (current !== snapshot.transformedText) {
        return;
      }

      event.preventDefault();
      editor.chain().focus().insertContentAt(
        { from: snapshot.from, to: snapshot.from + snapshot.transformedText.length },
        snapshot.originalText,
      ).run();

      lastAiTransformUndoRef.current = null;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const state = useEditorState({
    editor,
    selector: menuBarStateSelector,
  });

  const updatePosition = useCallback(() => {
    if (!editor) return;

    const editorState = editor.state;
    const { from, to, empty } = editorState.selection;

    if (empty) {
      setVisible(false);
      setIsImproveMenuOpen(false);
      setAiErrorMessage(null);
      return;
    }

    let hasTextContent = false;
    editorState.doc.nodesBetween(from, to, (node) => {
      if (node.isText) {
        hasTextContent = true;
      }
    });

    if (!hasTextContent) {
      setVisible(false);
      setIsImproveMenuOpen(false);
      setAiErrorMessage(null);
      return;
    }

    const view = editor.view;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    const surface = document.querySelector('[data-page-editor-surface]') as HTMLElement | null;
    const surfaceRect = surface?.getBoundingClientRect();
    const surfaceScrollLeft = surface?.scrollLeft ?? 0;
    const surfaceScrollTop = surface?.scrollTop ?? 0;
    const toolbarWidth = toolbarRef.current?.getBoundingClientRect().width ?? 0;
    const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0;
    const margin = 8;

    let absoluteTop = Math.min(start.top, end.top);
    let absoluteBottom = Math.max(start.bottom, end.bottom);
    let absoluteLeft = (start.left + end.left) / 2;

    const domSelection = view.dom?.ownerDocument?.getSelection();
    if (domSelection && domSelection.rangeCount > 0) {
      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const hasNonZeroSelection = rect.width > 0 && rect.height > 0;

      if (hasNonZeroSelection) {
        absoluteTop = rect.top;
        absoluteBottom = rect.bottom;
        absoluteLeft = rect.left + rect.width / 2;
      } else {
        const domPoint = view.domAtPos(from);
        const nodeElement =
          domPoint.node instanceof HTMLElement
            ? domPoint.node
            : domPoint.node.parentElement;

        if (nodeElement) {
          const nodeRect = nodeElement.getBoundingClientRect();
          absoluteTop = nodeRect.top;
          absoluteBottom = nodeRect.bottom;
          absoluteLeft = start.left;
        }
      }
    }

    const headerElement = document.querySelector('[data-page-editor-header]') as HTMLElement | null;
    const headerRect = headerElement?.getBoundingClientRect();
    if (headerRect && absoluteTop <= headerRect.bottom + 4) {
      setVisible(false);
      setIsImproveMenuOpen(false);
      return;
    }

    const leftMenuOpenButton = document.querySelector('button[aria-label="Показать левое меню"]') as HTMLElement | null;
    const leftMenuButtonRect = leftMenuOpenButton?.getBoundingClientRect();
    const safeLeftEdge = leftMenuButtonRect ? leftMenuButtonRect.right + 10 : 0;
    const rightMenuOpenButton = document.querySelector('button[aria-label="Показать правое меню"]') as HTMLElement | null;
    const rightMenuButtonRect = rightMenuOpenButton?.getBoundingClientRect();
    const safeRightEdge = rightMenuButtonRect ? rightMenuButtonRect.left - 10 : Number.POSITIVE_INFINITY;

    const minCenterLeft = surfaceRect
      ? Math.max(surfaceRect.left + margin + toolbarWidth / 2, safeLeftEdge + toolbarWidth / 2)
      : Math.max(margin + toolbarWidth / 2, safeLeftEdge + toolbarWidth / 2);
    const maxCenterLeft = surfaceRect
      ? Math.min(surfaceRect.right - margin - toolbarWidth / 2, safeRightEdge - toolbarWidth / 2)
      : Math.min(window.innerWidth - margin - toolbarWidth / 2, safeRightEdge - toolbarWidth / 2);
    const clampedCenterLeft = Math.max(
      minCenterLeft,
      Math.min(absoluteLeft, Math.max(minCenterLeft, maxCenterLeft)),
    );

    const verticalGap = 10;
    const minTop = surfaceRect ? surfaceRect.top + margin : margin;
    const maxTop = surfaceRect
      ? surfaceRect.bottom - margin - toolbarHeight
      : window.innerHeight - margin - toolbarHeight;

    const preferredTopAbove = absoluteTop - toolbarHeight - verticalGap;
    const preferredTopBelow = absoluteBottom + verticalGap;
    const canPlaceAbove = preferredTopAbove >= minTop;
    const canPlaceBelow = preferredTopBelow <= maxTop;

    let desiredTop: number;
    if (canPlaceAbove) {
      desiredTop = preferredTopAbove;
    } else if (canPlaceBelow) {
      desiredTop = preferredTopBelow;
    } else {
      const spaceAbove = Math.max(0, absoluteTop - minTop);
      const spaceBelow = Math.max(0, maxTop - absoluteBottom);
      desiredTop = spaceBelow > spaceAbove ? preferredTopBelow : preferredTopAbove;
    }

    const clampedTop = Math.max(minTop, Math.min(desiredTop, Math.max(minTop, maxTop)));

    const top = surfaceRect
      ? clampedTop - surfaceRect.top + surfaceScrollTop
      : clampedTop;
    const left = surfaceRect
      ? clampedCenterLeft - surfaceRect.left + surfaceScrollLeft
      : clampedCenterLeft;

    const maxWidth = surfaceRect
      ? Math.max(280, surfaceRect.width - margin * 2)
      : Math.max(280, window.innerWidth - margin * 2);

    setPosition({ top, left, maxWidth });
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    updatePosition();

    editor.on('transaction', updatePosition);

    return () => {
      editor.off('transaction', updatePosition);
    };
  }, [editor, updatePosition]);

  useEffect(() => {
    if (!isImproveMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!toolbarRef.current?.contains(target)) {
        setIsImproveMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isImproveMenuOpen]);

  useEffect(() => {
    if (!editor || !visible) {
      return;
    }

    const surface = document.querySelector('[data-page-editor-surface]') as HTMLElement | null;
    const header = document.querySelector('[data-page-editor-header]') as HTMLElement | null;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updatePosition()) : null;

    if (surface && observer) {
      observer.observe(surface);
    }
    if (toolbarRef.current && observer) {
      observer.observe(toolbarRef.current);
    }
    if (header && observer) {
      observer.observe(header);
    }

    const onWindowResize = () => updatePosition();
    const onWindowScroll = () => updatePosition();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('scroll', onWindowScroll, true);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('scroll', onWindowScroll, true);
    };
  }, [editor, visible, updatePosition]);

  if (!editor || !state || !visible) {
    return null;
  }

  if (!canEdit && !onCreateComment) {
    return null;
  }

  const getEditorMarkdown = () => {
    const markdownStorage = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown;

    if (markdownStorage?.getMarkdown) {
      return markdownStorage.getMarkdown();
    }

    return editor.getText();
  };

  const runAiTransform = async (
    transformation: 'professional' | 'shorten' | 'expand' | 'fix_grammar',
    options: { styleId?: AiTransformStyleId; action: 'styles' | 'default_style' },
  ) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, '\n').trim();
    if (!selectedText) {
      return;
    }

    try {
      setIsAiLoading(true);
      setAiLoadingAction(options.action);
      setAiErrorMessage(null);

      const requestPayload = {
        text: selectedText,
        transformation,
        styleId: options.styleId,
        pageTitle,
        pageSnapshot: {
          markdown: getEditorMarkdown(),
        },
      };

      let response;
      try {
        response = await wikiliveApi.aiTransform(requestPayload);
      } catch {
        if (!options.styleId) {
          throw new Error('transform_failed_without_style');
        }

        response = await wikiliveApi.aiTransform({
          ...requestPayload,
          styleId: undefined,
        });
      }

      editor.chain().focus().insertContentAt({ from, to }, response.text).run();

      lastAiTransformUndoRef.current = {
        from,
        transformedText: response.text,
        originalText: selectedText,
      };

      if (options.styleId) {
        registerStyleUsage(options.styleId);
      }
    } catch {
      setAiErrorMessage('AI не смог изменить текст. Попробуйте другой стиль или повторите снова.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingAction(null);
      setIsImproveMenuOpen(false);
    }
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    top: position.top,
    left: position.left,
    transform: 'translateX(-50%)',
    zIndex: 40,
    maxWidth: position.maxWidth > 0 ? position.maxWidth : undefined,
    width: 'max-content',
  };

  return (
    <div
      ref={toolbarRef}
      style={style}
      className="relative flex max-w-full flex-wrap items-center gap-0 rounded-md border border-editor-border-control bg-white p-0.5 shadow-lg"
      role="toolbar"
      aria-label="Плавающая панель форматирования"
    >
      <ToolbarButton
        icon={
          <img
            src={B}
            alt="Полужирное начертание"
            className="h-3.5 w-3.5"
            style={state.isBold ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleBold().run()}
        pressed={state.isBold}
        disabled={!canEdit || !state.canBold}
        isFirst={true}
        isLast={false}
        aria-label="Полужирный (Ctrl+B)"
      />
      <ToolbarButton
        icon={
          <img
            src={Tk}
            alt="Курсивное начертание"
            className="h-3.5 w-3.5"
            style={state.isItalic ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleItalic().run()}
        pressed={state.isItalic}
        disabled={!canEdit || !state.canItalic}
        isFirst={false}
        isLast={false}
        aria-label="Курсив (Ctrl+I)"
      />
      <ToolbarButton
        icon={
          <img
            src={T1}
            alt="Зачёркнутый текст"
            className="h-3.5 w-3.5"
            style={state.isStrike ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleStrike().run()}
        pressed={state.isStrike}
        disabled={!canEdit || !state.canStrike}
        isFirst={false}
        isLast={false}
        aria-label="Зачёркнутый"
      />
      <ToolbarButton
        icon={
          <img
            src={U}
            alt="Подчёркнутый текст"
            className="h-3.5 w-3.5"
            style={state.isUnderline ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleUnderline?.().run()}
        pressed={state.isUnderline}
        disabled={!canEdit || !state.canUnderline}
        isFirst={false}
        isLast={false}
        aria-label="Подчёркнутый (Ctrl+U)"
      />
      <ToolbarButton
        icon={
          <Highlighter
            className="h-3.5 w-3.5"
            style={state.isHighlight ? { color: '#d92c2c' } : { color: 'rgba(80, 87, 98, 1)' }}
          />
        }
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          if (!canEdit) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setHighlightPickerAnchor(rect);
        }}
        pressed={state.isHighlight}
        disabled={!canEdit || !state.canHighlight}
        isFirst={false}
        isLast={false}
        aria-label="Выделить маркером"
      />
      <ToolbarButton
        icon={
          <Code2
            className="h-3.5 w-3.5"
            style={state.isCodeBlock ? { filter: redFilter } : { color: 'rgba(80, 87, 98, 1)' }}
          />
        }
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        pressed={state.isCodeBlock}
        disabled={!canEdit || !state.canCodeBlock}
        isFirst={false}
        isLast={true}
        aria-label="Код"
      />
      {canEdit ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

          <ToolbarButton
            icon={
              <img
                src={H1}
                alt="Заголовок 1 уровня"
                className="h-3.5 w-3.5"
                style={state.isHeading1 ? { filter: redFilter } : {}}
              />
            }
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            pressed={state.isHeading1}
            isFirst={true}
            isLast={false}
            aria-label="Заголовок 1"
          />
          <ToolbarButton
            icon={
              <img
                src={H2}
                alt="Заголовок 2 уровня"
                className="h-3.5 w-3.5"
                style={state.isHeading2 ? { filter: redFilter } : {}}
              />
            }
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            pressed={state.isHeading2}
            isFirst={false}
            isLast={false}
            aria-label="Заголовок 2"
          />
          <ToolbarButton
            icon={
              <img
                src={H3}
                alt="Заголовок 3 уровня"
                className="h-3.5 w-3.5"
                style={state.isHeading3 ? { filter: redFilter } : {}}
              />
            }
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            pressed={state.isHeading3}
            isFirst={false}
            isLast={true}
            aria-label="Заголовок 3"
          />

          <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

          <ToolbarButton
            icon={<List className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
            onClick={() => handleListAction(editor, 'bulletList')}
            pressed={state.isBulletList}
            disabled={!state.canBulletList}
            isFirst={true}
            isLast={false}
            aria-label="Маркированный список"
          />
          <ToolbarButton
            icon={<ListOrdered className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
            onClick={() => handleListAction(editor, 'orderedList')}
            pressed={state.isOrderedList}
            disabled={!state.canOrderedList}
            isFirst={false}
            isLast={false}
            aria-label="Нумерованный список"
          />
          <ToolbarButton
            icon={<ListChecks className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
            onClick={() => handleListAction(editor, 'taskList')}
            pressed={state.isTaskList}
            disabled={!state.canTaskList}
            isFirst={false}
            isLast={true}
            aria-label="Чеклист"
          />

          <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              if (state.isLink && state.canUnsetLink) {
                editor.chain().focus().unsetLink().run();
              } else {
                onOpenLinkModal();
              }
            }}
            className={[
              'inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded text-xs font-semibold transition-colors',
              'border border-editor-border-control bg-transparent text-[rgba(80,87,98,1)] hover:bg-[#e8ebf1]',
              state.isLink ? 'border-red-500 !border-opacity-100 bg-[#f5f7fa]' : '',
            ].join(' ')}
            aria-label={state.isLink ? 'Удалить ссылку' : 'Вставить ссылку'}
          >
            @
          </button>
        </>
      ) : null}

      {onCreateComment ? (
        <ToolbarButton
          icon={<MessageSquare className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
          onClick={() => onCreateComment(editor)}
          isFirst={false}
          isLast={false}
          aria-label="Комментировать выделение"
        />
      ) : null}

      {showCanvasButton && (
        <ToolbarButton
          icon={<span className="px-1 text-[11px] font-semibold">🎨</span>}
          onClick={() => {
            editor.chain().focus().insertCanvasBlock().run();
            ensureBoundaryBlocksAfterInsert(editor);
          }}
          isFirst={false}
          isLast={false}
          aria-label="Вставить блок для рисования"
        />
      )}

      {showIframeButton && (
        <ToolbarButton
          icon={<MonitorPlay className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
          onClick={onOpenIframeModal}
          isFirst={false}
          isLast={false}
          aria-label="Встроить iframe"
        />
      )}

      <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

      {canEdit && isAiTransformEnabled ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

          <div className="relative">
            <ToolbarButton
              icon={(
                <span className="inline-flex items-center gap-1 px-1 text-[11px] font-semibold">
                  {isAiLoading && aiLoadingAction === 'styles' ? (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-[rgba(80,87,98,0.45)] border-t-[rgba(80,87,98,1)]" />
                  ) : null}
                  Стили
                  <span className={[
                    'text-[10px] transition-transform duration-200',
                    isImproveMenuOpen ? 'rotate-180' : 'rotate-0',
                  ].join(' ')}>
                    ▾
                  </span>
                </span>
              )}
              onClick={() => setIsImproveMenuOpen(prev => !prev)}
              disabled={isAiLoading}
              isFirst={true}
              isLast={false}
              aria-label="Открыть список стилей"
            />

            <div
              className={[
                'absolute left-0 top-[calc(100%+6px)] z-50 w-56 origin-top rounded-md border border-editor-border-control bg-white p-1 shadow-lg transition-all duration-200',
                isImproveMenuOpen
                  ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                  : 'pointer-events-none -translate-y-1 scale-95 opacity-0',
              ].join(' ')}
              role="menu"
              aria-label="Выбор стиля улучшения"
            >
              {IMPROVE_STYLE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    void runAiTransform(option.transformation, {
                      styleId: option.omitStyleId ? undefined : option.styleId,
                      action: 'styles',
                    })
                  }
                  disabled={isAiLoading}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs font-medium text-[rgba(47,54,66,1)] transition-colors hover:bg-[#edf0f5] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{option.label}</span>
                  <span className="text-[10px] text-[rgba(103,111,123,1)]">{option.omitStyleId ? 'shorten' : option.styleId}</span>
                </button>
              ))}
            </div>
          </div>
          <ToolbarButton
            icon={(
              <span className="inline-flex items-center gap-1 px-1 text-[11px] font-semibold">
                {isAiLoading && aiLoadingAction === 'default_style' ? (
                  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-[rgba(80,87,98,0.45)] border-t-[rgba(80,87,98,1)]" />
                ) : null}
                {quickAccessButtonLabel}
              </span>
            )}
            onClick={() =>
              void runAiTransform(quickAccessPreset.transformation, {
                styleId: quickAccessPreset.styleId,
                action: 'default_style',
              })
            }
            disabled={isAiLoading}
            isFirst={false}
            isLast={true}
            aria-label={`Быстрый доступ: ${quickAccessPreset.label}`}
          />
        </>
      ) : null}

      <HighlightColorPicker
        editor={editor}
        isOpen={Boolean(highlightPickerAnchor)}
        anchorRect={highlightPickerAnchor}
        toolbarRef={toolbarRef}
        onClose={() => setHighlightPickerAnchor(null)}
      />

      {showBookmarkButtons && canEdit ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />
          <ToolbarButton
            icon={<BookmarkPlus className="h-3.5 w-3.5" style={{ color: state.isBookmark ? '#7b67ee' : 'rgba(80,87,98,1)' }} />}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setCreateBookmarkAnchor(e.currentTarget.getBoundingClientRect());
            }}
            pressed={state.isBookmark}
            isFirst={true}
            isLast={false}
            aria-label="Создать закладку"
          />
          <ToolbarButton
            icon={<Link className="h-3.5 w-3.5" style={{ color: state.isBookmarkLink ? '#7b67ee' : 'rgba(80,87,98,1)' }} />}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setBookmarkPickerAnchor(e.currentTarget.getBoundingClientRect());
            }}
            pressed={state.isBookmarkLink}
            isFirst={false}
            isLast={true}
            aria-label="Ссылка на закладку"
          />
        </>
      ) : null}

      <CreateBookmarkModal
        isOpen={Boolean(createBookmarkAnchor)}
        anchorRect={createBookmarkAnchor}
        onConfirm={(label) => {
          editor.chain().focus().setBookmark({ id: `bm-${Date.now()}`, label }).run();
          setCreateBookmarkAnchor(null);
        }}
        onClose={() => setCreateBookmarkAnchor(null)}
      />
      <BookmarkPickerModal
        isOpen={Boolean(bookmarkPickerAnchor)}
        anchorRect={bookmarkPickerAnchor}
        bookmarks={collectBookmarks(editor)}
        onSelect={(id) => {
          editor.chain().focus().setBookmarkLink({ bookmarkId: id }).run();
          setBookmarkPickerAnchor(null);
        }}
        onClose={() => setBookmarkPickerAnchor(null)}
      />

      {aiErrorMessage ? (
        <div className="ml-2 max-w-[240px] text-[11px] font-medium text-[#b00025]" aria-live="polite">
          {aiErrorMessage}
        </div>
      ) : null}
    </div>
  );
}
