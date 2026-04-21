import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type CreateMwsFieldPayload,
  getCurrentUser,
  type MwsField,
  type MwsRecord,
  type ResolveTableEmbedResponse,
  wikiliveApi
} from '../../../shared/api/wikilive';
import { WikiTableEmbed, type WikiTableEmbedAttrs } from './wiki-table-embed';

const EDITABLE_FIELD_TYPES = new Set([
  'SingleText',
  'Text',
  'SingleSelect',
  'MultiSelect',
  'Number',
  'Currency',
  'Percent',
  'Checkbox',
  'DateTime',
  'URL',
  'Email',
  'Phone'
]);

const POLL_MIN_MS = 5000;
const POLL_MAX_MS = 10000;

export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 38;
export const INDEX_WIDTH = 56;
export const COLUMN_WIDTH = 184;
export const ADD_COLUMN_WIDTH = 72;
export const ADD_ROW_HEIGHT = ROW_HEIGHT;
export const MIN_GRID_HEIGHT = 320;
export const MAX_GRID_HEIGHT = 520;

export type CanvasSelection = {
  rowIndex: number;
  fieldIndex: number;
};

export type EditingCell = CanvasSelection & {
  left: number;
  top: number;
  width: number;
  height: number;
  value: string;
};

export type SelectOption = {
  name: string;
  color: string;
};

export type AttachmentItem = {
  name: string;
  token: string | null;
  url: string | null;
};

export type HiddenFieldState = {
  hiddenFieldIds: string[];
};

export type SortRule = {
  id: string;
  fieldId: string;
  desc: boolean;
};

export type SortRulePayload = {
  fieldId: string;
  desc: boolean;
};

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'empty'
  | 'notEmpty'
  | 'duplicates';

export type FilterRule = {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string;
};

export type GroupRule = {
  fieldId: string;
  desc: boolean;
};

type PersistedTableViewPreferences = {
  hiddenFieldIds?: string[];
  sortRules?: Array<{
    fieldId: string;
    desc?: boolean;
  }>;
  filterRules?: Array<{
    fieldId: string;
    operator: FilterOperator;
    value?: string;
  }>;
  groupRule?: {
    fieldId: string;
    desc?: boolean;
  } | null;
};

export type TableRow =
  | {
      kind: 'group';
      key: string;
      label: string;
      count: number;
    }
  | {
      kind: 'record';
      record: MwsRecord;
    };

export type EditingSelectCell = CanvasSelection & {
  left: number;
  top: number;
  width: number;
  options: SelectOption[];
  values: string[];
  multiple: boolean;
};

type BeginEditOptions = {
  replaceValue?: string;
  fromSingleClick?: boolean;
};

function createSortRuleId(seed: number) {
  return `sort-rule-${seed}`;
}

function createFilterRuleId(seed: number) {
  return `filter-rule-${seed}`;
}

function getTableViewPreferencesStorageKey(attrs: {
  nodeId?: string | null;
  datasheetId?: string | null;
  viewId?: string | null;
}) {
  if (!attrs.datasheetId) {
    return null;
  }

  const userId = getCurrentUser()?.userId ?? 'anonymous';
  return [
    'wikilive',
    'table-view-prefs',
    userId,
    attrs.datasheetId,
    attrs.viewId ?? 'default',
    attrs.nodeId ?? 'node'
  ].join(':');
}

function readPersistedTableViewPreferences(
  key: string | null
): PersistedTableViewPreferences | null {
  if (!key || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedTableViewPreferences;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedTableViewPreferences(
  key: string | null,
  value: PersistedTableViewPreferences
) {
  if (!key || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors so table interactions keep working.
  }
}

function getInitialFieldValue(field: MwsField) {
  if (field.type === 'Checkbox') {
    return false;
  }

  if (field.type === 'MultiSelect') {
    return [];
  }

  if (
    field.type === 'Number' ||
    field.type === 'Currency' ||
    field.type === 'Percent' ||
    field.type === 'DateTime' ||
    field.type === 'Attachment'
  ) {
    return null;
  }

  return '';
}

function getCreateFieldValue(field: MwsField) {
  if (field.type === 'Checkbox') {
    return false;
  }

  if (field.type === 'MultiSelect') {
    return [];
  }

  if (
    field.type === 'Number' ||
    field.type === 'Currency' ||
    field.type === 'Percent' ||
    field.type === 'DateTime' ||
    field.type === 'Attachment'
  ) {
    return undefined;
  }

  return '';
}

function buildCreateRecordFields(fields: MwsField[]) {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = getCreateFieldValue(field);
      return value === undefined ? [] : [[field.id, value] as const];
    })
  );
}

function readAttachmentName(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = value as {
      name?: unknown;
      fileName?: unknown;
      filename?: unknown;
      title?: unknown;
    };
    const raw =
      candidate.name ??
      candidate.fileName ??
      candidate.filename ??
      candidate.title;
    if (typeof raw === 'string' && raw.trim()) {
      return raw;
    }
  }

  return 'Файл';
}

function readAttachmentToken(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw =
    (
      value as {
        token?: unknown;
        fileToken?: unknown;
        attachmentToken?: unknown;
      }
    ).token ??
    (
      value as {
        token?: unknown;
        fileToken?: unknown;
        attachmentToken?: unknown;
      }
    ).fileToken ??
    (
      value as {
        token?: unknown;
        fileToken?: unknown;
        attachmentToken?: unknown;
      }
    ).attachmentToken;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function readAttachmentUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw =
    (value as { url?: unknown; href?: unknown; preview?: unknown }).url ??
    (value as { url?: unknown; href?: unknown; preview?: unknown }).href ??
    (value as { url?: unknown; href?: unknown; preview?: unknown }).preview;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function readNumericFieldValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(/\s+/g, '')
      .replace(',', '.')
      .replace('%', '')
      .replace(/[^0-9.+-]/g, '');
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === 'object') {
    const nestedValue =
      (value as { value?: unknown; number?: unknown }).value ??
      (value as { value?: unknown; number?: unknown }).number;
    return readNumericFieldValue(nestedValue);
  }

  return null;
}

function readDateTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === 'object') {
    const nestedValue =
      (value as { value?: unknown; date?: unknown; timestamp?: unknown }).
        value ??
      (value as { value?: unknown; date?: unknown; timestamp?: unknown }).
        date ??
      (value as { value?: unknown; date?: unknown; timestamp?: unknown })
        .timestamp;
    return readDateTimestamp(nestedValue);
  }

  return null;
}

