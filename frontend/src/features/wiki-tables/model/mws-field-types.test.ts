import { describe, expect, it } from 'vitest';

import { createFieldProperty, getMwsFieldTypeLabel } from './mws-field-types';

describe('getMwsFieldTypeLabel', () => {
  it('returns localized label for known field types', () => {
    expect(getMwsFieldTypeLabel('SingleSelect')).toBe('Одиночный выбор');
    expect(getMwsFieldTypeLabel('MultiSelect')).toBe('Множественный выбор');
    expect(getMwsFieldTypeLabel('DateTime')).toBe('Дата и время');
  });

  it('falls back to raw type for unknown values', () => {
    expect(getMwsFieldTypeLabel('CustomType')).toBe('CustomType');
  });

  it('builds safe checkbox property payload', () => {
    expect(
      createFieldProperty('Checkbox', {
        checkboxIcon: 'custom_checkbox',
      }),
    ).toEqual({ icon: 'custom_checkbox' });

    expect(
      createFieldProperty('Checkbox', {
        checkboxIcon: '  ',
      }),
    ).toEqual({ icon: 'check' });
  });

  it('trims default values for text-like properties', () => {
    expect(
      createFieldProperty('SingleText', {
        defaultValue: '  ready  ',
      }),
    ).toEqual({ defaultValue: 'ready' });
  });

  it('returns undefined property for phone/email/url types', () => {
    expect(createFieldProperty('Phone', {})).toBeUndefined();
    expect(createFieldProperty('Email', {})).toBeUndefined();
    expect(createFieldProperty('URL', {})).toBeUndefined();
  });
});
