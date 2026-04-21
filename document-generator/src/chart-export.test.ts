import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLiveChartExportData, renderLiveChartMarkdown, renderLiveChartSvg, renderMermaidCodeSvg } from './chart-export.js';

test('buildLiveChartExportData builds chart points from MWS fields and records', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.endsWith('/fields')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            { id: 'name', name: 'Month' },
            { id: 'amount', name: 'Amount' },
          ],
        }),
      } as Response;
    }

    if (url.includes('/records?')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            { recordId: 'r1', fields: { name: 'Jan', amount: '10' } },
            { recordId: 'r2', fields: { name: 'Feb', amount: '15' } },
          ],
        }),
      } as Response;
    }

    return {
      ok: false,
      json: async () => ({ error: 'not found' }),
    } as Response;
  }) as typeof fetch;

  try {
    const data = await buildLiveChartExportData({
      type: 'live_chart',
      chartType: 'bar',
      datasheetId: 'ds-1',
      xAxisFieldId: 'name',
      yAxisFieldIds: ['amount'],
    }, { accessToken: 'token-1' });

    assert.ok(data);
    assert.equal(data.xFieldName, 'Month');
    assert.deepEqual(data.points.map((point) => point.xLabel), ['Jan', 'Feb']);
    assert.deepEqual(data.points.map((point) => point.values.amount), [10, 15]);
    assert.match(renderLiveChartMarkdown(data), /Source table: ds-1/);
    assert.match(renderLiveChartSvg(data), /<svg/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('renderMermaidCodeSvg renders flowchart nodes instead of source text snapshot', () => {
  const svg = renderMermaidCodeSvg('flowchart TD\nStart[Начало] --> Action[Действие]\nAction --> End[Результат]');

  assert.match(svg, /<path/);
  assert.match(svg, /Начало/);
  assert.match(svg, /Действие/);
  assert.doesNotMatch(svg, /Source snapshot/);
});
