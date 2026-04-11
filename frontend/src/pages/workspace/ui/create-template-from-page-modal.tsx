import { useEffect, useState } from 'react';

import { ModalActionButton } from '../../../shared/ui';
import type { TemplateAccessLevel } from '../../../shared/api/wikilive';

type CreateTemplateFromPageModalProps = {
  isOpen: boolean;
  sourcePageTitle: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    summary: string;
    category: string;
    accessLevel: TemplateAccessLevel;
    document: Record<string, unknown>;
  }) => Promise<void>;
  document: Record<string, unknown> | null;
};

const ACCESS_LEVEL_OPTIONS: Array<{ value: TemplateAccessLevel; label: string; description: string }> = [
  { value: 'private', label: 'Только мне', description: 'Будет видно только вам.' },
  { value: 'space', label: 'В пространстве', description: 'Будет видно всем в текущем пространстве.' },
  { value: 'public', label: 'Всем', description: 'Будет доступно всем пользователям.' },
];

export function CreateTemplateFromPageModal({
  isOpen,
  sourcePageTitle,
  isSubmitting,
  onClose,
  onSubmit,
  document,
}: CreateTemplateFromPageModalProps) {
  const [title, setTitle] = useState(sourcePageTitle);
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('Мои шаблоны');
  const [accessLevel, setAccessLevel] = useState<TemplateAccessLevel>('private');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle(sourcePageTitle);
    setSummary('');
    setCategory('Мои шаблоны');
    setAccessLevel('private');
  }, [isOpen, sourcePageTitle]);

  if (!isOpen) {
    return null;
  }

  const canSubmit = Boolean(title.trim() && document);

  return (
    <div className="fixed inset-0 z-[95] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-editor-border-subtle bg-white shadow-[0_28px_90px_rgba(17,25,40,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-label="Создать шаблон из страницы"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-editor-border-subtle px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">Шаблон из страницы</p>
          <h3 className="mt-2 font-wide text-xl font-semibold text-[#1f1f1f]">Сохранить страницу в маркетплейс</h3>
          <p className="mt-2 text-sm text-editor-text-tertiary">
            Текущий документ будет сохранён как шаблон и появится в каталоге.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="grid gap-1 text-sm font-semibold text-[#1f1f1f]">
            Название шаблона
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-xl border border-editor-border-subtle px-3 text-sm font-normal outline-none focus:border-[#5586ff]"
              placeholder={sourcePageTitle}
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-[#1f1f1f]">
            Описание
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={4}
              className="rounded-xl border border-editor-border-subtle px-3 py-3 text-sm font-normal outline-none focus:border-[#5586ff]"
              placeholder="Коротко опишите, для чего нужен этот шаблон"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-[#1f1f1f]">
            Категория
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 rounded-xl border border-editor-border-subtle px-3 text-sm font-normal outline-none focus:border-[#5586ff]"
              placeholder="Например: Документы"
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-[#1f1f1f]">
            Уровень доступа
            <select
              value={accessLevel}
              onChange={(event) => setAccessLevel(event.target.value as TemplateAccessLevel)}
              className="h-11 rounded-xl border border-editor-border-subtle px-3 text-sm font-normal outline-none focus:border-[#5586ff]"
            >
              {ACCESS_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-editor-text-tertiary">
              {ACCESS_LEVEL_OPTIONS.find((option) => option.value === accessLevel)?.description}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-editor-border-subtle px-5 py-4">
          <ModalActionButton onClick={onClose} variant="secondary">
            Отмена
          </ModalActionButton>
          <ModalActionButton
            onClick={() =>
              void onSubmit({
                title: title.trim(),
                summary: summary.trim(),
                category: category.trim(),
                accessLevel,
                document: document ?? {},
              })
            }
            disabled={!canSubmit || isSubmitting}
            variant="primary"
          >
            {isSubmitting ? 'Сохраняем...' : 'Сохранить шаблон'}
          </ModalActionButton>
        </div>
      </section>
    </div>
  );
}
