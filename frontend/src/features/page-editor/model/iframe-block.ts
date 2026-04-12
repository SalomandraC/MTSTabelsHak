import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { IframeBlockComponent } from '../ui/iframe-block-component';

export interface IframeOptions {
  allowFullscreen: boolean;
  HTMLAttributes: {
    [key: string]: string;
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iframeBlock: {
      setIframe: (options: { src: string }) => ReturnType;
    };
  }
}

export const IframeBlock = Node.create<IframeOptions>({
  name: 'iframeBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  defining: true,

  addOptions() {
    return {
      allowFullscreen: true,
      HTMLAttributes: {
        class: 'iframe-block-node',
      },
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => {
          const iframe = element.querySelector('iframe');
          return iframe?.getAttribute('src') ?? element.getAttribute('data-src') ?? null;
        },
        renderHTML: (attributes) => ({
          'data-src': attributes.src,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="iframeBlock"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'iframeBlock' }),
      ['iframe', { src: HTMLAttributes.src, frameborder: 0, allowfullscreen: this.options.allowFullscreen }],
    ];
  },

  addCommands() {
    return {
      setIframe:
        (options: { src: string }) =>
        ({ state, commands }) => {
          const { from, to } = state.selection;

          return commands.insertContentAt(from, {
            type: this.name,
            attrs: {
              src: options.src,
            },
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(IframeBlockComponent as never);
  },
});
