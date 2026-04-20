import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ModalActionButton } from '../../../shared/ui';
import {
  createFieldProperty,
  getMwsFieldTypeIcon,
  MWS_FIELD_TYPE_OPTIONS,
  type SelectOptionDraft,
  SELECT_OPTION_COLORS,
  type SupportedMwsFieldType
} from '../model/mws-field-types';

type CreateFieldModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    type: SupportedMwsFieldType;
    property?: Record<string, unknown>;
  }) => void;
};

function createEmptyOption(seed: number): SelectOptionDraft {
  return {
    id: `option-${seed}`,
    name: '',
    color: SELECT_OPTION_COLORS[seed % SELECT_OPTION_COLORS.length] ?? 'blue'
  };
}

export function CreateFieldModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit
}: CreateFieldModalProps) {
  const modalId = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<SupportedMwsFieldType>('SingleText');
  const [defaultValue, setDefaultValue] = useState('');
  const [precision, setPrecision] = useState(0);
  const [symbol, setSymbol] = useState('₽');
  const [symbolAlign, setSymbolAlign] = useState('Left');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [timeFormat, setTimeFormat] = useState('HH:mm');
  const [includeTime, setIncludeTime] = useState(false);
  const [checkboxIcon, setCheckboxIcon] = useState('check');
  const [selectOptions, setSelectOptions] = useState<SelectOptionDraft[]>([
    createEmptyOption(1),
    createEmptyOption(2)
  ]);

  const resetForm = () => {
    setName('');
    setType('SingleText');
    setDefaultValue('');
    setPrecision(0);
    setSymbol('₽');
    setSymbolAlign('Left');
    setDateFormat('YYYY-MM-DD');
    setTimeFormat('HH:mm');
    setIncludeTime(false);
    setCheckboxIcon('check');
    setSelectOptions([createEmptyOption(1), createEmptyOption(2)]);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    resetForm();
  }, [isOpen]);

  const isSelectType = type === 'SingleSelect' || type === 'MultiSelect';
  const canSubmit =
    name.trim().length > 0 &&
    (!isSelectType ||
      selectOptions.some((option) => option.name.trim().length > 0));

  const property = useMemo(
    () =>
      createFieldProperty(type, {
        selectOptions,
        defaultValue,
        precision,
        symbol,
        symbolAlign,
        dateFormat,
        timeFormat,
        includeTime,
        checkboxIcon
      }),
    [
      checkboxIcon,
      dateFormat,
      defaultValue,
      includeTime,
      precision,
      selectOptions,
      symbol,
      symbolAlign,
      timeFormat,
      type
    ]
  );

  if (!isOpen) {
    return null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[320] bg-black/35 p-3 sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalId}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-editor-border-subtle bg-white shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        onMouseDown={(event) => event.stopPropagation()}
        data-mws-stop-event="true"
      >
        <div className="border-b border-editor-border-subtle px-5 py-4">
          <h3 id={modalId} className="font-wide text-xl font-semibold">
            Добавить столбец
          </h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Только типы и настройки, которые поддерживаются Fusion API.
          </p>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <label className="text-sm font-semibold">
            Название столбца
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
              placeholder="Например, Статус"
            />
          </label>

          <label className="text-sm font-semibold">
            Тип данных
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as SupportedMwsFieldType)
              }
              className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            >
              {MWS_FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {getMwsFieldTypeIcon(option.value)} {option.label}
                </option>
              ))}
            </select>
          </label>

          {type === 'SingleText' ||
          type === 'Number' ||
          type === 'Currency' ||
          type === 'Percent' ? (
            <label className="text-sm font-semibold">
              Значение по умолчанию
              <input
                value={defaultValue}
                onChange={(event) => setDefaultValue(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
              />
            </label>
          ) : null}

          {type === 'Number' || type === 'Currency' || type === 'Percent' ? (
            <label className="text-sm font-semibold">
              Точность
              <input
                type="number"
                min={0}
                max={6}
                value={precision}
                onChange={(event) =>
                  setPrecision(Number(event.target.value) || 0)
                }
                className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
              />
            </label>
          ) : null}

          {type === 'Currency' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Символ
                <input
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                />
              </label>
              <label className="text-sm font-semibold">
                Позиция символа
                <select
                  value={symbolAlign}
                  onChange={(event) => setSymbolAlign(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                >
                  <option value="Left">Left</option>
                  <option value="Right">Right</option>
                </select>
              </label>
            </div>
          ) : null}

          {type === 'DateTime' ? (
            <div className="grid gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={includeTime}
                  onChange={(event) => setIncludeTime(event.target.checked)}
                />
                Включить время
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Формат даты
                  <select
                    value={dateFormat}
                    onChange={(event) => setDateFormat(event.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                  </select>
                </label>
                {includeTime ? (
                  <label className="text-sm font-semibold">
                    Формат времени
                    <select
                      value={timeFormat}
                      onChange={(event) => setTimeFormat(event.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                    >
                      <option value="HH:mm">HH:mm</option>
                      <option value="hh:mm">hh:mm</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}

          {type === 'Checkbox' ? (
            <label className="text-sm font-semibold">
              Иконка checkbox
              <input
                value={checkboxIcon}
                onChange={(event) => setCheckboxIcon(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
              />
            </label>
          ) : null}

          {isSelectType ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Опции</p>
                <button
                  type="button"
                  onClick={() =>
                    setSelectOptions((current) => [
                      ...current,
                      createEmptyOption(current.length + 1)
                    ])
                  }
                  className="rounded-md border border-editor-border-control px-3 py-1.5 text-sm font-semibold text-editor-text-primary"
                >
                  Добавить опцию
                </button>
              </div>
              <div className="grid gap-2">
                {selectOptions.map((option, index) => (
                  <div
                    key={option.id}
                    className="grid gap-2 rounded-lg border border-editor-border-subtle p-3 sm:grid-cols-[1fr_8rem_auto]"
                  >
                    <input
                      value={option.name}
                      onChange={(event) =>
                        setSelectOptions((current) =>
                          current.map((item) =>
                            item.id === option.id
                              ? { ...item, name: event.target.value }
                              : item
                          )
                        )
                      }
                      className="h-10 rounded-lg border border-editor-border-control px-3 text-sm outline-none focus:border-[#7b67ee]"
                      placeholder={`Опция ${index + 1}`}
                    />
                    <select
                      value={option.color}
                      onChange={(event) =>
                        setSelectOptions((current) =>
                          current.map((item) =>
                            item.id === option.id
                              ? { ...item, color: event.target.value }
                              : item
                          )
                        )
                      }
                      className="h-10 rounded-lg border border-editor-border-control px-3 text-sm outline-none focus:border-[#7b67ee]"
                    >
                      {SELECT_OPTION_COLORS.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectOptions((current) =>
                          current.filter((item) => item.id !== option.id)
                        )
                      }
                      className="rounded-lg border border-[#ffd2d9] px-3 text-sm font-semibold text-[#b00025]"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg bg-[#f8fafc] p-3 text-xs text-editor-text-tertiary">
            В отправку уйдет `property`, собранный строго по текущему типу поля:{' '}
            {JSON.stringify(property)}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-editor-border-subtle px-5 py-4">
          <ModalActionButton onClick={onClose} variant="secondary">
            Отмена
          </ModalActionButton>
          <ModalActionButton
            disabled={!canSubmit || isSubmitting}
            variant="primary"
            onClick={() => onSubmit({ name: name.trim(), type, property })}
          >
            {isSubmitting ? 'Создаем...' : 'Создать столбец'}
          </ModalActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
