import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

import { CanvasBlockComponent } from '../ui/canvas-block-component';

type CanvasLine = {
  id: string;
  color: string;
  size: number;
  path: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    canvasBlock: {
      insertCanvasBlock: () => ReturnType;
    };
  }
}

export const CanvasBlock = Node.create({
  name: 'canvasBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      lines: {
        default: [],
        parseHTML: (element) => {
          try {
            const data = element.getAttribute('data-lines');
            return data ? JSON.parse(data) : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          'data-lines': JSON.stringify(attributes.lines || []),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="canvasBlock"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'canvasBlock' }),
    ];
  },

  addCommands() {
    return {
      insertCanvasBlock:
        () =>
        ({ state, commands }) => {
          const { from } = state.selection;

          return commands.insertContentAt(from, {
            type: this.name,
            attrs: {
              lines: [],
            },
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CanvasBlockComponent as never);
  },
});
