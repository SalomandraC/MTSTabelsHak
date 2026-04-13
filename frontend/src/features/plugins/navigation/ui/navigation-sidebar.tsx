import type { Editor } from '@tiptap/core';
import { ChevronRight, List, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { usePlugins } from '../../model/plugins-context';
import { collectNavigationOutline, type NavigationOutlineNode } from '../model/navigation-outline';
import { runAutomaticMarkup } from '../model/auto-markup';

type NavigationSidebarProps = {
  editor: Editor | null;
  enabled: boolean;
  onClose: () => void;
};

function jumpToHeading(editor: Editor, node: NavigationOutlineNode) {
  const target = editor.view.nodeDOM(node.pos);

  editor.chain().focus().setTextSelection(node.pos + 1).run();

  window.requestAnimationFrame(() => {
    const element = target instanceof HTMLElement ? target : target?.parentElement;
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function NavigationItem({
  node,
  depth,
  isActive,
  activePos,
  onSelect,
}: {
  node: NavigationOutlineNode;
  depth: number;
  isActive: boolean;
  activePos: number | null;
  onSelect: (node: NavigationOutlineNode) => void;
}) {
  return (
    <div style={{ paddingLeft: `${depth * 14}px` }}>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={[
          'flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
          isActive
            ? 'border-[#d70032] bg-[#fff1f3] text-[#d70032]'
            : 'border-transparent bg-white hover:border-editor-border-subtle hover:bg-editor-bg-control',
        ].join(' ')}
      >
        <span className="mt-[1px] flex h-5 shrink-0 items-center rounded-md bg-[#fff1f3] px-1.5 text-[11px] font-semibold text-editor-text-tertiary">
          {node.number}
        </span>
        <span className="min-w-0 flex-1 max-w-[80%] truncate text-sm leading-5">
          {node.title}
        </span>
        <ChevronRight size={14} className="mt-[2px] shrink-0 opacity-40" />
      </button>
      {node.children.length > 0 ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <NavigationItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isActive={activePos === child.pos}
              activePos={activePos}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NavigationSidebar({ editor, enabled, onClose }: NavigationSidebarProps) {
  const [version, setVersion] = useState(0);
  const [isAutoMarkupRunning, setIsAutoMarkupRunning] = useState(false);
  const [autoMarkupStatus, setAutoMarkupStatus] = useState('');
  const [autoMarkupInstruction, setAutoMarkupInstruction] = useState('');
  const { isAiAssistantFeatureEnabled } = usePlugins();

  useEffect(() => {
    if (!editor) {
      return;
    }

    const refresh = () => setVersion((current) => current + 1);
    editor.on('update', refresh);
    editor.on('selectionUpdate', refresh);

    return () => {
      editor.off('update', refresh);
      editor.off('selectionUpdate', refresh);
    };
  }, [editor]);

  const outline = useMemo(() => collectNavigationOutline(editor), [editor, version]);
  const isAutoMarkupEnabled = isAiAssistantFeatureEnabled('document_structure');
  const activePos = useMemo(() => {
    if (!editor) {
      return null;
    }

    const selectionPos = editor.state.selection.from;

    const visit = (items: NavigationOutlineNode[]): number | null => {
      let found: number | null = null;

      for (const item of items) {
        if (item.pos <= selectionPos) {
          found = item.pos;
        }

        if (item.children.length > 0) {
          const childFound = visit(item.children);
          if (childFound !== null) {
            found = childFound;
          }
        }
      }

      return found;
    };

    return visit(outline);
  }, [editor, outline]);

  if (!enabled) {
    return null;
  }

  const handleAutomaticMarkup = async () => {
    if (!editor || isAutoMarkupRunning) {
      return;
    }

    setIsAutoMarkupRunning(true);
    setAutoMarkupStatus('Строю структуру...');

    try {
      const insertedCount = await runAutomaticMarkup(editor, {
        instruction: autoMarkupInstruction,
      });
      setAutoMarkupStatus(insertedCount > 0 ? `Вставлено заголовков: ${insertedCount}` : 'Не нашел подходящих мест для разметки');
    } catch (error) {
      setAutoMarkupStatus(error instanceof Error ? error.message : 'Не удалось выполнить автоматическую разметку');
    } finally {
      setIsAutoMarkupRunning(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-editor-text-primary">
      <header className="border-b border-editor-border-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d70032] bg-[#d70032] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
              <List size={12} strokeWidth={2.2} />
              Оглавление
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[#1d2023]">Навигация и структура</h2>
            <p className="mt-1 text-sm text-[#5f3647]">Автоматически собранная структура заголовков текущего документа.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#505762] hover:bg-[#f0f1f3]"
            aria-label="Закрыть навигацию"
          >
            <X size={16} />
          </button>
        </div>
        {isAutoMarkupEnabled ? (
          <div className="mt-4 space-y-2">
            <input
              type="text"
              value={autoMarkupInstruction}
              onChange={(event) => setAutoMarkupInstruction(event.target.value)}
              placeholder="Например: в введении редко, в разделе API часто"
              className="w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-xs text-editor-text-primary outline-none focus:border-[#fff1f3]"
            />
            <button
              type="button"
              onClick={() => void handleAutomaticMarkup()}
              disabled={!editor || isAutoMarkupRunning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d70032] bg-[#fff1f3] px-3 py-2.5 text-sm font-semibold text-[#d70032] transition-colors hover:bg-[#ffe5eb] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={15} strokeWidth={2.2} />
              {isAutoMarkupRunning ? 'Автоматическая разметка...' : 'Автоматическая разметка'}
            </button>
          </div>
        ) : null}
        {autoMarkupStatus ? <p className="mt-3 text-xs leading-5 text-[#5f3647]">{autoMarkupStatus}</p> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {outline.length > 0 ? (
          <div className="space-y-2">
            {outline.map((node) => (
              <NavigationItem
                key={node.id}
                node={node}
                depth={0}
                isActive={activePos === node.pos}
                activePos={activePos}
                onSelect={(target) => jumpToHeading(editor!, target)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-editor-border-subtle bg-[#fafbfc] px-6 text-center text-sm text-editor-text-tertiary">
            В документе пока нет заголовков H1, H2 или H3.
          </div>
        )}
      </div>
    </div>
  );
}
