import { useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Search, Sparkles, Trash2, X } from 'lucide-react';

import { ScrollArea } from '../../../shared/ui';
import type { PageTemplateSummary, TemplateCategorySummary, TemplateListQuery, TemplateListScope, TemplateListSort } from '../../../shared/api/wikilive';

function getAccessBadge(template: PageTemplateSummary) {
  if (template.source === 'builtIn') {
    return 'Демо';
  }

  switch (template.accessLevel) {
    case 'private':
      return 'Только мне';
    case 'space':
      return 'В пространстве';
    case 'public':
      return 'Всем';
    default:
      return 'Шаблон';
  }
}

type PageTemplateMarketplaceModalProps = {
  isOpen: boolean;
  templates: PageTemplateSummary[];
  categories: TemplateCategorySummary[];
  query: TemplateListQuery;
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
  isListLoading: boolean;
  isSubmitting: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onQueryChange: (overrides: Partial<TemplateListQuery>) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onSubmit: (payload: {
    templateId: string;
    title?: string;
    values: Record<string, string>;
  }) => Promise<void>;
  onEditTemplate: (template: PageTemplateSummary) => void;
  onDeleteTemplate: (template: PageTemplateSummary) => Promise<void>;
};

export function PageTemplateMarketplaceModal({
  isOpen,
  templates,
  categories,
  query,
  pageInfo,
  isListLoading,
  isSubmitting,
  isDeleting,
  onClose,
  onQueryChange,
  onNextPage,
  onPrevPage,
  onSubmit,
  onEditTemplate,
  onDeleteTemplate,
}: PageTemplateMarketplaceModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TemplateListScope>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [sortBy, setSortBy] = useState<TemplateListSort>('relevance');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const initializedTemplateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchQuery(query.search ?? '');
    setActiveTab(query.scope ?? 'all');
    setCategoryFilter(query.categoryId ?? 'all');
    setSortBy(query.sort ?? 'relevance');
  }, [isOpen, query.categoryId, query.scope, query.search, query.sort]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (searchQuery === (query.search ?? '')) {
      return;
    }

    const timer = window.setTimeout(() => {
      onQueryChange({ search: searchQuery });
    }, 260);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, onQueryChange, searchQuery]);

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const selected = templates.find((template) => template.id === selectedTemplateId);
      if (selected) {
        return selected;
      }
    }

    return templates[0] ?? null;
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextTemplate = selectedTemplate ?? null;

    if ((!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) && nextTemplate) {
      setSelectedTemplateId(nextTemplate.id);
    }
  }, [isOpen, selectedTemplate, selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setValues({});
      setTitle('');
      initializedTemplateIdRef.current = null;
      return;
    }

    if (initializedTemplateIdRef.current === selectedTemplate.id) {
      return;
    }

    initializedTemplateIdRef.current = selectedTemplate.id;

    setValues(
      Object.fromEntries(
        selectedTemplate.fields.map((field) => [field.key, field.defaultValue ?? '']),
      ),
    );
    setTitle('');
  }, [selectedTemplate]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    initializedTemplateIdRef.current = null;
    setSelectedTemplateId(null);
    setTitle('');
    setValues({});
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
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
            <div className="mt-3 flex rounded-xl bg-[#f1f2f4] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all');
                  onQueryChange({ scope: 'all' });
                }}
                className={[
                  'h-8 flex-1 rounded-[10px] text-xs font-semibold transition-colors',
                  activeTab === 'all' ? 'bg-white text-[#1f1f1f] shadow-sm' : 'text-[#757575] hover:text-[#303030]',
                ].join(' ')}
              >
                Все шаблоны
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('mine');
                  onQueryChange({ scope: 'mine' });
                }}
                className={[
                  'h-8 flex-1 rounded-[10px] text-xs font-semibold transition-colors',
                  activeTab === 'mine' ? 'bg-white text-[#1f1f1f] shadow-sm' : 'text-[#757575] hover:text-[#303030]',
                ].join(' ')}
              >
                Мои шаблоны
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('space');
                  onQueryChange({ scope: 'space' });
                }}
                className={[
                  'h-8 flex-1 rounded-[10px] text-xs font-semibold transition-colors',
                  activeTab === 'space' ? 'bg-white text-[#1f1f1f] shadow-sm' : 'text-[#757575] hover:text-[#303030]',
                ].join(' ')}
              >
                В пространстве
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={categoryFilter}
                onChange={(event) => {
                  const nextCategory = event.target.value;
                  setCategoryFilter(nextCategory);
                  onQueryChange({ categoryId: nextCategory === 'all' ? undefined : nextCategory });
                }}
                className="h-9 rounded-xl border border-editor-border-subtle bg-white px-2 text-xs outline-none focus:border-[#5586ff]"
              >
                <option value="all">Все категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(event) => {
                  const nextSort = event.target.value as TemplateListSort;
                  setSortBy(nextSort);
                  onQueryChange({ sort: nextSort });
                }}
                className="h-9 rounded-xl border border-editor-border-subtle bg-white px-2 text-xs outline-none focus:border-[#5586ff]"
              >
                <option value="relevance">По релевантности</option>
                <option value="newest">По новизне</option>
                <option value="popular">По популярности</option>
              </select>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-2">
              {templates.map((template) => {
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
                          <span className="rounded-full bg-[#eef3ff] px-2 py-1 text-[11px] font-semibold text-[#2f4d86]">
                            {getAccessBadge(template)}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-[#1f1f1f]">{template.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-editor-text-tertiary">{template.summary}</p>
                        <p className="mt-1 text-[11px] text-[#7a7f88]">Использований: {template.usageCount}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {isListLoading ? (
                <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-white px-4 py-6 text-sm text-editor-text-tertiary">
                  Загружаем шаблоны...
                </div>
              ) : null}
              {!isListLoading && templates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-white px-4 py-6 text-sm text-editor-text-tertiary">
                  По текущему поиску шаблонов не найдено.
                </div>
              ) : null}
            </div>
          </ScrollArea>
          <div className="border-t border-editor-border-subtle px-4 py-3">
            <div className="flex items-center justify-between text-xs text-editor-text-tertiary">
              <span>
                Стр. {pageInfo.page} • Всего: {pageInfo.total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPrevPage}
                  disabled={pageInfo.page <= 1 || isListLoading}
                  className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 font-semibold text-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Назад
                </button>
                <button
                  type="button"
                  onClick={onNextPage}
                  disabled={!pageInfo.hasNextPage || isListLoading}
                  className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 font-semibold text-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Далее
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {selectedTemplate ? (
            <>
              <div className="relative border-b border-editor-border-subtle p-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-6 top-6 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#8d8d8d] shadow-sm transition-colors hover:bg-[#f2f3f5] hover:text-[#1f1f1f]"
                  aria-label="Закрыть"
                >
                  <X size={17} strokeWidth={2.2} />
                </button>

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
                  {selectedTemplate.canManage ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEditTemplate(selectedTemplate)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-editor-border-subtle bg-white px-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
                      >
                        <Edit3 size={14} strokeWidth={2.1} />
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteTemplate(selectedTemplate)}
                        disabled={isDeleting}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#ffd2d9] bg-[#fff7f8] px-3 text-sm font-semibold text-[#b00025] transition-colors hover:bg-[#fff1f3] disabled:cursor-wait disabled:opacity-60"
                      >
                        <Trash2 size={14} strokeWidth={2.1} />
                        {isDeleting ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </div>
                  ) : null}
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
