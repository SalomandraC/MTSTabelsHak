import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { RootBlockComponent } from '../ui/root-block-component';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rootBlock: {
      insertRootBlock: () => ReturnType;
    };
  }
}

export const RootBlock = Node.create({
  name: 'rootblock',
  group: 'block',
  content: 'block+',
  draggable: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="rootblock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'rootblock' }), 0];
  },

  addCommands() {
    return {
      insertRootBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(RootBlockComponent);
  },
});
