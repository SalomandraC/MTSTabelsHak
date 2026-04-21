import type { BlockNode } from './types.js';
import type { ExportAuthContext } from './live-inline.js';

const API_BASE = process.env.API_BASE_URL ?? 'http://api:8080';
const SERIES_COLORS = ['#d70032', '#ff5c7a', '#ff9a3c', '#5f8dff', '#38b6a3', '#9867ff'];

type MwsField = { id: string; name: string; type?: string };
type MwsRecord = { recordId: string; fields: Record<string, unknown> };

export type LiveChartExportData = {
  chartType: 'bar' | 'line' | 'pie';
  datasheetId: string;
  xAxisFieldId: string;
  xFieldName: string;
  ySeries: Array<{ fieldId: string; fieldName: string }>;
  points: Array<{
    xLabel: string;
    values: Record<string, number>;
  }>;
};

function buildAuthHeaders(auth?: ExportAuthContext): Record<string, string> {
  if (auth?.accessToken) {
    return { Authorization: `Bearer ${auth.accessToken}` };
  }

  if (auth?.userId) {
    return {
      'x-user-id': auth.userId,
      'x-user-name': auth.displayName ?? auth.userId,
    };
  }

  return { 'x-user-id': 'docgen', 'x-user-name': 'Document Generator' };
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizeDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim() || '-';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDisplayValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    for (const key of ['text', 'title', 'name', 'value', 'label']) {
      const candidate = objectValue[key];
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return String(candidate);
      }
    }
  }

  return String(value);
}

function parseChartNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    for (const key of ['value', 'amount', 'displayValue']) {
      const candidate = objectValue[key];
      const parsed = parseChartNumber(candidate);
      if (parsed !== 0) {
        return parsed;
      }
    }
  }

  const text = normalizeDisplayValue(value).replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeChartType(value: unknown): 'bar' | 'line' | 'pie' {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'line' || normalized === 'pie') {
    return normalized;
  }
  return 'bar';
}

async function fetchTableData(datasheetId: string, auth?: ExportAuthContext): Promise<{ fields: MwsField[]; records: MwsRecord[] } | null> {
  const headers = buildAuthHeaders(auth);

  try {
    const fieldsRes = await fetch(`${API_BASE}/api/v1/mws/datasheets/${encodeURIComponent(datasheetId)}/fields`, { headers });
    if (!fieldsRes.ok) {
      return null;
    }
    const { items: fields } = await fieldsRes.json() as { items: MwsField[] };

    const recordsRes = await fetch(
      `${API_BASE}/api/v1/mws/datasheets/${encodeURIComponent(datasheetId)}/records?pageSize=100&fieldKey=id&cellFormat=json`,
      { headers },
    );
    if (!recordsRes.ok) {
      return null;
    }
    const { items: records } = await recordsRes.json() as { items: MwsRecord[] };

    return { fields, records };
  } catch {
    return null;
  }
}

export async function buildLiveChartExportData(block: BlockNode, auth?: ExportAuthContext): Promise<LiveChartExportData | null> {
  const datasheetId = block.datasheetId ?? '';
  const xAxisFieldId = block.xAxisFieldId ?? '';
  const yAxisFieldIds = block.yAxisFieldIds ?? [];

  if (!datasheetId || !xAxisFieldId || yAxisFieldIds.length === 0) {
    return null;
  }

  const data = await fetchTableData(datasheetId, auth);
  if (!data) {
    return null;
  }

  const fieldById = new Map(data.fields.map((field) => [field.id, field]));
  const ySeries = yAxisFieldIds
    .map((fieldId) => ({
      fieldId,
      fieldName: fieldById.get(fieldId)?.name ?? fieldId,
    }))
    .filter((series) => series.fieldId);

  return {
    chartType: normalizeChartType(block.chartType),
    datasheetId,
    xAxisFieldId,
    xFieldName: fieldById.get(xAxisFieldId)?.name ?? xAxisFieldId,
    ySeries,
    points: data.records.map((record) => ({
      xLabel: normalizeDisplayValue(record.fields?.[xAxisFieldId]) || record.recordId,
      values: Object.fromEntries(ySeries.map((series) => [series.fieldId, parseChartNumber(record.fields?.[series.fieldId])])),
    })),
  };
}

