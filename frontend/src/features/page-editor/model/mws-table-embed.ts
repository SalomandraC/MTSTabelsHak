import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { MwsTableEmbedComponent } from '../ui/mws-table-embed-component';

export type MwsTableEmbedAttrs = {
  blockId: string;
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  viewId?: string | null;
  displayMode?: string;
  selectedFieldIds?: string[];
  filterByFormula?: string | null;
  pageSize?: number;
  allowInlineEdit?: boolean;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mwsTableEmbed: {
      insertMwsTableEmbed: (attrs: MwsTableEmbedAttrs) => ReturnType;
    };
  }
}

export const MwsTableEmbed = Node.create({
  name: 'mwsTableEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      spaceId: { default: null },
      nodeId: { default: null },
      datasheetId: { default: null },
      viewId: { default: null },
      displayMode: { default: 'table' },
      selectedFieldIds: { default: [] },
      filterByFormula: { default: null },
      pageSize: { default: 10 },
      allowInlineEdit: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mws-table-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'mws-table-embed',
      }),
    ];
  },

  addCommands() {
    return {
      insertMwsTableEmbed:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              displayMode: 'table',
              pageSize: 10,
              allowInlineEdit: false,
              ...attrs,
            },
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MwsTableEmbedComponent);
  },
});
