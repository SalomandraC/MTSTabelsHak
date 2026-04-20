export type LiveChartType = 'line' | 'bar' | 'pie';

export type LiveChartAttrs = {
  chartType: LiveChartType;
  datasheetId: string;
  xAxisFieldId: string;
  yAxisFieldIds: string[];
};

export type LiveChartSnapshotField = {
  id: string;
  name: string;
  type?: string;
};

export type LiveChartSnapshotRecord = {
  recordId: string;
  fields: Record<string, unknown>;
};

export type LiveChartTableSnapshot = {
  datasheetId?: string;
  viewId?: string | null;
  fields?: LiveChartSnapshotField[];
  records?: LiveChartSnapshotRecord[];
  total?: number;
  updatedAt?: number;
};

export type LiveChartPoint = {
  xLabel: string;
  [seriesKey: string]: string | number;
};

export function isNumericFieldType(type: string | undefined): boolean {
  const normalized = String(type ?? '').toLowerCase();
  return (
    normalized.includes('number')
    || normalized.includes('currency')
    || normalized.includes('percent')
    || normalized.includes('rating')
    || normalized.includes('formula')
  );
}

export function parseChartNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.value === 'number') {
      return Number.isFinite(record.value) ? record.value : 0;
    }
    if (typeof record.amount === 'number') {
      return Number.isFinite(record.amount) ? record.amount : 0;
    }
  }

  return 0;
}

export function toChartLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '—';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => toChartLabel(item)).join(', ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.title === 'string') {
      return record.title;
    }
    if (typeof record.value === 'string') {
      return record.value;
    }
  }

  return String(value);
}

export function getGlobalTableSnapshot(datasheetId: string): LiveChartTableSnapshot | null {
  if (!datasheetId) {
    return null;
  }

  const globalStore = window as unknown as {
    __wikiliveTableSnapshots?: Record<string, LiveChartTableSnapshot>;
  };

  return globalStore.__wikiliveTableSnapshots?.[datasheetId] ?? null;
}

export function buildLiveChartData(attrs: LiveChartAttrs, snapshot: LiveChartTableSnapshot | null): {
  points: LiveChartPoint[];
  xFieldName: string;
  ySeries: Array<{ fieldId: string; fieldName: string }>;
} {
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];

  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const xFieldName = fieldById.get(attrs.xAxisFieldId)?.name || attrs.xAxisFieldId;
  const ySeries = attrs.yAxisFieldIds
    .map((fieldId) => ({ fieldId, fieldName: fieldById.get(fieldId)?.name || fieldId }))
    .filter((series) => series.fieldId.length > 0);

  const points = records.map((record) => {
    const row: LiveChartPoint = {
      xLabel: toChartLabel(record.fields?.[attrs.xAxisFieldId]),
    };

    for (const series of ySeries) {
      row[series.fieldId] = parseChartNumber(record.fields?.[series.fieldId]);
    }

    return row;
  });

  return { points, xFieldName, ySeries };
}