function scalePoints(values: number[], chartHeight: number): { min: number; max: number; scale: (value: number) => number } {
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const range = maxValue - minValue || 1;

  return {
    min: minValue,
    max: maxValue,
    scale: (value: number) => chartHeight - ((value - minValue) / range) * chartHeight,
  };
}

function renderBarChart(data: LiveChartExportData, width: number, height: number, left: number, top: number, chartWidth: number, chartHeight: number) {
  const values = data.points.flatMap((point) => data.ySeries.map((series) => point.values[series.fieldId] ?? 0));
  const scaler = scalePoints(values, chartHeight);
  const groupWidth = chartWidth / Math.max(1, data.points.length);
  const barWidth = Math.max(6, Math.min(28, (groupWidth - 12) / Math.max(1, data.ySeries.length)));
  const zeroY = top + scaler.scale(0);

  const bars = data.points.flatMap((point, pointIndex) => data.ySeries.map((series, seriesIndex) => {
    const value = point.values[series.fieldId] ?? 0;
    const y = top + scaler.scale(Math.max(0, value));
    const h = Math.abs(zeroY - (top + scaler.scale(value)));
    const x = left + pointIndex * groupWidth + 6 + seriesIndex * barWidth;
    return `<rect x="${x.toFixed(1)}" y="${Math.min(y, zeroY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3" fill="${SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}"/>`;
  })).join('');

  return `<line x1="${left}" y1="${zeroY.toFixed(1)}" x2="${left + chartWidth}" y2="${zeroY.toFixed(1)}" stroke="#cfd6e1"/>${bars}${renderXAxisLabels(data, left, top, chartWidth, chartHeight, groupWidth)}`;
}