function formatNumberValue(value: number, precision?: number): string {
  if (typeof precision === 'number' && precision >= 0) {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(value);
  }

  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 6,
  }).format(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatDatePart(date: Date, pattern: string): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (pattern) {
    case 'YYYY/MM/DD':
      return `${year}/${month}/${day}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM':
      return `${year}-${month}`;
    case 'MM-DD':
      return `${month}-${day}`;
    case 'YYYY':
      return year;
    case 'MM':
      return month;
    case 'DD':
      return day;
    default:
      return `${year}-${month}-${day}`;
  }
}

function formatTimePart(date: Date, pattern: string): string {
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (pattern === 'hh:mm') {
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${minutes}`;
  }

  return `${String(hours24).padStart(2, '0')}:${minutes}`;
}

function renderPrimitiveValue(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const candidate = value as {
      text?: unknown;
      title?: unknown;
      name?: unknown;
      value?: unknown;
      label?: unknown;
      email?: unknown;
      phone?: unknown;
      url?: unknown;
      href?: unknown;
    };

    for (const next of [
      candidate.text,
      candidate.title,
      candidate.name,
      candidate.label,
      candidate.email,
      candidate.phone,
      candidate.url,
      candidate.href,
      candidate.value,
    ]) {
      if (typeof next === 'string' && next.trim()) {
        return next;
      }
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function normalizeSortValue(
  rawValue: unknown,
  field: MwsField
): string | number | null {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  if (
    field.type === 'Number' ||
    field.type === 'Currency' ||
    field.type === 'Percent'
  ) {
    const numeric = readNumericFieldValue(rawValue);
    return isFiniteNumber(numeric) ? numeric : renderCell(rawValue, field);
  }

  if (field.type === 'DateTime') {
    const parsed = readDateTimestamp(rawValue);
    return isFiniteNumber(parsed) ? parsed : renderCell(rawValue, field);
  }

  return renderCell(rawValue, field).toLowerCase();
}

function compareSortValues(
  left: string | number | null,
  right: string | number | null
) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'ru', {
    numeric: true,
    sensitivity: 'base'
  });
}

function sortRecords(
  records: MwsRecord[],
  fields: MwsField[],
  sortRules: SortRule[]
) {
  if (sortRules.length === 0 || fields.length === 0) {
    return records;
  }

  const fieldMap = new Map(fields.map((field) => [field.id, field] as const));

  const localRules = sortRules.filter((rule) => {
    const field = fieldMap.get(rule.fieldId);
    return field?.type !== 'Attachment';
  });

  if (localRules.length === 0) {
    return records;
  }

  return [...records].sort((left, right) => {
    for (const rule of localRules) {
      const field = fieldMap.get(rule.fieldId);
      if (!field) {
        continue;
      }

      const leftValue = normalizeSortValue(getFieldValue(left, field), field);
      const rightValue = normalizeSortValue(getFieldValue(right, field), field);
      const result = compareSortValues(leftValue, rightValue);
      if (result !== 0) {
        return rule.desc ? -result : result;
      }
    }

    return 0;
  });
}

function normalizeFilterValue(rawValue: unknown, field: MwsField): string {
  return renderCell(rawValue, field).trim().toLowerCase();
}

function matchesFilterRule(
  record: MwsRecord,
  field: MwsField,
  rule: FilterRule,
  duplicateValues: Set<string>
) {
  const value = renderCell(getFieldValue(record, field), field).trim();
  const normalized = value.toLowerCase();
  const comparison = rule.value.trim().toLowerCase();

  switch (rule.operator) {
    case 'equals':
      return normalized === comparison;
    case 'notEquals':
      return normalized !== comparison;
    case 'contains':
      return normalized.includes(comparison);
    case 'notContains':
      return !normalized.includes(comparison);
    case 'empty':
      return value.length === 0;
    case 'notEmpty':
      return value.length > 0;
    case 'duplicates':
      return duplicateValues.has(normalized);
    default:
      return true;
  }
}

function filterRecords(
  records: MwsRecord[],
  fields: MwsField[],
  filterRules: FilterRule[]
) {
  if (filterRules.length === 0 || fields.length === 0) {
    return records;
  }

  const fieldMap = new Map(fields.map((field) => [field.id, field] as const));
  const duplicateKeys = new Map<string, number>();

  for (const rule of filterRules) {
    if (rule.operator !== 'duplicates') {
      continue;
    }

    const field = fieldMap.get(rule.fieldId);
    if (!field) {
      continue;
    }

    records.forEach((record) => {
      const normalized = normalizeFilterValue(
        getFieldValue(record, field),
        field
      );
      if (!normalized) {
        return;
      }

      duplicateKeys.set(
        `${field.id}:${normalized}`,
        (duplicateKeys.get(`${field.id}:${normalized}`) ?? 0) + 1
      );
    });
  }

  return records.filter((record) =>
    filterRules.every((rule) => {
      const field = fieldMap.get(rule.fieldId);
      if (!field) {
        return true;
      }

      const duplicateValues = new Set(
        [...duplicateKeys.entries()]
          .filter(([key, count]) => key.startsWith(`${field.id}:`) && count > 1)
          .map(([key]) => key.slice(field.id.length + 1))
      );

      return matchesFilterRule(record, field, rule, duplicateValues);
    })
  );
}

function buildGroupedRows(records: MwsRecord[], field: MwsField) {
  const rows: TableRow[] = [];
  let currentGroupKey: string | null = null;
  let currentGroupLabel = '';
  let currentGroupCount = 0;

  const flushGroup = () => {
    if (!currentGroupKey) {
      return;
    }

    rows.push({
      kind: 'group',
      key: currentGroupKey,
      label: currentGroupLabel || 'Без значения',
      count: currentGroupCount
    });
  };

  for (const record of records) {
    const groupLabel =
      renderCell(getFieldValue(record, field), field).trim() || 'Без значения';
    const groupKey = groupLabel.toLowerCase();

    if (currentGroupKey !== groupKey) {
      flushGroup();
      currentGroupKey = groupKey;
      currentGroupLabel = groupLabel;
      currentGroupCount = 0;
    }

    currentGroupCount += 1;
    rows.push({ kind: 'record', record });
  }

  flushGroup();
  return rows;
}

