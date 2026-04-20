import test from 'node:test';
import assert from 'node:assert/strict';

import { flattenDocument } from './document-parser.js';

test('flattenDocument preserves live export inline nodes', () => {
  const blocks = flattenDocument({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [
          { type: 'text', text: 'Отчёт за ' },
          {
            type: 'liveReference',
            attrs: {
              datasheetId: 'ds-1',
              recordId: 'rec-1',
              fieldId: 'amount',
              label: 'Сумма',
              value: '42',
            },
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Итог: ' },
          {
            type: 'liveFormula',
            attrs: {
              expression: '[Ref:ds-1:rec-1:amount] / 2',
              result: '21',
            },
          },
          { type: 'text', text: ' ' },
          {
            type: 'templateVariable',
            attrs: {
              key: 'manager_name',
              label: 'Менеджер',
            },
          },
        ],
      },
    ],
  });

  assert.equal(blocks.length, 2);

  const heading = blocks[0]!;
  assert.equal(heading.type, 'heading');
  assert.equal(heading.inlineNodes?.[1]?.type, 'live_reference');
  assert.equal(heading.inlineNodes?.[1]?.datasheetId, 'ds-1');

  const paragraph = blocks[1]!;
  assert.equal(paragraph.type, 'paragraph');
  assert.equal(paragraph.inlineNodes?.[1]?.type, 'live_formula');
  assert.equal(paragraph.inlineNodes?.[3]?.type, 'template_variable');
});

test('flattenDocument preserves hard breaks inside inline content', () => {
  const blocks = flattenDocument({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Первая строка' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Вторая строка' },
        ],
      },
    ],
  });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.inlineNodes?.[1]?.type, 'hard_break');
  assert.equal(blocks[0]?.content, 'Первая строка<br>Вторая строка');
});