function renderLineChart(data: LiveChartExportData, width: number, height: number, left: number, top: number, chartWidth: number, chartHeight: number) {
  const values = data.points.flatMap((point) => data.ySeries.map((series) => point.values[series.fieldId] ?? 0));
  const scaler = scalePoints(values, chartHeight);
  const step = data.points.length > 1 ? chartWidth / (data.points.length - 1) : chartWidth;

  const lines = data.ySeries.map((series, seriesIndex) => {
    const points = data.points.map((point, pointIndex) => {
      const x = left + pointIndex * step;
      const y = top + scaler.scale(point.values[series.fieldId] ?? 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const dots = points.map((point) => {
      const [x, y] = point.split(',');
      return `<circle cx="${x}" cy="${y}" r="3" fill="${SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}"/>`;
    }).join('');
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}" stroke-width="2.5"/>${dots}`;
  }).join('');

  return `${lines}${renderXAxisLabels(data, left, top, chartWidth, chartHeight, step)}`;
}

function renderPieChart(data: LiveChartExportData, width: number, height: number, left: number, top: number, chartWidth: number, chartHeight: number) {
  const values = data.ySeries.length <= 1
    ? data.points.map((point) => ({ label: point.xLabel, value: point.values[data.ySeries[0]?.fieldId ?? ''] ?? 0 }))
    : data.ySeries.map((series) => ({
        label: series.fieldName,
        value: data.points.reduce((sum, point) => sum + (point.values[series.fieldId] ?? 0), 0),
      }));
  const total = values.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
  const cx = left + chartWidth / 2;
  const cy = top + chartHeight / 2;
  const radius = Math.min(chartWidth, chartHeight) / 2 - 12;
  let cursor = -Math.PI / 2;

  return values.map((item, index) => {
    const angle = (Math.max(0, item.value) / total) * Math.PI * 2;
    const end = cursor + angle;
    const x1 = cx + Math.cos(cursor) * radius;
    const y1 = cy + Math.sin(cursor) * radius;
    const x2 = cx + Math.cos(end) * radius;
    const y2 = cy + Math.sin(end) * radius;
    const largeArc = angle > Math.PI ? 1 : 0;
    cursor = end;
    return `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${SERIES_COLORS[index % SERIES_COLORS.length]}"/>`;
  }).join('');
}

function renderXAxisLabels(data: LiveChartExportData, left: number, top: number, chartWidth: number, chartHeight: number, step: number) {
  return data.points.slice(0, 8).map((point, index) => {
    const x = left + index * step + (data.chartType === 'bar' ? step / 2 : 0);
    return `<text x="${x.toFixed(1)}" y="${top + chartHeight + 22}" text-anchor="middle" font-size="10" fill="#596579">${esc(point.xLabel.slice(0, 14))}</text>`;
  }).join('');
}

function renderLegend(data: LiveChartExportData, width: number) {
  return data.ySeries.map((series, index) => {
    const x = 28 + index * 150;
    return `<rect x="${x}" y="326" width="10" height="10" rx="2" fill="${SERIES_COLORS[index % SERIES_COLORS.length]}"/><text x="${x + 16}" y="335" font-size="11" fill="#374151">${esc(series.fieldName.slice(0, 18))}</text>`;
  }).join('');
}

export function renderLiveChartSvg(data: LiveChartExportData): string {
  const width = 720;
  const height = 360;
  const left = 56;
  const top = 62;
  const chartWidth = 620;
  const chartHeight = 230;
  const chart = data.chartType === 'line'
    ? renderLineChart(data, width, height, left, top, chartWidth, chartHeight)
    : data.chartType === 'pie'
      ? renderPieChart(data, width, height, left, top, chartWidth, chartHeight)
      : renderBarChart(data, width, height, left, top, chartWidth, chartHeight);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="18" fill="#fff7f8"/>
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="14" fill="#ffffff" stroke="#ffd4da"/>
  <text x="28" y="42" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#d70032">Live chart: ${esc(data.chartType.toUpperCase())}</text>
  <text x="28" y="60" font-family="Arial, sans-serif" font-size="11" fill="#667085">X: ${esc(data.xFieldName)} · table: ${esc(data.datasheetId)}</text>
  <line x1="${left}" y1="${top}" x2="${left}" y2="${top + chartHeight}" stroke="#cfd6e1"/>
  <line x1="${left}" y1="${top + chartHeight}" x2="${left + chartWidth}" y2="${top + chartHeight}" stroke="#cfd6e1"/>
  ${chart}
  ${renderLegend(data, width)}
</svg>`;
}

export function renderMermaidCodeSvg(code: string): string {
  const flowchartSvg = renderMermaidFlowchartSvg(code);
  if (flowchartSvg) {
    return flowchartSvg;
  }

  const lines = code.split(/\r?\n/).slice(0, 14);
  const width = 720;
  const height = Math.max(180, 90 + lines.length * 18);
  const body = lines.map((line, index) => `<text x="34" y="${84 + index * 18}" font-family="Courier New, monospace" font-size="13" fill="#1f2937">${esc(line)}</text>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="18" fill="#f6f7f9"/>
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="14" fill="#ffffff" stroke="#dfe5ee"/>
  <text x="28" y="44" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#d70032">Mermaid diagram</text>
  <text x="28" y="62" font-family="Arial, sans-serif" font-size="11" fill="#667085">Source snapshot</text>
  ${body}
</svg>`;
}

type MermaidFlowEdge = {
  from: string;
  to: string;
};

function stripMermaidNode(raw: string): { id: string; label: string } {
  const value = raw.trim().replace(/;$/, '');
  const bracketMatch = /^([A-Za-z0-9_-]+)\s*(?:\["([^"]+)"\]|\['([^']+)'\]|\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?$/.exec(value);

  if (!bracketMatch) {
    return {
      id: value,
      label: value,
    };
  }

  const id = bracketMatch[1]!;
  const label = bracketMatch[2] ?? bracketMatch[3] ?? bracketMatch[4] ?? bracketMatch[5] ?? bracketMatch[6] ?? id;

  return { id, label };
}

function parseMermaidFlowchart(code: string): { direction: 'TD' | 'LR'; nodes: Map<string, string>; edges: MermaidFlowEdge[] } | null {
  const lines = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));
  const header = lines[0] ?? '';
  const headerMatch = /^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)$/i.exec(header);

  if (!headerMatch) {
    return null;
  }

  const direction = headerMatch[1]?.toUpperCase() === 'LR' || headerMatch[1]?.toUpperCase() === 'RL' ? 'LR' : 'TD';
  const nodes = new Map<string, string>();
  const edges: MermaidFlowEdge[] = [];
  const upsertNode = (node: { id: string; label: string }) => {
    const current = nodes.get(node.id);
    if (!current || current === node.id || node.label !== node.id) {
      nodes.set(node.id, node.label);
    }
  };

  for (const line of lines.slice(1)) {
    const edgeMatch = /^(.+?)\s*(?:-->|---|-.->|==>)\s*(.+)$/.exec(line);
    if (!edgeMatch) {
      const node = stripMermaidNode(line);
      if (node.id) {
        upsertNode(node);
      }
      continue;
    }

    const from = stripMermaidNode(edgeMatch[1]!);
    const to = stripMermaidNode(edgeMatch[2]!);
    upsertNode(from);
    upsertNode(to);
    edges.push({ from: from.id, to: to.id });
  }

  return nodes.size > 0 ? { direction, nodes, edges } : null;
}

function renderMermaidFlowchartSvg(code: string): string | null {
  const parsed = parseMermaidFlowchart(code);
  if (!parsed) {
    return null;
  }

  const nodeEntries = Array.from(parsed.nodes.entries());
  const nodeWidth = 168;
  const nodeHeight = 54;
  const gapX = 72;
  const gapY = 52;
  const marginX = 42;
  const marginY = 76;
  const positions = new Map<string, { x: number; y: number }>();

  nodeEntries.forEach(([id], index) => {
    if (parsed.direction === 'LR') {
      positions.set(id, {
        x: marginX + index * (nodeWidth + gapX),
        y: marginY,
      });
      return;
    }

    positions.set(id, {
      x: marginX,
      y: marginY + index * (nodeHeight + gapY),
    });
  });

  const width = parsed.direction === 'LR'
    ? Math.max(360, marginX * 2 + nodeEntries.length * nodeWidth + Math.max(0, nodeEntries.length - 1) * gapX)
    : 720;
  const height = parsed.direction === 'LR'
    ? 220
    : Math.max(220, marginY * 2 + nodeEntries.length * nodeHeight + Math.max(0, nodeEntries.length - 1) * gapY);

  const edges = parsed.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) {
      return '';
    }

    const x1 = parsed.direction === 'LR' ? from.x + nodeWidth : from.x + nodeWidth / 2;
    const y1 = parsed.direction === 'LR' ? from.y + nodeHeight / 2 : from.y + nodeHeight;
    const x2 = parsed.direction === 'LR' ? to.x : to.x + nodeWidth / 2;
    const y2 = parsed.direction === 'LR' ? to.y + nodeHeight / 2 : to.y;
    const mid = parsed.direction === 'LR' ? (x1 + x2) / 2 : (y1 + y2) / 2;
    const path = parsed.direction === 'LR'
      ? `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 10} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2 - 10}`;

    return `<path d="${path}" fill="none" stroke="#d70032" stroke-width="2.2" marker-end="url(#arrow)"/>`;
  }).join('');

  const nodes = nodeEntries.map(([id, label], index) => {
    const pos = positions.get(id)!;
    const fill = index === 0 ? '#fff1f4' : index === nodeEntries.length - 1 ? '#f0fff9' : '#ffffff';
    const stroke = index === 0 ? '#d70032' : '#dfe5ee';
    const textLines = splitSvgText(label, 18);
    const text = textLines.map((line, lineIndex) => (
      `<text x="${pos.x + nodeWidth / 2}" y="${pos.y + 26 + lineIndex * 15 - (textLines.length - 1) * 7}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#252b36">${esc(line)}</text>`
    )).join('');

    return `<rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${text}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#d70032"/>
    </marker>
  </defs>
  <rect width="${width}" height="${height}" rx="18" fill="#f6f7f9"/>
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="14" fill="#ffffff" stroke="#dfe5ee"/>
  <text x="28" y="44" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#d70032">Mermaid diagram</text>
  ${edges}
  ${nodes}
</svg>`;
}

function splitSvgText(value: string, maxLength: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines.slice(0, 2) : [value.slice(0, maxLength)];
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

export function renderLiveChartMarkdown(data: LiveChartExportData): string {
  const header = ['X', ...data.ySeries.map((series) => series.fieldName)];
  const divider = ['---', ...data.ySeries.map(() => '---:')];
  const rows = data.points.map((point) => [
    point.xLabel,
    ...data.ySeries.map((series) => String(point.values[series.fieldId] ?? 0)),
  ]);

  return [
    `### Live chart: ${data.chartType}`,
    '',
    `Source table: ${data.datasheetId}`,
    `X axis: ${data.xFieldName}`,
    `Y series: ${data.ySeries.map((series) => series.fieldName).join(', ')}`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}
