import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { MwsTableEmbedComponent } from '../ui/mws-table-embed-component';
import { createWikiTableEmbed, type WikiTableEmbedAttrs } from './wiki-table-embed';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mwsTableEmbed: {
      insertMwsTableEmbed: (attrs: WikiTableEmbedAttrs) => ReturnType;
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
      title: { default: null },
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
          return commands.insertContent(createWikiTableEmbed(attrs).toNode());
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MwsTableEmbedComponent, {
      stopEvent: ({ event }) => {
        if (!(event.target instanceof HTMLElement)) {
          return false;
        }

        const interactiveSelector = [
          'button',
          'input',
          'select',
          'textarea',
          'label',
          'a',
          '[data-testid="mws_canvas_grid"]',
          '[data-mws-stop-event="true"]',
        ].join(', ');

        return Boolean(event.target.closest(interactiveSelector));
      },
    });
  },
});
