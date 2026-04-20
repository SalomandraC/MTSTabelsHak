import type { Editor, JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { parseMarkdownReportWithLiveReferences, parseMarkdownWithLiveReferences } from './live-reference-parser';

describe('parseMarkdownReportWithLiveReferences', () => {
  it('parses markdown tables into native table nodes', () => {
    const blocks = parseMarkdownReportWithLiveReferences(
      [
        '## Общая информация',
        '',
        '| Параметр | Значение |',
        '|---|---|',
        '| ID таблицы | dstf2fJvxaGwEoKbMU |',
        '| Количество записей | 3 |',
      ].join('\n'),
      {},
    );

    expect(blocks[0]?.type).toBe('heading');
    expect(blocks[1]?.type).toBe('table');
    expect(blocks[1]?.content).toHaveLength(3);
    expect(blocks[1]?.content?.[0]?.type).toBe('tableRow');
    expect(blocks[1]?.content?.[0]?.content?.[0]?.type).toBe('tableHeader');
    expect(blocks[1]?.content?.[1]?.content?.[0]?.type).toBe('tableCell');
    expect(blocks[1]?.content?.[1]?.content?.[0]?.content?.[0]?.type).toBe('paragraph');
  });

  it('drops empty text nodes from the report content tree', () => {
    const blocks = parseMarkdownReportWithLiveReferences(
      [
        '## Отчет',
        '',
        'Текст первой строки.',
        '',
        '',
        'Текст второй строки.',
      ].join('\n'),
      {},
    );

    expect(blocks[0]?.type).toBe('heading');
    expect(blocks.some((block) => block.type === 'paragraph')).toBe(true);
    expect(JSON.stringify(blocks)).not.toContain('"text":""');
  });

  it('preserves markdown structure while expanding live references and formulas', () => {
    const documentTree: JSONContent[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Итоги' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Жирный ',
            marks: [{ type: 'bold' }],
          },
          {
            type: 'text',
            text: '[Ref:sheet-1:row-7:amount] + [Formula: ([Ref:sheet-1:row-7:amount] * 2)]',
          },
        ],
      },
    ];

    const editor = {
      storage: {
        markdown: {
          parse: () => ({
            type: 'doc',
            content: documentTree,
          }),
        },
      },
    } as unknown as Editor;

    const blocks = parseMarkdownWithLiveReferences(editor, '## ignored', { spaceId: 'space-1' });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Итоги' }],
    });
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Жирный ',
          marks: [{ type: 'bold' }],
        },
        {
          type: 'liveReference',
          attrs: {
            spaceId: 'space-1',
            datasheetId: 'sheet-1',
            recordId: 'row-7',
            fieldId: 'amount',
            label: 'row-7 / amount',
          },
        },
        { type: 'text', text: ' + ' },
        {
          type: 'liveFormula',
          attrs: {
            spaceId: 'space-1',
            expression: '([Ref:sheet-1:row-7:amount] * 2)',
          },
        },
      ],
    });
  });

  it('parses bold markdown in plain report paragraphs', () => {
    const blocks = parseMarkdownReportWithLiveReferences('Обычный **жирный** текст', {});

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Обычный ' },
        { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' текст' },
      ],
    });
    expect(JSON.stringify(blocks)).not.toContain('**');
  });
});
