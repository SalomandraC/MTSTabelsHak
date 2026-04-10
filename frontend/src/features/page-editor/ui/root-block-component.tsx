import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

export function RootBlockComponent({ selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className="group relative mb-1 w-full flow-root" data-type="rootblock">
      <div
        className={[
          'absolute -left-9 top-1 inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md',
          'bg-[#eef1f7] text-[#2b3240] transition-opacity hover:bg-[#dde3ef]',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        ].join(' ')}
        contentEditable={false}
        draggable="true"
        aria-label="Перетащить блок"
        title="Перетащить блок"
        data-drag-handle
      >
        ⋮⋮
      </div>
      <NodeViewContent className="min-h-[1rem] p-0" />
    </NodeViewWrapper>
  );
}
