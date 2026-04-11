export type SupportedMwsFieldType =
  | 'SingleText'
  | 'Text'
  | 'SingleSelect'
  | 'MultiSelect'
  | 'Number'
  | 'Currency'
  | 'Percent'
  | 'DateTime'
  | 'Attachment'
  | 'Checkbox'
  | 'URL'
  | 'Email'
  | 'Phone';

export type SelectOptionDraft = {
  id: string;
  name: string;
  color: string;
};

export const MWS_FIELD_TYPE_LABELS: Record<string, string> = {
  SingleText: 'Короткий текст',
  Text: 'Длинный текст',
  SingleSelect: 'Одиночный выбор',
  MultiSelect: 'Множественный выбор',
  Number: 'Число',
  Currency: 'Валюта',
  Percent: 'Процент',
  DateTime: 'Дата и время',
  Attachment: 'Вложение',
  Checkbox: 'Чекбокс',
  URL: 'Ссылка',
  Email: 'Email',
  Phone: 'Телефон',
};

export function getMwsFieldTypeLabel(type: string) {
  return MWS_FIELD_TYPE_LABELS[type] ?? type;
}

export const MWS_FIELD_TYPE_OPTIONS: Array<{ value: SupportedMwsFieldType; label: string }> = [
  { value: 'SingleText', label: 'Короткий текст' },
  { value: 'Text', label: 'Длинный текст' },
  { value: 'SingleSelect', label: 'Одиночный выбор' },
  { value: 'MultiSelect', label: 'Множественный выбор' },
  { value: 'Number', label: 'Число' },
  { value: 'Currency', label: 'Валюта' },
  { value: 'Percent', label: 'Процент' },
  { value: 'DateTime', label: 'Дата и время' },
  { value: 'Attachment', label: 'Вложение' },
  { value: 'Checkbox', label: 'Чекбокс' },
  { value: 'URL', label: 'Ссылка' },
  { value: 'Email', label: 'Email' },
  { value: 'Phone', label: 'Телефон' },
];

export const SELECT_OPTION_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'gray',
];

function normalizeOptions(options: SelectOptionDraft[]) {
  return options
    .map((option) => ({
      name: option.name.trim(),
      color: option.color || 'blue',
    }))
    .filter((option) => option.name.length > 0);
}

export function createFieldProperty(
  type: SupportedMwsFieldType,
  options: {
    selectOptions?: SelectOptionDraft[];
    defaultValue?: string;
    precision?: number;
    symbol?: string;
    symbolAlign?: string;
    dateFormat?: string;
    timeFormat?: string;
    includeTime?: boolean;
    checkboxIcon?: string;
  },
) {
  switch (type) {
    case 'SingleSelect':
    case 'MultiSelect':
      return {
        options: normalizeOptions(options.selectOptions ?? []),
        ...(options.defaultValue ? { defaultValue: options.defaultValue } : {}),
      };
    case 'Number':
      return {
        precision: options.precision ?? 0,
        ...(options.defaultValue ? { defaultValue: options.defaultValue } : {}),
      };
    case 'Currency':
      return {
        precision: options.precision ?? 2,
        symbol: options.symbol || '₽',
        symbolAlign: options.symbolAlign || 'Left',
        ...(options.defaultValue ? { defaultValue: options.defaultValue } : {}),
      };
    case 'Percent':
      return {
        precision: options.precision ?? 0,
        ...(options.defaultValue ? { defaultValue: options.defaultValue } : {}),
      };
    case 'DateTime':
      return {
        dateFormat: options.dateFormat || 'YYYY-MM-DD',
        ...(options.includeTime
          ? {
              includeTime: true,
              timeFormat: options.timeFormat || 'HH:mm',
            }
          : {}),
      };
    case 'Checkbox':
      return {
        icon: options.checkboxIcon || 'check',
      };
    case 'Attachment':
    case 'Text':
    case 'URL':
    case 'Email':
    case 'Phone':
      return {};
    case 'SingleText':
      return options.defaultValue ? { defaultValue: options.defaultValue } : {};
    default:
      return {};
  }
}
