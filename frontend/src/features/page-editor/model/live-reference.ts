import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { LiveReferenceChip } from '../ui/live-reference-chip';

export type LiveReferenceAttrs = {
  datasheetId: string;
  recordId: string;
  fieldId: string;
  label?: string;
  value?: string;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  updatedAt?: string;
  lastChangedAt?: number;
};

export type LiveReferenceSelection = {
  datasheetId: string;
  recordId: string;
  fieldId: string;
  label: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    liveReference: {
      insertLiveReference: (attrs: LiveReferenceSelection) => ReturnType;
    };
  }
}

export const LiveReference = Node.create({
  name: 'liveReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      datasheetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-datasheet-id'),
        renderHTML: (attributes) => ({ 'data-datasheet-id': attributes.datasheetId }),
      },
      recordId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-record-id'),
        renderHTML: (attributes) => ({ 'data-record-id': attributes.recordId }),
      },
      fieldId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-field-id'),
        renderHTML: (attributes) => ({ 'data-field-id': attributes.fieldId }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? '',
        renderHTML: (attributes) => ({ 'data-label': attributes.label ?? '' }),
      },
      value: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-value') ?? '',
        renderHTML: (attributes) => ({ 'data-value': attributes.value ?? '' }),
      },
      status: {
        default: 'idle',
        parseHTML: (element) => element.getAttribute('data-status') ?? 'idle',
        renderHTML: (attributes) => ({ 'data-status': attributes.status ?? 'idle' }),
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
    return [{ tag: 'span[data-type="live-reference"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const label = String(node.attrs.label ?? `${node.attrs.recordId ?? 'record'} / ${node.attrs.fieldId ?? 'field'}`);
    const value = String(node.attrs.value ?? '');
    const displayValue = value.trim() ? value : '...';

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'live-reference',
        class: 'live-reference-chip',
        title: `${label}: ${displayValue}`,
      }),
      `${label}: ${displayValue}`,
    ];
  },

  addCommands() {
    return {
      insertLiveReference:
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

  addNodeView() {
    return ReactNodeViewRenderer(LiveReferenceChip);
  },
});
