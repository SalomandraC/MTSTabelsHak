import { describe, expect, it } from 'vitest';

import type { MwsField } from '../../../shared/api/wikilive';
import { renderCell } from './use-wiki-table-embed';

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

describe('renderCell', () => {
  it('renders checkbox values as checkmark glyphs', () => {
    const field: MwsField = { id: 'fld-checkbox', name: 'Done', type: 'Checkbox' };

    expect(renderCell(true, field)).toBe('✓');
    expect(renderCell(false, field)).toBe('');
    expect(renderCell('true', field)).toBe('✓');
  });

  it('renders currency with symbol and alignment', () => {
    const leftField: MwsField = {
      id: 'fld-price-left',
      name: 'Price',
      type: 'Currency',
      property: { precision: 2, symbol: '$', symbolAlign: 'Left' },
    };
    const rightField: MwsField = {
      id: 'fld-price-right',
      name: 'Price',
      type: 'Currency',
      property: { precision: 2, symbol: 'EUR', symbolAlign: 'Right' },
    };

    expect(normalizeSpaces(renderCell(1234.5, leftField))).toBe('$ 1 234,50');
    expect(normalizeSpaces(renderCell(1234.5, rightField))).toBe('1 234,50 EUR');
  });

  it('renders percent values with suffix and precision', () => {
    const field: MwsField = {
      id: 'fld-percent',
      name: 'Completion',
      type: 'Percent',
      property: { precision: 1 },
    };

    expect(renderCell(12.34, field)).toBe('12,3%');
  });

  it('renders datetime values with configured format', () => {
    const dateOnlyField: MwsField = {
      id: 'fld-date',
      name: 'Date',
      type: 'DateTime',
      property: { dateFormat: 'YYYY-MM-DD' },
    };
    const dateTimeField: MwsField = {
      id: 'fld-datetime',
      name: 'Date time',
      type: 'DateTime',
      property: { dateFormat: 'DD/MM/YYYY', includeTime: true, timeFormat: 'HH:mm' },
    };

    expect(renderCell('2026-04-21T10:05:00', dateOnlyField)).toBe('2026-04-21');
    expect(renderCell('2026-04-21T10:05:00', dateTimeField)).toBe('21/04/2026 10:05');
  });

  it('renders select options from object or string values', () => {
    const singleField: MwsField = { id: 'fld-single', name: 'Status', type: 'SingleSelect' };
    const multiField: MwsField = { id: 'fld-multi', name: 'Tags', type: 'MultiSelect' };

    expect(renderCell({ name: 'In progress' }, singleField)).toBe('In progress');
    expect(renderCell([{ name: 'Frontend' }, 'Backend'], multiField)).toBe('Frontend, Backend');
  });
});
