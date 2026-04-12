import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useCallback, useRef } from 'react';

export function IframeBlockComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const src = (node.attrs.src as string | null) ?? '';

  const handleSrcChange = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const newSrc = input.value.trim();
    if (!newSrc) return;

    // Normalize URL
    const normalizedUrl = newSrc.startsWith('http') ? newSrc : `https://${newSrc}`;
    updateAttributes({ src: normalizedUrl });
  }, [updateAttributes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSrcChange();
    }
  }, [handleSrcChange]);

  return (
    <NodeViewWrapper className="iframe-block-node" data-type="iframeBlock">
      <div
        className={[
          'mb-2 rounded-lg border-2 border-editor-border-control bg-white shadow-sm transition-colors',
          selected ? 'border-red-400 shadow-md' : 'border-gray-200',
        ].join(' ')}
      >
        <div
          className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"
          contentEditable={false}
          onPointerDown={e => e.stopPropagation()}
        >
          <span className="text-xs font-medium text-gray-600">URL:</span>
          <input
            ref={inputRef}
            type="text"
            defaultValue={src}
            placeholder="Вставьте URL (например, YouTube embed)"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs font-mono"
            onBlur={handleSrcChange}
            onKeyDown={handleKeyDown}
          />
        </div>

        {src ? (
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={src}
              frameBorder="0"
              allowFullScreen
              className="absolute left-0 top-0 h-full w-full"
              title="Embedded content"
            />
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center bg-gray-100 text-sm text-gray-400">
            Вставьте URL для отображения содержимого
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
