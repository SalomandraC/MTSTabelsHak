import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { DEFAULT_MERMAID_CODE } from './mermaid-presets';
import { MermaidDiagramNodeView } from '../ui/mermaid-diagram-node-view';

export type MermaidDiagramAttrs = {
  code: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaidDiagram: {
      insertMermaidDiagram: (attrs?: Partial<MermaidDiagramAttrs>) => ReturnType;
    };
  }
}

export const MermaidNode = Node.create({
  name: 'mermaidDiagram',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      code: {
        default: DEFAULT_MERMAID_CODE,
        parseHTML: (element) => element.getAttribute('data-code') ?? DEFAULT_MERMAID_CODE,
        renderHTML: (attributes) => ({
          'data-code': String(attributes.code ?? DEFAULT_MERMAID_CODE),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-diagram"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid-diagram' })];
  },

  addCommands() {
    return {
      insertMermaidDiagram:
        (attrs = {}) =>
        ({ state, commands }) => {
          const { from } = state.selection;
          const code = String(attrs.code ?? DEFAULT_MERMAID_CODE);

          return commands.insertContentAt(from, {
            type: this.name,
            attrs: {
              code,
            },
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidDiagramNodeView as never);
  },
});
