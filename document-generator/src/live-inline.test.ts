import test from 'node:test';
import assert from 'node:assert/strict';

import { createInlineNodeResolver } from './live-inline.js';

test('live inline resolver fetches live reference values and evaluates live formulas', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);

    if (url.includes('/records/rec-1/fields/amount')) {
      return {
        ok: true,
        json: async () => ({ cell: { displayValue: '120' } }),
      } as Response;
    }

    if (url.includes('/records/rec-1/fields/tax')) {
      return {
        ok: true,
        json: async () => ({ cell: { displayValue: '30' } }),
      } as Response;
    }

    return {
      ok: false,
      json: async () => ({ error: 'not found' }),
    } as Response;
  }) as typeof fetch;

  try {
    const resolver = createInlineNodeResolver({ accessToken: 'token-1' });
    const resolved = await resolver.resolveInlineNodes([
      {
        type: 'live_reference',
        datasheetId: 'ds-1',
        recordId: 'rec-1',
        fieldId: 'amount',
        label: 'Сумма',
      },
      {
        type: 'text',
        text: ' / ',
      },
      {
        type: 'live_formula',
        expression: '[Ref:ds-1:rec-1:amount] + [Ref:ds-1:rec-1:tax]',
      },
      {
        type: 'template_variable',
        label: 'Менеджер',
      },
    ]);

    assert.deepEqual(
      resolved.map((node) => node.text),
      ['120', ' / ', '150', '{{Менеджер}}'],
    );

    assert.equal(
      calls.filter((url) => url.includes('/records/rec-1/fields/amount')).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
