import { describe, expect, it } from 'vitest';

import { parseMarkdownReportWithLiveReferences } from './live-reference-parser';

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
});
