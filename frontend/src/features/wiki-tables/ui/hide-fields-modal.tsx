import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { MwsField } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';

type HideFieldsModalProps = {
  isOpen: boolean;
  fields: MwsField[];
  hiddenFieldIds: string[];
  onChangeHiddenFieldIds: (fieldIds: string[]) => void;
  onClose: () => void;
};

function getFieldTypeLabel(type: string) {
  const labels: Record<string, string> = {
    SingleText: 'Короткий текст',
    Text: 'Длинный текст',
    SingleSelect: 'Одиночный выбор',
    MultiSelect: 'Множественный выбор',
    Number: 'Число',
    Currency: 'Валюта',
    Percent: 'Процент',
    DateTime: 'Дата и время',
    Attachment: 'Вложения',
    Checkbox: 'Чекбокс',
    URL: 'Ссылка',
    Email: 'Email',
    Phone: 'Телефон',
  };

  return labels[type] ?? type;
}

export function HideFieldsModal({
  isOpen,
  fields,
  hiddenFieldIds,
  onChangeHiddenFieldIds,
  onClose,
}: HideFieldsModalProps) {
  const [query, setQuery] = useState('');

  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return fields;
    }

    return fields.filter((field) => `${field.name} ${field.type}`.toLowerCase().includes(normalized));
  }, [fields, query]);

  if (!isOpen) {
    return null;
  }

  const hiddenSet = new Set(hiddenFieldIds);

  return (
    <div className="fixed inset-0 z-[95] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-editor-border-subtle bg-white shadow-[0_24px_70px_rgba(17,25,40,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-label="Персональное скрытие полей"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h3 className="font-wide text-xl font-semibold">Персональное скрытие полей</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">Поля будут скрыты только для вас. Другие пользователи по-прежнему смогут их видеть.</p>
        </div>

        <div className="flex items-center gap-2 border-b border-editor-border-subtle px-5 py-3">
          <Search className="h-4 w-4 text-editor-text-tertiary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
            className="h-8 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="grid gap-1.5">
            {filteredFields.map((field) => {
              const isVisible = !hiddenSet.has(field.id);

              return (
                <label key={field.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-editor-bg-control">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-editor-text-primary">{field.name}</p>
                    <p className="truncate text-xs text-editor-text-tertiary">{getFieldTypeLabel(field.type)}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(event) => {
                      const nextHidden = event.target.checked
                        ? hiddenFieldIds.filter((fieldId) => fieldId !== field.id)
                        : [...hiddenFieldIds, field.id];
                      onChangeHiddenFieldIds(nextHidden);
                    }}
                    className="h-4 w-4 rounded border-editor-border-control text-[#7b67ee]"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-editor-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <ModalActionButton onClick={() => onChangeHiddenFieldIds(fields.map((field) => field.id))} variant="secondary">
              Скрыть все
            </ModalActionButton>
            <ModalActionButton onClick={() => onChangeHiddenFieldIds([])} variant="secondary">
              Показать все
            </ModalActionButton>
          </div>
          <ModalActionButton onClick={onClose} variant="primary">
            Готово
          </ModalActionButton>
        </div>
      </section>
    </div>
  );
}