export function readAttachments(value: unknown): AttachmentItem[] {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => ({
    name: readAttachmentName(item),
    token: readAttachmentToken(item),
    url: readAttachmentUrl(item)
  }));
}

export function renderCell(value: unknown, field?: MwsField): string {
  if (field?.type === 'Attachment') {
    const attachments = readAttachments(value);
    if (attachments.length === 0) {
      return '';
    }

    return attachments.map((item) => item.name).join(', ');
  }

  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (field?.type === 'Checkbox') {
    const checked =
      typeof value === 'boolean'
        ? value
        : typeof value === 'number'
          ? value !== 0
          : typeof value === 'string'
            ? ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
            : Boolean(value);

    return checked ? '✓' : '';
  }

  if (field?.type === 'SingleSelect' || field?.type === 'MultiSelect') {
    return readSelectedOptionNames(value).join(', ');
  }

  if (field?.type === 'Number') {
    const numeric = readNumericFieldValue(value);
    if (!isFiniteNumber(numeric)) {
      return renderPrimitiveValue(value);
    }

    const precision =
      typeof field.property?.precision === 'number'
        ? field.property.precision
        : undefined;
    return formatNumberValue(numeric, precision);
  }

  if (field?.type === 'Currency') {
    const numeric = readNumericFieldValue(value);
    if (!isFiniteNumber(numeric)) {
      return renderPrimitiveValue(value);
    }

    const precision =
      typeof field.property?.precision === 'number'
        ? field.property.precision
        : 2;
    const symbol =
      typeof field.property?.symbol === 'string' &&
      field.property.symbol.trim().length > 0
        ? field.property.symbol
        : '₽';
    const symbolAlign =
      typeof field.property?.symbolAlign === 'string'
        ? field.property.symbolAlign
        : 'Left';
    const rendered = formatNumberValue(numeric, precision);

    return symbolAlign.toLowerCase() === 'right'
      ? `${rendered} ${symbol}`
      : `${symbol} ${rendered}`;
  }

  if (field?.type === 'Percent') {
    const numeric = readNumericFieldValue(value);
    if (!isFiniteNumber(numeric)) {
      return renderPrimitiveValue(value);
    }

    const precision =
      typeof field.property?.precision === 'number'
        ? field.property.precision
        : 0;
    return `${formatNumberValue(numeric, precision)}%`;
  }

  if (field?.type === 'DateTime') {
    const timestamp = readDateTimestamp(value);
    if (!isFiniteNumber(timestamp)) {
      return renderPrimitiveValue(value);
    }

    const date = new Date(timestamp);
    const dateFormat =
      typeof field.property?.dateFormat === 'string'
        ? field.property.dateFormat
        : 'YYYY-MM-DD';
    const includeTime = Boolean(field.property?.includeTime);
    const timeFormat =
      typeof field.property?.timeFormat === 'string'
        ? field.property.timeFormat
        : 'HH:mm';
    const datePart = formatDatePart(date, dateFormat);
    if (!includeTime) {
      return datePart;
    }

    return `${datePart} ${formatTimePart(date, timeFormat)}`;
  }

  if (
    field?.type === 'URL' ||
    field?.type === 'Email' ||
    field?.type === 'Phone'
  ) {
    return renderPrimitiveValue(value);
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderCell(item, field)).join(', ');
  }

  return renderPrimitiveValue(value);
}

export function getFieldValue(record: MwsRecord, field: MwsField) {
  return record.fields[field.id] ?? record.fields[field.name];
}

type ParsedFieldValue = {
  value: unknown;
  errorMessage: string | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  const cleaned = value.replace(/[\s()-]/g, '');
  const digitsCount = cleaned.replace(/[^0-9]/g, '').length;
  return /^[+0-9][0-9+\-()\s]{4,24}$/.test(value) && digitsCount >= 5;
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseEditedValue(field: MwsField, value: unknown): ParsedFieldValue {
  if (field.type === 'Checkbox') {
    return {
      value: Boolean(value),
      errorMessage: null,
    };
  }

  if (field.type === 'SingleSelect') {
    return {
      value,
      errorMessage: null,
    };
  }

  if (field.type === 'MultiSelect') {
    return {
      value: Array.isArray(value) ? value : [],
      errorMessage: null,
    };
  }

  if (['Number', 'Currency', 'Percent'].includes(field.type)) {
    if (value === '' || value === null || value === undefined) {
      return {
        value: null,
        errorMessage: null,
      };
    }

    const numeric = readNumericFieldValue(value);
    if (!isFiniteNumber(numeric)) {
      return {
        value: null,
        errorMessage: 'Введите корректное числовое значение',
      };
    }

    return {
      value: numeric,
      errorMessage: null,
    };
  }

  if (field.type === 'DateTime') {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return {
        value: null,
        errorMessage: null,
      };
    }

    const timestamp = readDateTimestamp(normalized);
    if (!isFiniteNumber(timestamp)) {
      return {
        value: null,
        errorMessage: 'Введите корректную дату и время',
      };
    }

    return {
      value: normalized,
      errorMessage: null,
    };
  }

  const normalized = String(value ?? '').trim();

  if (field.type === 'Email' && normalized && !isValidEmail(normalized)) {
    return {
      value: normalized,
      errorMessage: 'Введите корректный email адрес',
    };
  }

  if (field.type === 'Phone' && normalized && !isValidPhone(normalized)) {
    return {
      value: normalized,
      errorMessage: 'Введите корректный номер телефона',
    };
  }

  if (field.type === 'URL' && normalized && !isValidUrl(normalized)) {
    return {
      value: normalized,
      errorMessage: 'Введите корректную ссылку (http:// или https://)',
    };
  }

  return {
    value: normalized,
    errorMessage: null,
  };
}

function readOptionName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { name?: unknown }).name;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function readSelectOptions(field: MwsField): SelectOption[] {
  const property = field.property;
  if (!property || typeof property !== 'object') {
    return [];
  }

  const options = (property as { options?: unknown }).options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item, color: 'blue' };
      }

      if (item && typeof item === 'object') {
        const name = readOptionName(item);
        const color = (item as { color?: unknown }).color;
        if (name) {
          return {
            name,
            color:
              typeof color === 'string' && color.trim().length > 0
                ? color
                : 'blue'
          };
        }
      }

      return null;
    })
    .filter((item): item is SelectOption => Boolean(item));
}

function readSelectedOptionNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(readOptionName)
      .filter((item): item is string => Boolean(item));
  }

  const single = readOptionName(value);
  return single ? [single] : [];
}

function toSelectPatchValue(
  field: MwsField,
  currentValue: unknown,
  selectedNames: string[]
) {
  const hasObjectShape = (value: unknown) =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const isMultiple = field.type === 'MultiSelect';

  if (isMultiple) {
    if (Array.isArray(currentValue)) {
      const storesObjects = currentValue.some((item) => hasObjectShape(item));
      return storesObjects
        ? selectedNames.map((name) => ({ name }))
        : selectedNames;
    }

    if (hasObjectShape(currentValue)) {
      return selectedNames.map((name) => ({ name }));
    }

    return selectedNames;
  }

  const nextValue = selectedNames[0] ?? '';
  if (hasObjectShape(currentValue)) {
    return nextValue ? { name: nextValue } : null;
  }

  return nextValue;
}

export function fieldInputType(field: MwsField) {
  if (['Number', 'Currency', 'Percent'].includes(field.type)) {
    return 'number';
  }

  if (field.type === 'DateTime') {
    return 'datetime-local';
  }

  if (field.type === 'Email') {
    return 'email';
  }

  if (field.type === 'URL') {
    return 'url';
  }

  if (field.type === 'Phone') {
    return 'tel';
  }

  return 'text';
}

export function clampText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number
) {
  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return `${next}...`;
}

export type MwsTableEmbedController = ReturnType<typeof useWikiTableEmbed>;

