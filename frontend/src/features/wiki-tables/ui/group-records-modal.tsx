import { Group, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import type { MwsField } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';
import { getMwsFieldTypeLabel } from '../model/mws-field-types';
import type { GroupRule } from '../model/use-wiki-table-embed';

type GroupRecordsModalProps = {
  isOpen: boolean;
  fields: MwsField[];
  groupRule: GroupRule | null;
  onChangeGroupRule: (rule: GroupRule | null) => void;
  onClose: () => void;
};

export function GroupRecordsModal({
  isOpen,
  fields,
  groupRule,
  onChangeGroupRule,
  onClose
}: GroupRecordsModalProps) {
  const modalId = useId();
  const [draftRule, setDraftRule] = useState<GroupRule | null>(
    groupRule ??
      (fields.length > 0 ? { fieldId: fields[0].id, desc: false } : null)
  );

  useEffect(() => {
    if (isOpen) {
      setDraftRule(
        groupRule ??
          (fields.length > 0 ? { fieldId: fields[0].id, desc: false } : null)
      );
    }
  }, [fields, groupRule, isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#e8edf5] bg-white shadow-[0_24px_70px_rgba(17,25,40,0.18)]"
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
            <Group className="h-5 w-5" />
            Группировка по полю
          </h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Записи будут сгруппированы по выбранному полю, сначала с общим
            количеством в заголовке группы.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {draftRule ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-semibold">
                Выберите поле для группировки
                <select
                  value={draftRule.fieldId}
                  onChange={(event) =>
                    setDraftRule((current) =>
                      current
                        ? { ...current, fieldId: event.target.value }
                        : null
                    )
                  }
                  className="h-10 rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                >
                  {fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name} · {getMwsFieldTypeLabel(field.type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-semibold">
                Порядок групп
                <select
                  value={draftRule.desc ? 'desc' : 'asc'}
                  onChange={(event) =>
                    setDraftRule((current) =>
                      current
                        ? { ...current, desc: event.target.value === 'desc' }
                        : null
                    )
                  }
                  className="h-10 rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                >
                  <option value="asc">По возрастанию</option>
                  <option value="desc">По убыванию</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">
              Нет доступных полей для группировки.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-editor-border-subtle px-5 py-4">
          <ModalActionButton
            onClick={() => setDraftRule(null)}
            variant="secondary"
            disabled={!groupRule}
          >
            <RotateCcw className="h-4 w-4" />
            Отключить группировку
          </ModalActionButton>
          <div className="flex items-center gap-2">
            <ModalActionButton onClick={onClose} variant="secondary">
              Отмена
            </ModalActionButton>
            <ModalActionButton
              onClick={() => {
                onChangeGroupRule(draftRule);
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
