import { ArrowUpDown, PlusCircle, Search, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { MwsField } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';
import { getMwsFieldTypeLabel } from '../model/mws-field-types';
import type { SortRule } from '../model/use-wiki-table-embed';

type SortFieldsModalProps = {
  isOpen: boolean;
  fields: MwsField[];
  sortRules: SortRule[];
  onChangeSortRules: (rules: SortRule[]) => void;
  onClose: () => void;
};

type SortRuleDraft = SortRule;

function createSortRule(seed: number, fieldId: string): SortRuleDraft {
  return {
    id: `sort-rule-${seed}-${Date.now()}`,
    fieldId,
    desc: false
  };
}

function createEmptySortRule(fields: MwsField[], seed: number): SortRuleDraft {
  return createSortRule(seed, fields[0]?.id ?? '');
}

export function SortFieldsModal({
  isOpen,
  fields,
  sortRules,
  onChangeSortRules,
  onClose
}: SortFieldsModalProps) {
  const modalId = useId();
  const [query, setQuery] = useState('');
  const [draftRules, setDraftRules] = useState<SortRuleDraft[]>(sortRules);
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const wasJustOpened = !prevIsOpenRef.current && isOpen;
    prevIsOpenRef.current = isOpen;

    if (wasJustOpened) {
      setDraftRules(
        sortRules.length > 0
          ? sortRules
          : fields.length > 0
            ? [createEmptySortRule(fields, 1)]
            : []
      );
      setQuery('');
    }
  }, [isOpen, sortRules, fields]);

  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return fields;
    }

    return fields.filter((field) =>
      `${field.name} ${field.type}`.toLowerCase().includes(normalized)
    );
  }, [fields, query]);

  if (!isOpen) {
    return null;
  }

  const selectedFieldIds = new Set(
    draftRules.map((rule) => rule.fieldId).filter(Boolean)
  );

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#e8edf5] bg-white shadow-[0_24px_70px_rgba(17,25,40,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h3 id={modalId} className="font-wide text-xl font-semibold">
            Сортировка
          </h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Выберите поля и направление сортировки. Правила применяются сверху
            вниз: следующее поле используется как следующий приоритет.
          </p>
        </div>

        <div className="flex items-center gap-2 px-5 py-3">
          <Search className="h-4 w-4 text-editor-text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск поля"
            className="h-8 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="grid gap-3">
            {draftRules.map((rule, index) => {
              const availableFields = filteredFields.filter(
                (field) =>
                  field.id === rule.fieldId || !selectedFieldIds.has(field.id)
              );

              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-[#eef2f7] bg-[#fafbfc] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-editor-text-tertiary">
                      Правило {index + 1}
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

                  <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
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
                      Направление
                      <select
                        value={rule.desc ? 'desc' : 'asc'}
                        onChange={(event) =>
                          setDraftRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? {
                                    ...item,
                                    desc: event.target.value === 'desc'
                                  }
                                : item
                            )
                          )
                        }
                        className="h-10 rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                      >
                        <option value="asc">По возрастанию</option>
                        <option value="desc">По убыванию</option>
                      </select>
                    </label>
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
                  createSortRule(
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
              Добавить поле
            </ModalActionButton>
            <ModalActionButton
              onClick={() => setDraftRules([])}
              variant="secondary"
            >
              <ArrowUpDown className="h-4 w-4" />
              Сбросить
            </ModalActionButton>
          </div>
          <div className="flex items-center gap-2">
            <ModalActionButton onClick={onClose} variant="secondary">
              Отмена
            </ModalActionButton>
            <ModalActionButton
              onClick={() => {
                onChangeSortRules(draftRules.filter((rule) => rule.fieldId));
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
