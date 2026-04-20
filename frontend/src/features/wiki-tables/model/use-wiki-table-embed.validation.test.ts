import { describe, expect, it } from 'vitest';

import type { MwsField } from '../../../shared/api/wikilive';
import { parseEditedValue } from './use-wiki-table-embed';

function makeField(type: MwsField['type']): MwsField {
  return {
    id: `fld-${type}`,
    name: type,
    type,
  };
}

describe('parseEditedValue', () => {
  it('validates email values', () => {
    const field = makeField('Email');

    expect(parseEditedValue(field, 'user@example.com')).toEqual({
      value: 'user@example.com',
      errorMessage: null,
    });

    expect(parseEditedValue(field, 'bad-email').errorMessage).toBe(
      'Введите корректный email адрес',
    );
  });

  it('validates phone values', () => {
    const field = makeField('Phone');

    expect(parseEditedValue(field, '+7 (999) 123-45-67')).toEqual({
      value: '+7 (999) 123-45-67',
      errorMessage: null,
    });

    expect(parseEditedValue(field, 'abc').errorMessage).toBe(
      'Введите корректный номер телефона',
    );
  });

  it('validates url values', () => {
    const field = makeField('URL');

    expect(parseEditedValue(field, 'https://mws.ru')).toEqual({
      value: 'https://mws.ru',
      errorMessage: null,
    });

    expect(parseEditedValue(field, 'mws.ru').errorMessage).toBe(
      'Введите корректную ссылку (http:// или https://)',
    );
  });

  it('validates numeric values for number-like fields', () => {
    const numberField = makeField('Number');

    expect(parseEditedValue(numberField, ' 1 234,56 ')).toEqual({
      value: 1234.56,
      errorMessage: null,
    });

    expect(parseEditedValue(numberField, 'nope').errorMessage).toBe(
      'Введите корректное числовое значение',
    );
  });

  it('validates datetime values', () => {
    const field = makeField('DateTime');

    expect(parseEditedValue(field, '2026-04-21T13:45')).toEqual({
      value: '2026-04-21T13:45',
      errorMessage: null,
    });

    expect(parseEditedValue(field, 'not-a-date').errorMessage).toBe(
      'Введите корректную дату и время',
    );
  });
});
