import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { LiveChartNodeView } from '../ui/live-chart-node-view';
import type { LiveChartAttrs } from './live-chart-types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    liveChart: {
      insertLiveChart: (attrs: LiveChartAttrs) => ReturnType;
    };
  }
}

export const LiveChart = Node.create({
  name: 'liveChart',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      chartType: { default: 'bar' },
      datasheetId: { default: '' },
      xAxisFieldId: { default: '' },
      yAxisFieldIds: {
        default: [],
        parseHTML: (element) => {
          try {
            const raw = element.getAttribute('data-y-axis-field-ids');
            if (!raw) {
              return [];
            }

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          'data-y-axis-field-ids': JSON.stringify(attributes.yAxisFieldIds ?? []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="live-chart"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'live-chart',
      }),
    ];
  },

  addCommands() {
    return {
      insertLiveChart:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'rootblock',
            content: [
              {
                type: this.name,
                attrs: {
                  chartType: attrs.chartType,
                  datasheetId: attrs.datasheetId,
                  xAxisFieldId: attrs.xAxisFieldId,
                  yAxisFieldIds: attrs.yAxisFieldIds,
                },
              },
            ],
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(LiveChartNodeView, {
      stopEvent: ({ event }) => {
        if (!(event.target instanceof HTMLElement)) {
          return false;
        }

        return Boolean(event.target.closest('[data-mws-stop-event="true"], button, input, select, textarea, label'));
      },
    });
  },
});
