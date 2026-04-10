import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

export function CodeBlockComponent({ node: { attrs } }: NodeViewProps) {
  const language = attrs.language || 'auto';

  return (
    <NodeViewWrapper className="group relative my-5 max-w-full overflow-hidden rounded-xl border border-editor-border-subtle bg-[#1b2438]">
      <div
        className="absolute top-3 right-3 select-none rounded-md bg-[#2d3a56] px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-[#a4b1cd] uppercase opacity-0 transition-opacity group-hover:opacity-100"
        contentEditable={false}
      >
        {language}
      </div>
      <pre className="m-0 overflow-x-auto p-4 pt-10 font-mono text-[0.85rem] leading-relaxed text-[#f5f9ff]">
        <NodeViewContent as="div" className={`language-${language}`} />
      </pre>
    </NodeViewWrapper>
  );
}