export function useWikiTableEmbed(
  rawAttrs: Partial<WikiTableEmbedAttrs> | null | undefined
) {
  const attrs = useMemo(
    () => WikiTableEmbed.fromNodeAttrs(rawAttrs).toJSON(),
    [rawAttrs]
  );
  const [data, setData] = useState<ResolveTableEmbedResponse | null>(null);
  const [records, setRecords] = useState<MwsRecord[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [staleMessage, setStaleMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewport, setViewport] = useState({
    width: 720,
    height: MIN_GRID_HEIGHT
  });
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 });
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingSelectCell, setEditingSelectCell] =
    useState<EditingSelectCell | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [hiddenFieldIds, setHiddenFieldIds] = useState<string[]>([]);
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [groupRule, setGroupRule] = useState<GroupRule | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasLoadedDataRef = useRef(false);
  const activePreferencesKeyRef = useRef<string | null>(null);
  const hasHydratedPreferencesRef = useRef(false);
  const pinnedCreatedRecordsRef = useRef<Map<string, MwsRecord>>(new Map());

  const pinCreatedRecord = useCallback((record: MwsRecord) => {
    pinnedCreatedRecordsRef.current.set(record.recordId, record);
  }, []);

  const unpinCreatedRecord = useCallback((recordId: string) => {
    pinnedCreatedRecordsRef.current.delete(recordId);
  }, []);

  const updatePinnedCreatedRecord = useCallback(
    (recordId: string, updater: (record: MwsRecord) => MwsRecord) => {
      const current = pinnedCreatedRecordsRef.current.get(recordId);
      if (!current) {
        return;
      }

      pinnedCreatedRecordsRef.current.set(recordId, updater(current));
    },
    []
  );

  const mapPinnedCreatedRecords = useCallback(
    (updater: (record: MwsRecord) => MwsRecord) => {
      pinnedCreatedRecordsRef.current = new Map(
        Array.from(pinnedCreatedRecordsRef.current.entries()).map(
          ([recordId, record]) => [recordId, updater(record)]
        )
      );
    },
    []
  );

  const mergePreviewWithPinnedCreatedRecords = useCallback(
    (previewItems: MwsRecord[]) => {
      const visibleIds = new Set(previewItems.map((record) => record.recordId));

      for (const recordId of Array.from(pinnedCreatedRecordsRef.current.keys())) {
        if (visibleIds.has(recordId)) {
          pinnedCreatedRecordsRef.current.delete(recordId);
        }
      }

      return [...previewItems, ...pinnedCreatedRecordsRef.current.values()];
    },
    []
  );
  const pageSize = attrs.pageSize ?? 50;
  const serverSort = useMemo(
    () =>
      sortRules.length
        ? sortRules.map(({ fieldId, desc }) => ({ fieldId, desc }))
        : undefined,
    [sortRules]
  );

  const registerScrollElement = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      setScrollElement(element);
    },
    []
  );

  const nextPollDelay = () =>
    Math.floor(Math.random() * (POLL_MAX_MS - POLL_MIN_MS + 1)) + POLL_MIN_MS;

  useEffect(() => {
    pinnedCreatedRecordsRef.current.clear();
    const nextKey = getTableViewPreferencesStorageKey({
      nodeId: attrs.nodeId,
      datasheetId: attrs.datasheetId,
      viewId: attrs.viewId
    });
    activePreferencesKeyRef.current = nextKey;
    hasHydratedPreferencesRef.current = false;

    const preferences = readPersistedTableViewPreferences(nextKey);
    const timestampSeed = Date.now();

    setHiddenFieldIds(preferences?.hiddenFieldIds ?? []);
    setSortRules(
      (preferences?.sortRules ?? []).map((rule, index) => ({
        id: createSortRuleId(timestampSeed + index),
        fieldId: rule.fieldId,
        desc: Boolean(rule.desc)
      }))
    );
    setFilterRules(
      (preferences?.filterRules ?? []).map((rule, index) => ({
        id: createFilterRuleId(timestampSeed + index),
        fieldId: rule.fieldId,
        operator: rule.operator,
        value: rule.value ?? ''
      }))
    );
    setGroupRule(
      preferences?.groupRule?.fieldId
        ? {
            fieldId: preferences.groupRule.fieldId,
            desc: Boolean(preferences.groupRule.desc)
          }
        : null
    );
    hasHydratedPreferencesRef.current = true;
  }, [attrs.datasheetId, attrs.nodeId, attrs.viewId]);

  useEffect(() => {
    if (!hasHydratedPreferencesRef.current) {
      return;
    }

    writePersistedTableViewPreferences(activePreferencesKeyRef.current, {
      hiddenFieldIds,
      sortRules: sortRules.map(({ fieldId, desc }) => ({ fieldId, desc })),
      filterRules: filterRules.map(({ fieldId, operator, value }) => ({
        fieldId,
        operator,
        value
      })),
      groupRule
    });
  }, [filterRules, groupRule, hiddenFieldIds, sortRules]);

  const loadEmbed = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);

      if (!attrs.spaceId || !attrs.nodeId || !attrs.datasheetId) {
        setErrorMessage('В embed не хватает идентификаторов MWS Tables');
        if (!silent) {
          setIsLoading(false);
        }
        return;
      }

      try {
        if (!silent) {
          setIsLoading(true);
          setErrorMessage('');
        }
        const response = await wikiliveApi.resolveTableEmbed({
          spaceId: attrs.spaceId,
          nodeId: attrs.nodeId,
          datasheetId: attrs.datasheetId,
          viewId: attrs.viewId,
          displayMode: attrs.displayMode,
          selectedFieldIds: attrs.selectedFieldIds,
          filterByFormula: attrs.filterByFormula,
          pageSize,
          allowInlineEdit: attrs.allowInlineEdit,
          sort: serverSort
        });

        setData(response);
        setRecords(
          mergePreviewWithPinnedCreatedRecords(response.embed.preview.items)
        );
        setPageNum(response.embed.preview.pageNum);
        setTotal(response.embed.total ?? response.embed.preview.total);
        setHiddenFieldIds((current) => {
          const nextIds = response.embed.fields.map((field) => field.id);
          if (current.length === 0) {
            return [];
          }

          const nextSet = new Set(nextIds);
          return current.filter((fieldId) => nextSet.has(fieldId));
        });
        setSortRules((current) => {
          const next = current.filter((rule) =>
            response.embed.fields.some((field) => field.id === rule.fieldId)
          );
          const isSame =
            next.length === current.length &&
            next.every((rule, index) => {
              const currentRule = current[index];
              return (
                currentRule?.id === rule.id &&
                currentRule.fieldId === rule.fieldId &&
                currentRule.desc === rule.desc
              );
            });

          return isSame ? current : next;
        });
        setFilterRules((current) =>
          current.filter((rule) =>
            response.embed.fields.some((field) => field.id === rule.fieldId)
          )
        );
        setGroupRule((current) =>
          current &&
          response.embed.fields.some((field) => field.id === current.fieldId)
            ? current
            : null
        );
        if (!silent) {
          setSelection(null);
          setEditingCell(null);
          setEditingSelectCell(null);
        }
        const now = Date.now();
        setLastSyncedAt(now);
        setNowTs(now);
        setStaleMessage('');
        hasLoadedDataRef.current = true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось загрузить MWS Tables embed';
        if (hasLoadedDataRef.current) {
          setStaleMessage(message);
        } else {
          setErrorMessage(message);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [
      attrs.allowInlineEdit,
      attrs.datasheetId,
      attrs.displayMode,
      attrs.filterByFormula,
      attrs.nodeId,
      attrs.selectedFieldIds,
      attrs.spaceId,
      attrs.viewId,
      pageSize,
      serverSort,
      mergePreviewWithPinnedCreatedRecords
    ]
  );

  useEffect(() => {
    void loadEmbed();
  }, [loadEmbed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) {
        return;
      }

      const delay = nextPollDelay();
      setNextRefreshAt(Date.now() + delay);
      timeoutId = window.setTimeout(async () => {
        if (cancelled) {
          return;
        }

        if (editingCell || editingSelectCell || isMutating) {
          schedule();
          return;
        }

        await loadEmbed({ silent: true });
        schedule();
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [editingCell, editingSelectCell, isMutating, loadEmbed]);

  const embed = data?.embed;
  const fields = useMemo(() => embed?.fields ?? [], [embed?.fields]);
  const visibleFields = useMemo(() => {
    if (hiddenFieldIds.length === 0) {
      return fields;
    }

    const hiddenSet = new Set(hiddenFieldIds);
    return fields.filter((field) => !hiddenSet.has(field.id));
  }, [fields, hiddenFieldIds]);
  const capabilities = embed?.capabilities ?? {};
  const canInlineEdit = Boolean(
    attrs.allowInlineEdit && capabilities.canInlineEdit
  );
  const gridWidth =
    INDEX_WIDTH + visibleFields.length * COLUMN_WIDTH + ADD_COLUMN_WIDTH;
  const updatedAgoSec = lastSyncedAt
    ? Math.max(0, Math.floor((nowTs - lastSyncedAt) / 1000))
    : null;
  const nextRefreshInSec = nextRefreshAt
    ? Math.max(0, Math.ceil((nextRefreshAt - nowTs) / 1000))
    : null;
  const sortedRecords = useMemo(
    () => sortRecords(records, fields, sortRules),
    [fields, records, sortRules]
  );

  const filteredRecords = useMemo(() => {
    const baseRecords = filterRecords(sortedRecords, fields, filterRules);
    const normalized = searchQuery.trim().toLowerCase();

    if (!normalized) {
      return baseRecords;
    }

    return baseRecords.filter((record) =>
      visibleFields.some((field) =>
        renderCell(getFieldValue(record, field), field)
          .toLowerCase()
          .includes(normalized)
      )
    );
  }, [fields, filterRules, searchQuery, sortedRecords, visibleFields]);

  const visibleRows = useMemo<TableRow[]>(() => {
    if (!groupRule) {
      return filteredRecords.map((record) => ({ kind: 'record', record }));
    }

    const groupField = fields.find((field) => field.id === groupRule.fieldId);
    if (!groupField) {
      return filteredRecords.map((record) => ({ kind: 'record', record }));
    }

    const groupedRecords = [...filteredRecords].sort((left, right) => {
      const leftValue = normalizeSortValue(
        getFieldValue(left, groupField),
        groupField
      );
      const rightValue = normalizeSortValue(
        getFieldValue(right, groupField),
        groupField
      );
      const result = compareSortValues(leftValue, rightValue);
      return groupRule.desc ? -result : result;
    });

    return buildGroupedRows(groupedRecords, groupField);
  }, [fields, filteredRecords, groupRule]);

  const gridHeight =
    HEADER_HEIGHT +
    Math.max(visibleRows.length, 1) * ROW_HEIGHT +
    ADD_ROW_HEIGHT;
  const selectedRow = selection
    ? (visibleRows[selection.rowIndex] ?? null)
    : null;
  const selectedRecord =
    selectedRow && selectedRow.kind === 'record' ? selectedRow.record : null;
  const selectedField = selection
    ? (visibleFields[selection.fieldIndex] ?? null)
    : null;
  const selectedAttachments = useMemo(() => {
    if (
      !selectedRecord ||
      !selectedField ||
      selectedField.type !== 'Attachment'
    ) {
      return [] as AttachmentItem[];
    }

    return readAttachments(getFieldValue(selectedRecord, selectedField));
  }, [selectedField, selectedRecord]);

  useEffect(() => {
    const element = scrollElement;
    if (!element) {
      return undefined;
    }

    const updateViewport = () => {
      setViewport({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight)
      });
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => observer.disconnect();
  }, [scrollElement]);

  const hasMore = records.length < total;

  const loadNextPage = useCallback(async () => {
    if (!attrs.datasheetId || isLoading || isMutating || !hasMore) {
      return;
    }

    try {
      setIsMutating(true);
      setErrorMessage('');
      const response = await wikiliveApi.listMwsRecords(attrs.datasheetId, {
        viewId: attrs.viewId,
        pageSize,
        pageNum: pageNum + 1,
        fields: attrs.selectedFieldIds,
        filterByFormula: attrs.filterByFormula,
        sort: serverSort
      });
      setRecords((current) => [...current, ...response.items]);
      setPageNum(response.pageNum);
      setTotal(response.total);
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить следующую страницу'
      );
    } finally {
      setIsMutating(false);
    }
  }, [
    attrs.datasheetId,
    attrs.filterByFormula,
    attrs.selectedFieldIds,
    attrs.viewId,
    hasMore,
    isLoading,
    isMutating,
    pageNum,
    pageSize,
    serverSort
  ]);

  const updateCell = (record: MwsRecord, field: MwsField, value: unknown) => {
    if (!attrs.datasheetId || !EDITABLE_FIELD_TYPES.has(field.type)) {
      return false;
    }

    const parsed = parseEditedValue(field, value);
    if (parsed.errorMessage) {
      setStaleMessage(parsed.errorMessage);
      return false;
    }

    const parsedValue = parsed.value;
    const currentValue = getFieldValue(record, field);
    if (
      JSON.stringify(currentValue ?? null) ===
      JSON.stringify(parsedValue ?? null)
    ) {
      return true;
    }

    setStaleMessage('');

    // Optimistic update: reflect cell edit immediately in UI.
    setRecords((current) =>
      current.map((item) =>
        item.recordId === record.recordId
          ? { ...item, fields: { ...item.fields, [field.id]: parsedValue } }
          : item
      )
    );
    updatePinnedCreatedRecord(record.recordId, (item) => ({
      ...item,
      fields: { ...item.fields, [field.id]: parsedValue }
    }));

    void wikiliveApi
      .updateMwsRecords(attrs.datasheetId, {
        fieldKey: 'id',
        records: [
          { recordId: record.recordId, fields: { [field.id]: parsedValue } }
        ]
      })
      .then(() => {
        setStaleMessage('');
      })
      .catch((error) => {
        // Roll back only this cell when backend sync fails.
        setRecords((current) =>
          current.map((item) =>
            item.recordId === record.recordId
              ? {
                  ...item,
                  fields: { ...item.fields, [field.id]: currentValue }
                }
              : item
          )
        );
        updatePinnedCreatedRecord(record.recordId, (item) => ({
          ...item,
          fields: { ...item.fields, [field.id]: currentValue }
        }));
        setStaleMessage(
          error instanceof Error ? error.message : 'Не удалось обновить ячейку'
        );
      });

    return true;
  };

  const createRow = async () => {
    if (!attrs.datasheetId || fields.length === 0) {
      return;
    }

    const editableFields = fields.filter((field) =>
      EDITABLE_FIELD_TYPES.has(field.type)
    );
    const optimisticFields = Object.fromEntries(
      editableFields.map((field) => [field.id, getInitialFieldValue(field)])
    );
    const createFields = buildCreateRecordFields(editableFields);
    const optimisticRecord: MwsRecord = {
      recordId: `temp-record-${Date.now()}`,
      fields: optimisticFields,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setRecords((current) => [...current, optimisticRecord]);
    setTotal((current) => current + 1);
    setStaleMessage('');
    setIsMutating(true);

    try {
      const response = await wikiliveApi.createMwsRecords(attrs.datasheetId, {
        fieldKey: 'id',
        records: [{ fields: createFields }]
      });

      const createdRecord = response.items[0];
      if (!createdRecord) {
        await loadEmbed({ silent: true });
        return;
      }

      pinCreatedRecord(createdRecord);

      // If a background resolve replaced the optimistic row before this response,
      // append the created record so the new row is not lost in UI.
      setRecords((current) => {
        let replaced = false;
        const next = current.map((item) => {
          if (item.recordId === optimisticRecord.recordId) {
            replaced = true;
            return createdRecord;
          }
          return item;
        });

        if (replaced) {
          return next;
        }

        if (next.some((item) => item.recordId === createdRecord.recordId)) {
          return next;
        }

        return [...next, createdRecord];
      });
      setStaleMessage('');
    } catch (error) {
      setRecords((current) =>
        current.filter((item) => item.recordId !== optimisticRecord.recordId)
      );
      setTotal((current) => Math.max(0, current - 1));
      setStaleMessage(
        error instanceof Error ? error.message : 'Не удалось добавить строку'
      );
    } finally {
      setIsMutating(false);
    }
  };

  const applyAiRecords = (nextRecords: MwsRecord[]) => {
    if (!Array.isArray(nextRecords) || nextRecords.length === 0) {
      return;
    }

    setRecords((current) => [...current, ...nextRecords]);
    setTotal((current) => current + nextRecords.length);
    setStaleMessage('');
  };

  const createField = async (
    payload: Omit<CreateMwsFieldPayload, 'spaceId'>
  ) => {
    if (!attrs.datasheetId || !attrs.spaceId) {
      return false;
    }

    const optimisticField: MwsField = {
      id: `temp-field-${Date.now()}`,
      name: payload.name,
      type: payload.type,
      property: payload.property
    };

    setData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        embed: {
          ...current.embed,
          fields: [...current.embed.fields, optimisticField]
        }
      };
    });
    setRecords((current) =>
      current.map((record) => ({
        ...record,
        fields: {
          ...record.fields,
          [optimisticField.id]: getInitialFieldValue(optimisticField)
        }
      }))
    );
    mapPinnedCreatedRecords((record) => ({
      ...record,
      fields: {
        ...record.fields,
        [optimisticField.id]: getInitialFieldValue(optimisticField)
      }
    }));
    setStaleMessage('');
    setIsMutating(true);

    try {
      const response = await wikiliveApi.createMwsField(attrs.datasheetId, {
        spaceId: attrs.spaceId,
        ...payload
      });

      const createdField = response.field;
      if (!createdField) {
        await loadEmbed({ silent: true });
        return true;
      }

      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          embed: {
            ...current.embed,
            fields: current.embed.fields.map((field) =>
              field.id === optimisticField.id ? createdField : field
            )
          }
        };
      });
      setRecords((current) =>
        current.map((record) => {
          if (!(optimisticField.id in record.fields)) {
            return record;
          }

          const nextFields = { ...record.fields };
          nextFields[createdField.id] = nextFields[optimisticField.id];
          delete nextFields[optimisticField.id];
          return { ...record, fields: nextFields };
        })
      );
      mapPinnedCreatedRecords((record) => {
        if (!(optimisticField.id in record.fields)) {
          return record;
        }

        const nextFields = { ...record.fields };
        nextFields[createdField.id] = nextFields[optimisticField.id];
        delete nextFields[optimisticField.id];
        return { ...record, fields: nextFields };
      });
      setStaleMessage('');
      return true;
    } catch (error) {
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          embed: {
            ...current.embed,
            fields: current.embed.fields.filter(
              (field) => field.id !== optimisticField.id
            )
          }
        };
      });
      setRecords((current) =>
        current.map((record) => {
          const nextFields = { ...record.fields };
          delete nextFields[optimisticField.id];
          return { ...record, fields: nextFields };
        })
      );
      mapPinnedCreatedRecords((record) => {
        const nextFields = { ...record.fields };
        delete nextFields[optimisticField.id];
        return { ...record, fields: nextFields };
      });
      setStaleMessage(
        error instanceof Error ? error.message : 'Не удалось создать столбец'
      );
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const applyAiField = (field: MwsField | null) => {
    if (!field) {
      return;
    }

    setData((current) => {
      if (!current) {
        return current;
      }

      if (current.embed.fields.some((item) => item.id === field.id)) {
        return current;
      }

      return {
        ...current,
        embed: {
          ...current.embed,
          fields: [...current.embed.fields, field],
        },
      };
    });

    setRecords((current) =>
      current.map((record) => ({
        ...record,
        fields: {
          ...record.fields,
          [field.id]: null,
        },
      })),
    );
    setStaleMessage('');
  };

  const refreshTable = () => loadEmbed({ silent: true });

  const deleteRow = async (record: MwsRecord | null) => {
    if (!attrs.datasheetId || !record) {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.deleteMwsRecords(attrs.datasheetId, [record.recordId]);
      unpinCreatedRecord(record.recordId);
      setRecords((current) =>
        current.filter((item) => item.recordId !== record.recordId)
      );
      setTotal((current) => Math.max(0, current - 1));
      setSelection(null);
      setEditingCell(null);
      setEditingSelectCell(null);
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(
        error instanceof Error ? error.message : 'Не удалось удалить строку'
      );
    } finally {
      setIsMutating(false);
    }
  };

  const uploadAttachment = async (
    record: MwsRecord | null,
    field: MwsField | null,
    file: File
  ) => {
    if (
      !attrs.datasheetId ||
      !record ||
      !field ||
      field.type !== 'Attachment'
    ) {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.uploadMwsAttachment(attrs.datasheetId, {
        file,
        recordId: record.recordId,
        fieldId: field.id
      });
      await loadEmbed();
    } catch (error) {
      setStaleMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить файл в ячейку'
      );
    } finally {
      setIsMutating(false);
    }
  };

  const uploadAttachments = async (
    record: MwsRecord | null,
    field: MwsField | null,
    files: File[]
  ) => {
    if (
      !attrs.datasheetId ||
      !record ||
      !field ||
      field.type !== 'Attachment' ||
      files.length === 0
    ) {
      return;
    }

    try {
      setIsMutating(true);
      const results = await Promise.allSettled(
        files.map((file) =>
          wikiliveApi.uploadMwsAttachment(attrs.datasheetId!, {
            file,
            recordId: record.recordId,
            fieldId: field.id
          })
        )
      );

      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      );

      await loadEmbed();

      if (failed) {
        throw failed.reason;
      }
    } catch (error) {
      setStaleMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить файл в ячейку'
      );
    } finally {
      setIsMutating(false);
    }
  };

  const downloadAttachment = async (attachment: AttachmentItem) => {
    if (!attrs.datasheetId) {
      return;
    }

    if (attachment.token) {
      try {
        setIsMutating(true);
        await wikiliveApi.downloadMwsAttachment(attrs.datasheetId, {
          token: attachment.token,
          fileName: attachment.name
        });
        setStaleMessage('');
      } catch (error) {
        setStaleMessage(
          error instanceof Error ? error.message : 'Не удалось скачать вложение'
        );
      } finally {
        setIsMutating(false);
      }

      return;
    }

    if (attachment.url) {
      window.open(attachment.url, '_blank', 'noopener,noreferrer');
      return;
    }

    setStaleMessage('Для этого вложения нет токена или URL скачивания');
  };

  const hitTest = (
    event:
      | React.PointerEvent<HTMLCanvasElement>
      | React.MouseEvent<HTMLCanvasElement>
  ): CanvasSelection | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (y < HEADER_HEIGHT || x < INDEX_WIDTH) {
      return null;
    }

    const rowIndex = Math.floor(
      (y + scrollOffset.top - HEADER_HEIGHT) / ROW_HEIGHT
    );
    const fieldIndex = Math.floor(
      (x + scrollOffset.left - INDEX_WIDTH) / COLUMN_WIDTH
    );

    if (
      rowIndex < 0 ||
      rowIndex >= visibleRows.length ||
      fieldIndex < 0 ||
      fieldIndex >= visibleFields.length
    ) {
      return null;
    }

    if (visibleRows[rowIndex]?.kind !== 'record') {
      return null;
    }

    return { rowIndex, fieldIndex };
  };

  const beginEdit = (
    nextSelection: CanvasSelection | null,
    options?: BeginEditOptions
  ) => {
    if (!nextSelection) {
      return;
    }

    const row = visibleRows[nextSelection.rowIndex];
    const record = row && row.kind === 'record' ? row.record : null;
    const field = visibleFields[nextSelection.fieldIndex];

    if (
      !record ||
      !field ||
      !canInlineEdit ||
      !EDITABLE_FIELD_TYPES.has(field.type)
    ) {
      return;
    }

    if (field.type === 'Checkbox') {
      setEditingSelectCell(null);
      void updateCell(record, field, !getFieldValue(record, field));
      return;
    }

    if (field.type === 'SingleSelect' || field.type === 'MultiSelect') {
      const availableOptions = readSelectOptions(field);
      if (availableOptions.length > 0) {
        const values = readSelectedOptionNames(getFieldValue(record, field));
        setEditingCell(null);
        setEditingSelectCell({
          ...nextSelection,
          left: INDEX_WIDTH + nextSelection.fieldIndex * COLUMN_WIDTH,
          top: HEADER_HEIGHT + nextSelection.rowIndex * ROW_HEIGHT,
          width: COLUMN_WIDTH,
          options: availableOptions,
          values,
          multiple: field.type === 'MultiSelect'
        });
        return;
      }
    }

    if (options?.fromSingleClick) {
      return;
    }

    setEditingSelectCell(null);
    setEditingCell({
      ...nextSelection,
      left: INDEX_WIDTH + nextSelection.fieldIndex * COLUMN_WIDTH,
      top: HEADER_HEIGHT + nextSelection.rowIndex * ROW_HEIGHT,
      width: COLUMN_WIDTH,
      height: ROW_HEIGHT,
      value: options?.replaceValue ?? renderCell(getFieldValue(record, field))
    });
  };

  const commitEdit = () => {
    if (!editingCell) {
      return;
    }

    const row = visibleRows[editingCell.rowIndex];
    const record = row && row.kind === 'record' ? row.record : null;
    const field = visibleFields[editingCell.fieldIndex];

    if (record && field) {
      const committed = updateCell(record, field, editingCell.value);
      if (committed) {
        setEditingCell(null);
      }
      return;
    }

    setEditingCell(null);
  };

  const clearSelectValue = () => {
    if (!editingSelectCell) {
      return;
    }

    const row = visibleRows[editingSelectCell.rowIndex];
    const record = row && row.kind === 'record' ? row.record : null;
    const field = visibleFields[editingSelectCell.fieldIndex];
    if (
      !record ||
      !field ||
      (field.type !== 'SingleSelect' && field.type !== 'MultiSelect')
    ) {
      return;
    }

    const nextNames: string[] = [];
    const patchValue = toSelectPatchValue(
      field,
      getFieldValue(record, field),
      nextNames
    );
    setEditingSelectCell((current) =>
      current ? { ...current, values: nextNames } : current
    );
    void updateCell(record, field, patchValue);
  };

  const applySelectValue = (optionName: string) => {
    if (!editingSelectCell) {
      return;
    }

    const row = visibleRows[editingSelectCell.rowIndex];
    const record = row && row.kind === 'record' ? row.record : null;
    const field = visibleFields[editingSelectCell.fieldIndex];
    if (
      !record ||
      !field ||
      (field.type !== 'SingleSelect' && field.type !== 'MultiSelect')
    ) {
      return;
    }

    const isMultiple = field.type === 'MultiSelect';
    let nextNames: string[];

    if (isMultiple) {
      const current = new Set(editingSelectCell.values);
      if (current.has(optionName)) {
        current.delete(optionName);
      } else {
        current.add(optionName);
      }
      nextNames = [...current];
      setEditingSelectCell((currentCell) =>
        currentCell ? { ...currentCell, values: nextNames } : currentCell
      );
    } else {
      nextNames = [optionName];
      setEditingSelectCell(null);
    }

    const patchValue = toSelectPatchValue(
      field,
      getFieldValue(record, field),
      nextNames
    );
    void updateCell(record, field, patchValue);
  };

  const handleCanvasScroll = () => {
    const element = scrollElement ?? scrollRef.current;
    if (!element) {
      return;
    }

    setScrollOffset({ left: element.scrollLeft, top: element.scrollTop });
    setEditingSelectCell(null);

    if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
      void loadNextPage();
    }
  };

  return {
    attrs,
    embed,
    fields,
    visibleFields,
    records,
    total,
    isLoading,
    isMutating,
    errorMessage,
    staleMessage,
    searchQuery,
    setSearchQuery,
    viewport,
    scrollOffset,
    selection,
    setSelection,
    editingCell,
    setEditingCell,
    editingSelectCell,
    setEditingSelectCell,
    scrollRef,
    registerScrollElement,
    canvasRef,
    canInlineEdit,
    capabilities,
    updatedAgoSec,
    nextRefreshInSec,
    hasMore,
    gridWidth,
    gridHeight,
    visibleRows,
    filteredRecords,
    selectedRecord,
    selectedField,
    selectedAttachments,
    hiddenFieldIds,
    setHiddenFieldIds,
    sortRules,
    setSortRules,
    filterRules,
    setFilterRules,
    groupRule,
    setGroupRule,
    applySort: (rules: SortRule[]) => {
      setSortRules(rules);
      if (attrs.spaceId && attrs.datasheetId && attrs.viewId) {
        void wikiliveApi.setMwsViewSort(
          attrs.spaceId,
          attrs.datasheetId,
          attrs.viewId,
          rules.map(({ fieldId, desc }) => ({ fieldId, desc })),
        ).catch(() => {});
      }
    },
    applyGroup: (rule: GroupRule | null) => {
      setGroupRule(rule);
      if (attrs.spaceId && attrs.datasheetId && attrs.viewId) {
        void wikiliveApi.setMwsViewGroup(
          attrs.spaceId,
          attrs.datasheetId,
          attrs.viewId,
          rule ? [{ fieldId: rule.fieldId, desc: rule.desc }] : [],
        ).catch(() => {});
      }
    },
    loadEmbed,
    refreshTable,
    loadNextPage,
    createRow,
    createField,
    applyAiRecords,
    applyAiField,
    deleteRow,
    uploadAttachment,
    uploadAttachments,
    downloadAttachment,
    hitTest,
    beginEdit,
    commitEdit,
    clearSelectValue,
    applySelectValue,
    handleCanvasScroll
  };
}
