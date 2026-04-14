import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { LiveFormulaChip } from '../ui/live-formula-chip';

export type LiveFormulaAttrs = {
  spaceId?: string;
  expression: string;
  result?: string;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  updatedAt?: string | null;
  lastChangedAt?: number;
};

export type LiveFormulaInsert = {
  expression: string;
  spaceId?: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    liveFormula: {
      insertLiveFormula: (attrs: LiveFormulaInsert) => ReturnType;
    };
  }
}

export const LiveFormula = Node.create({
  name: 'liveFormula',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      spaceId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-space-id') ?? '',
        renderHTML: (attributes) => ({ 'data-space-id': attributes.spaceId ?? '' }),
      },
      expression: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-expression') ?? '',
        renderHTML: (attributes) => ({ 'data-expression': attributes.expression ?? '' }),
      },
      result: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-result') ?? '',
        renderHTML: (attributes) => ({ 'data-result': attributes.result ?? '' }),
      },
      status: {
        default: 'idle',
        parseHTML: (element) => element.getAttribute('data-status') ?? 'idle',
        renderHTML: (attributes) => ({ 'data-status': attributes.status ?? 'idle' }),
      },
      error: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-error') ?? '',
        renderHTML: (attributes) => ({ 'data-error': attributes.error ?? '' }),
      },
      updatedAt: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-updated-at'),
        renderHTML: (attributes) => ({ 'data-updated-at': attributes.updatedAt ?? null }),
      },
      lastChangedAt: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute('data-last-changed-at') ?? 0),
        renderHTML: (attributes) => ({ 'data-last-changed-at': String(attributes.lastChangedAt ?? 0) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="live-formula"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const expression = String(node.attrs.expression ?? '').trim();
    const result = String(node.attrs.result ?? '').trim();
    const status = String(node.attrs.status ?? 'idle');
    const display = result || (status === 'error' ? 'ошибка' : '...');

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'live-formula',
        class: 'live-formula-chip',
        title: `Живая формула: ${expression || 'пусто'}\nРезультат: ${display}`,
      }),
      display,
    ];
  },

  addCommands() {
    return {
      insertLiveFormula:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: this.name,
              attrs: {
                spaceId: attrs.spaceId ?? '',
                expression: attrs.expression,
              },
            },
            {
              type: 'text',
              text: ' ',
            },
          ]);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(LiveFormulaChip);
  },
});
