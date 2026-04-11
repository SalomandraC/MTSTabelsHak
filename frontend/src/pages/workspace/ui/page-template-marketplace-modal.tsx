import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';

import { ScrollArea } from '../../../shared/ui';
import type { PageTemplateSummary } from '../../../shared/api/wikilive';

type PageTemplateMarketplaceModalProps = {
  isOpen: boolean;
  templates: PageTemplateSummary[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    templateId: string;
    title?: string;
    values: Record<string, string>;
  }) => Promise<void>;
};

export function PageTemplateMarketplaceModal({
  isOpen,
  templates,
  isSubmitting,
  onClose,
  onSubmit,
}: PageTemplateMarketplaceModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});

  const filteredTemplates = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();

    if (!normalized) {
      return templates;
    }

    return templates.filter((template) => {
      const haystack = [template.title, template.summary, template.category, template.audience]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [searchQuery, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? filteredTemplates[0] ?? null,
    [filteredTemplates, selectedTemplateId, templates],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextTemplate = filteredTemplates[0] ?? null;

    if (!selectedTemplateId && nextTemplate) {
      setSelectedTemplateId(nextTemplate.id);
    }
  }, [filteredTemplates, isOpen, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setValues({});
      setTitle('');
      return;
    }

    setValues(
      Object.fromEntries(
        selectedTemplate.fields.map((field) => [field.key, field.defaultValue ?? '']),
      ),
    );
    setTitle('');
  }, [selectedTemplate]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex h-[min(44rem,calc(100vh-2rem))] w-[min(68rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-editor-border-subtle bg-white shadow-[0_28px_90px_rgba(17,25,40,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-label="Маркетплейс шаблонов"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="flex w-[22rem] shrink-0 flex-col border-r border-editor-border-subtle bg-[#fcfcfd]">
          <div className="border-b border-editor-border-subtle p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">Шаблоны</p>
                <h2 className="mt-2 font-wide text-xl font-semibold text-[#1f1f1f]">Маркетплейс страниц</h2>
                <p className="mt-2 text-sm text-editor-text-tertiary">Выберите основу документа и заполните параметры.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8d8d8d] hover:bg-[#f2f3f5] hover:text-[#1f1f1f]"
                aria-label="Закрыть"
              >
                <X size={17} strokeWidth={2.2} />
              </button>
            </div>
            <label className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-editor-border-subtle bg-white px-3">
              <Search size={16} className="text-editor-text-tertiary" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск по шаблонам"
                className="w-full border-0 bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <ScrollArea className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-2">
              {filteredTemplates.map((template) => {
                const isSelected = template.id === selectedTemplate?.id;

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={[
                      'w-full rounded-2xl border p-4 text-left transition-colors',
                      isSelected
                        ? 'border-[#ffd2d9] bg-[#fff7f8] shadow-sm'
                        : 'border-editor-border-subtle bg-white hover:bg-[#fafbfd]',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff1f3] text-[#d70032]">
                        <Sparkles size={16} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#f2f3f5] px-2 py-1 text-[11px] font-semibold text-[#676d76]">
                            {template.category}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-[#1f1f1f]">{template.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-editor-text-tertiary">{template.summary}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredTemplates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-white px-4 py-6 text-sm text-editor-text-tertiary">
                  По текущему поиску шаблонов не найдено.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {selectedTemplate ? (
            <>
              <div className="border-b border-editor-border-subtle p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#f2f3f5] px-2 py-1 text-[11px] font-semibold text-[#676d76]">
                        {selectedTemplate.category}
                      </span>
                      <span className="rounded-full bg-[#eef3ff] px-2 py-1 text-[11px] font-semibold text-[#2f4d86]">
                        {selectedTemplate.audience}
                      </span>
                    </div>
                    <h3 className="mt-3 font-wide text-2xl font-semibold text-[#1f1f1f]">{selectedTemplate.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm text-editor-text-tertiary">{selectedTemplate.summary}</p>
                  </div>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#1f1f1f]">Название создаваемой страницы</label>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Можно оставить пустым, тогда заголовок соберется из параметров"
                      className="h-11 w-full rounded-xl border border-editor-border-subtle bg-white px-3 text-sm outline-none focus:border-[#5586ff]"
                    />
                  </div>

                  <div className="grid gap-4">
                    {selectedTemplate.fields.map((field) => (
                      <label key={field.key} className="block">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#1f1f1f]">{field.label}</span>
                          {field.required ? (
                            <span className="rounded-full bg-[#fff1f3] px-2 py-0.5 text-[11px] font-semibold text-[#d70032]">
                              Обязательно
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-editor-text-tertiary">{field.description}</p>
                        {field.kind === 'multiline' ? (
                          <textarea
                            value={values[field.key] ?? ''}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            rows={5}
                            className="mt-2 w-full rounded-xl border border-editor-border-subtle bg-white px-3 py-3 text-sm outline-none focus:border-[#5586ff]"
                          />
                        ) : (
                          <input
                            value={values[field.key] ?? ''}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="mt-2 h-11 w-full rounded-xl border border-editor-border-subtle bg-white px-3 text-sm outline-none focus:border-[#5586ff]"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </ScrollArea>

              <div className="flex items-center justify-end gap-3 border-t border-editor-border-subtle px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border border-editor-border-subtle bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f2f3f5] disabled:opacity-60"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void onSubmit({ templateId: selectedTemplate.id, title, values })}
                  disabled={isSubmitting}
                  className="rounded-xl bg-[#d70032] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-60"
                >
                  {isSubmitting ? 'Создаем страницу...' : 'Создать страницу из шаблона'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-editor-text-tertiary">
              Выберите шаблон слева.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
