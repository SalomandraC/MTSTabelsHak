import type { BlockInlineNode, BlockNode } from './types.js';

const API_BASE = process.env.API_BASE_URL ?? 'http://api:8080';
const LIVE_REF_TOKEN = /\[Ref:([^:\]\s]+):([^:\]\s]+):([^:\]\s]+)\]/g;

export type ExportAuthContext = {
  accessToken?: string;
  userId?: string;
  displayName?: string;
};

type InlineNode = BlockInlineNode;
type ResolvedInlineNode = BlockInlineNode;

type MwsCellValueResponse = {
  cell: {
    value?: unknown;
    displayValue?: unknown;
    updatedAt?: string | null;
  };
};

type FormulaRefToken = {
  raw: string;
  datasheetId: string;
  recordId: string;
  fieldId: string;
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

function normalizeDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDisplayValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    for (const key of ['value', 'displayValue', 'text', 'title', 'name', 'label']) {
      const candidate = objectValue[key];
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return String(candidate);
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = normalizeDisplayValue(value)
    .replace(/\s+/g, '')
    .replace(',', '.');

  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeEvaluateArithmetic(expression: string): number | null {
  const normalized = expression.replace(/,/g, '.').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    return null;
  }

  try {
    const evaluator = new Function(`return (${normalized});`);
    const result = evaluator();

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function collectFormulaRefTokens(expression: string): FormulaRefToken[] {
  const tokens: FormulaRefToken[] = [];
  LIVE_REF_TOKEN.lastIndex = 0;

  let match = LIVE_REF_TOKEN.exec(expression);
  while (match) {
    tokens.push({
      raw: match[0],
      datasheetId: match[1]!,
      recordId: match[2]!,
      fieldId: match[3]!,
    });
    match = LIVE_REF_TOKEN.exec(expression);
  }

  return tokens;
}

export function createInlineNodeResolver(auth?: ExportAuthContext) {
  const cellValueCache = new Map<string, Promise<unknown | null>>();

  async function fetchLiveReferenceValue(datasheetId: string, recordId: string, fieldId: string): Promise<unknown | null> {
    const cacheKey = `${datasheetId}:${recordId}:${fieldId}`;
    const cached = cellValueCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const requestPromise = (async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/v1/mws/datasheets/${encodeURIComponent(datasheetId)}/records/${encodeURIComponent(recordId)}/fields/${encodeURIComponent(fieldId)}`,
          { headers: buildAuthHeaders(auth) },
        );

        if (!response.ok) {
          return null;
        }

        const payload = await response.json() as MwsCellValueResponse;
        return payload.cell.displayValue ?? payload.cell.value ?? null;
      } catch {
        return null;
      }
    })();

    cellValueCache.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async function resolveLiveReferenceNode(node: InlineNode): Promise<ResolvedInlineNode> {
    const datasheetId = node.datasheetId ?? '';
    const recordId = node.recordId ?? '';
    const fieldId = node.fieldId ?? '';

    let text = '';

    if (datasheetId && recordId && fieldId) {
      const liveValue = await fetchLiveReferenceValue(datasheetId, recordId, fieldId);
      text = normalizeDisplayValue(liveValue);
    }

    if (!text) {
      text = node.value?.trim() || node.label?.trim() || `${recordId || 'record'} / ${fieldId || 'field'}`;
    }

    return {
      type: 'text',
      text,
    };
  }

  async function resolveLiveFormulaNode(node: InlineNode): Promise<ResolvedInlineNode> {
    const expression = String(node.expression ?? '').trim();
    if (!expression) {
      return {
        type: 'text',
        text: String(node.result ?? '').trim() || 'Формула',
      };
    }

    const refs = collectFormulaRefTokens(expression);
    if (refs.length === 0) {
      return {
        type: 'text',
        text: String(node.result ?? '').trim() || expression,
      };
    }

    let normalizedExpression = expression;

    for (const ref of refs) {
      const liveValue = await fetchLiveReferenceValue(ref.datasheetId, ref.recordId, ref.fieldId);
      const numericValue = parseNumeric(liveValue);

      if (numericValue === null) {
        return {
          type: 'text',
          text: String(node.result ?? '').trim() || expression,
        };
      }

      normalizedExpression = normalizedExpression.split(ref.raw).join(`(${numericValue})`);
    }

    const result = safeEvaluateArithmetic(normalizedExpression);
    if (result === null) {
      return {
        type: 'text',
        text: String(node.result ?? '').trim() || expression,
      };
    }

    return {
      type: 'text',
      text: Number.isInteger(result) ? String(result) : String(Number(result.toFixed(4))),
    };
  }

  async function resolveInlineNode(node: InlineNode): Promise<ResolvedInlineNode> {
    if (node.type === 'live_reference') {
      return resolveLiveReferenceNode(node);
    }

    if (node.type === 'live_formula') {
      return resolveLiveFormulaNode(node);
    }

    if (node.type === 'template_variable') {
      const label = node.label?.trim() || node.key?.trim() || 'Параметр';
      return {
        type: 'text',
        text: `{{${label}}}`,
      };
    }

    if (node.type === 'hard_break') {
      return {
        type: 'hard_break',
      };
    }

    if (node.type === 'page_link') {
      return {
        type: 'page_link',
        text: node.text,
        pageId: node.pageId,
        pageTitle: node.pageTitle,
        href: node.href,
      };
    }

    if (node.type === 'link') {
      return {
        type: 'link',
        text: node.text,
        href: node.href,
        bold: node.bold,
        italic: node.italic,
        strike: node.strike,
        code: node.code,
      };
    }

    return {
      type: 'text',
      text: node.text ?? '',
      bold: node.bold,
      italic: node.italic,
      strike: node.strike,
      code: node.code,
    };
  }

  async function resolveInlineNodes(inlineNodes: BlockNode['inlineNodes']): Promise<ResolvedInlineNode[]> {
    if (!inlineNodes || inlineNodes.length === 0) {
      return [];
    }

    return Promise.all(inlineNodes.map((node) => resolveInlineNode(node)));
  }

  return {
    resolveInlineNodes,
  };
}
