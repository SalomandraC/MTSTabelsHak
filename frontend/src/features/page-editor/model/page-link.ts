import { Node, mergeAttributes } from '@tiptap/core';

export type PageLinkAttrs = {
  pageId: string;
  title: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      insertPageLink: (attrs: PageLinkAttrs) => ReturnType;
    };
  }
}

export const PageLink = Node.create({
  name: 'pageLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-page-id'),
        renderHTML: (attributes) => ({ 'data-page-id': attributes.pageId }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? element.textContent ?? '',
        renderHTML: (attributes) => ({ 'data-title': attributes.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="page-link"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page-link',
        class: 'page-link-chip',
      }),
      `@${node.attrs.title || 'Страница'}`,
    ];
  },

  addCommands() {
    return {
      insertPageLink:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: this.name,
              attrs,
            },
            {
              type: 'text',
              text: ' ',
            },
          ]);
        },
    };
  },
});
