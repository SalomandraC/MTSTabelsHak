import { Filter, PlusCircle, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import type { MwsField } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';
import { getMwsFieldTypeLabel } from '../model/mws-field-types';
import type { FilterOperator, FilterRule } from '../model/use-wiki-table-embed';

type FilterRecordsModalProps = {
  isOpen: boolean;
  fields: MwsField[];
  filterRules: FilterRule[];
  onChangeFilterRules: (rules: FilterRule[]) => void;
  onClose: () => void;
};

function createFilterRule(seed: number, fieldId: string): FilterRule {
  return {
    id: `filter-rule-${seed}-${Date.now()}`,
    fieldId,
    operator: 'equals',
    value: ''
  };
}

function createEmptyFilterRule(fields: MwsField[], seed: number): FilterRule {
  return createFilterRule(seed, fields[0]?.id ?? '');
}

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'equals', label: 'Равно' },
  { value: 'notEquals', label: 'Не равно' },
  { value: 'contains', label: 'Содержит' },
  { value: 'notContains', label: 'Не содержит' },
  { value: 'empty', label: 'Пусто' },
  { value: 'notEmpty', label: 'Не пусто' },
  { value: 'duplicates', label: 'Дубликаты' }
];

export function FilterRecordsModal({
  isOpen,
  fields,
  filterRules,
  onChangeFilterRules,
  onClose
}: FilterRecordsModalProps) {
  const modalId = useId();
  const [draftRules, setDraftRules] = useState<FilterRule[]>(filterRules);

  useEffect(() => {
    if (isOpen) {
      setDraftRules(
        filterRules.length > 0
          ? filterRules
          : fields.length > 0
            ? [createEmptyFilterRule(fields, 1)]
            : []
      );
    }
  }, [fields, isOpen, filterRules]);

  const selectedFieldIds = new Set(
    draftRules.map((rule) => rule.fieldId).filter(Boolean)
  );

  if (!isOpen) {
    return null;
  }

  const operatorsByLabel = Object.fromEntries(
    OPERATORS.map((op) => [op.value, op.label] as const) as Array<
      readonly [FilterOperator, string]
    >
  ) as Record<FilterOperator, string>;

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#e8edf5] bg-white shadow-[0_24px_70px_rgba(17,25,40,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h3
            id={modalId}
            className="font-wide text-xl font-semibold flex items-center gap-2"
          >
            <Filter className="h-5 w-5" />
            Фильтры по данным
          </h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Создавайте правила фильтрации. Применяются все включённые правила
            одновременно (И логика).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="grid gap-3">
            {draftRules.map((rule, index) => {
              const availableFields = fields.filter(
                (field) =>
                  field.id === rule.fieldId || !selectedFieldIds.has(field.id)
              );
              const operatorLabel =
                operatorsByLabel[rule.operator] ?? rule.operator;

              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-[#eef2f7] bg-[#fafbfc] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-editor-text-tertiary">
                      Условие {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftRules((current) =>
                          current.filter((item) => item.id !== rule.id)
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#b00025] hover:bg-[#fff1f3]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr]">
                    <label className="grid gap-1 text-sm font-semibold">
                      Поле
                      <select
                        value={rule.fieldId}
                        onChange={(event) =>
                          setDraftRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? { ...item, fieldId: event.target.value }
                                : item
                            )
                          )
                        }
                        className="h-10 rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                      >
                        {availableFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name} · {getMwsFieldTypeLabel(field.type)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm font-semibold">
                      Оператор
                      <select
                        value={rule.operator}
                        onChange={(event) =>
                          setDraftRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? {
                                    ...item,
                                    operator: event.target
                                      .value as FilterOperator
                                  }
                                : item
                            )
                          )
                        }
                        className="h-10 rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {!['empty', 'notEmpty', 'duplicates'].includes(
                      rule.operator
                    ) ? (
                      <label className="grid gap-1 text-sm font-semibold">
                        Значение
                        <input
                          type="text"
                          value={rule.value}
                          onChange={(event) =>
                            setDraftRules((current) =>
                              current.map((item) =>
                                item.id === rule.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Введите значение"
                          className="h-10 rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-editor-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <ModalActionButton
              onClick={() =>
                setDraftRules((current) => [
                  ...current,
                  createFilterRule(
                    current.length + 1,
                    fields.find(
                      (field) =>
                        !current.some((item) => item.fieldId === field.id)
                    )?.id ??
                      fields[0]?.id ??
                      ''
                  )
                ])
              }
              variant="secondary"
              disabled={fields.length === 0}
            >
              <PlusCircle className="h-4 w-4" />
              Добавить условие
            </ModalActionButton>
            <ModalActionButton
              onClick={() => setDraftRules([])}
              variant="secondary"
            >
              Сбросить
            </ModalActionButton>
          </div>
          <div className="flex items-center gap-2">
            <ModalActionButton onClick={onClose} variant="secondary">
              Отмена
            </ModalActionButton>
            <ModalActionButton
              onClick={() => {
                onChangeFilterRules(draftRules.filter((rule) => rule.fieldId));
                onClose();
              }}
              variant="primary"
            >
              Применить
            </ModalActionButton>
          </div>
        </div>
      </section>
    </div>
  );
}
