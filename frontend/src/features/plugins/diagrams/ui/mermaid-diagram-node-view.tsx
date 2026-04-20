import { createPortal } from 'react-dom';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { DEFAULT_MERMAID_CODE, MERMAID_PRESETS } from '../model/mermaid-presets';
import { renderMermaidToSvg, resolveMermaidTheme } from '../model/mermaid-utils';

function useLiveTheme() {
  const [theme, setTheme] = useState<'default' | 'dark'>(resolveMermaidTheme());

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const refresh = () => {
      setTheme(resolveMermaidTheme());
    };

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme'],
      });
    }

    media.addEventListener('change', refresh);
    window.addEventListener('wikilive:theme-change', refresh as EventListener);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', refresh);
      window.removeEventListener('wikilive:theme-change', refresh as EventListener);
    };
  }, []);

  return theme;
}

export function MermaidDiagramNodeView({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
  const isEditable = editor.isEditable;
  const LONG_PRESS_DELETE_MS = 700;
  const currentCode = String(node.attrs.code ?? '').trim() || DEFAULT_MERMAID_CODE;
  const theme = useLiveTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [draftCode, setDraftCode] = useState(currentCode);
  const [previewSvg, setPreviewSvg] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [draftSvg, setDraftSvg] = useState('');
  const [draftError, setDraftError] = useState('');

  const canSave = useMemo(() => {
    return draftCode.trim().length > 0 && !draftError;
  }, [draftCode, draftError]);

  useEffect(() => {
    setDraftCode(currentCode);
  }, [currentCode]);

  useEffect(() => {
    let cancelled = false;

    void renderMermaidToSvg(currentCode, theme).then(({ svg, error }) => {
      if (cancelled) {
        return;
      }

      setPreviewSvg(svg);
      setPreviewError(error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentCode, theme]);

  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    let cancelled = false;

    void renderMermaidToSvg(draftCode, theme).then(({ svg, error }) => {
      if (cancelled) {
        return;
      }

      setDraftSvg(svg);
      setDraftError(error);
    });

    return () => {
      cancelled = true;
    };
  }, [draftCode, isEditorOpen, theme]);

  useEffect(() => {
    if (!showActions || isEditorOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setShowActions(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [showActions, isEditorOpen]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const editorModal = isEditorOpen && typeof document !== 'undefined'
    ? createPortal(
        <div className="mermaid-diagram-editor__backdrop" onMouseDown={() => setIsEditorOpen(false)}>
          <section
            className="mermaid-diagram-editor"
            role="dialog"
            aria-modal="true"
            aria-label="Редактор Mermaid-диаграммы"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="mermaid-diagram-editor__header">
              <h3>Редактирование диаграммы</h3>
              <button
                type="button"
                className="mermaid-diagram-editor__close"
                onClick={() => setIsEditorOpen(false)}
              >
                Закрыть
              </button>
            </header>

            <div className="mermaid-diagram-editor__presets">
              {MERMAID_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="mermaid-diagram-editor__preset"
                  onClick={() => setDraftCode(preset.code)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mermaid-diagram-editor__body">
              <div className="mermaid-diagram-editor__pane">
                <p className="mermaid-diagram-editor__label">Mermaid code</p>
                <textarea
                  className="mermaid-diagram-editor__textarea"
                  value={draftCode}
                  onChange={(event) => setDraftCode(event.target.value)}
                  spellCheck={false}
                />
                {draftError ? <p className="mermaid-diagram-node__error">{draftError}</p> : null}
              </div>

              <div className="mermaid-diagram-editor__pane">
                <p className="mermaid-diagram-editor__label">Live Preview</p>
                <div className="mermaid-diagram-editor__preview">
                  {draftSvg ? <div dangerouslySetInnerHTML={{ __html: draftSvg }} /> : null}
                </div>
              </div>
            </div>

            <footer className="mermaid-diagram-editor__footer">
              <button
                type="button"
                className="mermaid-diagram-editor__action mermaid-diagram-editor__action--secondary"
                onClick={() => {
                  setDraftCode(currentCode);
                  setIsEditorOpen(false);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="mermaid-diagram-editor__action mermaid-diagram-editor__action--primary"
                disabled={!canSave}
                onClick={() => {
                  updateAttributes({
                    code: draftCode.trim() || DEFAULT_MERMAID_CODE,
                  });
                  setIsEditorOpen(false);
                }}
              >
                Сохранить
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )
    : null;

  return (
    <NodeViewWrapper
      className={[
        'mermaid-diagram-node',
        selected ? 'mermaid-diagram-node--selected' : '',
      ].filter(Boolean).join(' ')}
      data-type="mermaid-diagram"
      ref={containerRef}
      onClick={() => setShowActions(true)}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isEditable || event.button !== 0 || longPressTimerRef.current !== null) {
          return;
        }

        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;

          const shouldDelete = window.confirm('Удалить эту диаграмму?');
          if (shouldDelete) {
            deleteNode();
          }
        }, LONG_PRESS_DELETE_MS);
      }}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onDoubleClick={() => {
        if (!isEditable) {
          return;
        }

        clearLongPressTimer();
        setShowActions(true);
        setIsEditorOpen(true);
      }}
    >
      <div className="mermaid-diagram-node__header" contentEditable={false}>
        <span className="mermaid-diagram-node__title">Mermaid Diagram</span>
        {isEditable ? <span className="text-[11px] text-[#6e7582]">dblclick: edit, long press: delete</span> : null}
        {isEditable && showActions ? (
          <button
            type="button"
            className="mermaid-diagram-node__edit"
            onClick={() => setIsEditorOpen(true)}
          >
            Редактировать
          </button>
        ) : null}
      </div>

      <div className="mermaid-diagram-node__surface" contentEditable={false}>
        {previewSvg ? (
          <div className="mermaid-diagram-node__svg" dangerouslySetInnerHTML={{ __html: previewSvg }} />
        ) : null}

        {previewError ? <p className="mermaid-diagram-node__error">{previewError}</p> : null}
      </div>

      {editorModal}
    </NodeViewWrapper>
  );
}
