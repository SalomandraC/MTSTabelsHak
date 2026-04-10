import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

export function RootBlockComponent({ node, getPos, editor }: NodeViewProps) {
  const createNewBlock = () => {
    if (typeof getPos !== 'function') {
      return;
    }

    const currentPos = getPos();
    if (typeof currentPos !== 'number') {
      return;
    }

    const insertPos = currentPos + node.nodeSize;

    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, {
        type: 'rootblock',
        content: [{ type: 'paragraph' }],
      })
      .setTextSelection(insertPos + 2)
      .run();
  };

  return (
    <NodeViewWrapper className="group relative mb-2 w-full" data-type="rootblock">
      <div className="absolute -left-11 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={createNewBlock}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#eef1f7] text-[#2b3240] hover:bg-[#dde3ef]"
          aria-label="Добавить блок"
          title="Добавить блок"
        >
          +
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md bg-[#eef1f7] text-[#2b3240] hover:bg-[#dde3ef]"
          aria-label="Перетащить блок"
          title="Перетащить блок"
          data-drag-handle
        >
          ⋮⋮
        </button>
      </div>
      <NodeViewContent className="min-h-[40px] rounded-lg border border-editor-border-subtle bg-white px-3 py-2" />
    </NodeViewWrapper>
  );
}
