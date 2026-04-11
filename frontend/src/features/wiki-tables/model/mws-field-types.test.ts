import { describe, expect, it } from 'vitest';

import { getMwsFieldTypeLabel } from './mws-field-types';

describe('getMwsFieldTypeLabel', () => {
  it('returns localized label for known field types', () => {
    expect(getMwsFieldTypeLabel('SingleSelect')).toBe('Одиночный выбор');
    expect(getMwsFieldTypeLabel('MultiSelect')).toBe('Множественный выбор');
    expect(getMwsFieldTypeLabel('DateTime')).toBe('Дата и время');
  });

  it('falls back to raw type for unknown values', () => {
    expect(getMwsFieldTypeLabel('CustomType')).toBe('CustomType');
  });
});
