import { wikiliveApi } from '../../../shared/api/wikilive';

export type FormulaRefToken = {
  raw: string;
  datasheetId: string;
  recordId: string;
  fieldId: string;
};

export type FormulaEvaluationResult =
  | {
      ok: true;
      result: number;
      displayValue: string;
      usedRefs: FormulaRefToken[];
      normalizedExpression: string;
    }
  | {
      ok: false;
      error: string;
      usedRefs: FormulaRefToken[];
    };

const LIVE_REF_TOKEN = /\[Ref:([^:\]\s]+):([^:\]\s]+):([^:\]\s]+)\]/g;

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

function getSnapshotCellValue(datasheetId: string, recordId: string, fieldId: string): unknown {
  const globalStore = window as unknown as {
    __wikiliveTableSnapshots?: Record<string, {
      records?: Array<{ recordId?: string; fields?: Record<string, unknown> }>;
    }>;
  };

  const snapshot = globalStore.__wikiliveTableSnapshots?.[datasheetId];
  const row = snapshot?.records?.find((record) => String(record.recordId ?? '') === recordId);

  return row?.fields?.[fieldId];
}

async function resolveReferenceValue(token: FormulaRefToken): Promise<number | null> {
  const snapshotValue = getSnapshotCellValue(token.datasheetId, token.recordId, token.fieldId);
  const snapshotNumber = parseNumeric(snapshotValue);

  if (snapshotNumber !== null) {
    return snapshotNumber;
  }

  try {
    const response = await wikiliveApi.getMwsCellValue(token.datasheetId, token.recordId, token.fieldId);
    const fromCell = parseNumeric(response.cell.displayValue ?? response.cell.value);
    return fromCell;
  } catch {
    return null;
  }
}

export function collectFormulaRefTokens(expression: string): FormulaRefToken[] {
  const tokens: FormulaRefToken[] = [];
  LIVE_REF_TOKEN.lastIndex = 0;

  let match = LIVE_REF_TOKEN.exec(expression);
  while (match) {
    tokens.push({
      raw: match[0],
      datasheetId: match[1],
      recordId: match[2],
      fieldId: match[3],
    });
    match = LIVE_REF_TOKEN.exec(expression);
  }

  return tokens;
}

export const extractFormulaRefTokens = collectFormulaRefTokens;

function safeEvaluateArithmetic(expression: string): number | null {
  const normalized = expression.replace(/,/g, '.').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  // Allow only arithmetic literals/operators after [Ref:...] expansion.
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

export async function evaluateLiveFormulaExpression(expression: string): Promise<FormulaEvaluationResult> {
  const rawExpression = String(expression ?? '').trim();

  if (!rawExpression) {
    return {
      ok: false,
      error: 'Формула пустая',
      usedRefs: [],
    };
  }

  const refs = collectFormulaRefTokens(rawExpression);

  if (refs.length === 0) {
    return {
      ok: false,
      error: 'Добавьте хотя бы одну живую переменную [Ref:tableId:rowId:colId]',
      usedRefs: [],
    };
  }

  let normalizedExpression = rawExpression;

  for (const ref of refs) {
    const numericValue = await resolveReferenceValue(ref);

    if (numericValue === null) {
      return {
        ok: false,
        error: `Ячейка ${ref.recordId}/${ref.fieldId} не содержит числовое значение`,
        usedRefs: refs,
      };
    }

    normalizedExpression = normalizedExpression.split(ref.raw).join(`(${numericValue})`);
  }

  const result = safeEvaluateArithmetic(normalizedExpression);

  if (result === null) {
    return {
      ok: false,
      error: 'Некорректное выражение формулы',
      usedRefs: refs,
    };
  }

  return {
    ok: true,
    result,
    displayValue: Number.isInteger(result) ? String(result) : String(Number(result.toFixed(4))),
    usedRefs: refs,
    normalizedExpression,
  };
}

export async function evaluateLiveFormula(expression: string): Promise<FormulaEvaluationResult> {
  return evaluateLiveFormulaExpression(expression);
}
