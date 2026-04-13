import { useEffect, useState } from 'react';

import { type PageSummary, wikiliveApi } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';

type PagePickerModalProps = {
  isOpen: boolean;
  spaceId: string;
  currentPageId?: string | null;
  onSelect: (page: PageSummary) => void;
  onClose: () => void;
};

export function PagePickerModal({ isOpen, spaceId, currentPageId, onSelect, onClose }: PagePickerModalProps) {
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');

    const timeoutId = window.setTimeout(() => {
      void wikiliveApi
        .listPages(spaceId, query)
        .then((response) => {
          if (!cancelled) {
            setPages(response.items.filter((page) => page.id !== currentPageId));
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить страницы');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentPageId, isOpen, query, spaceId]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
      <div
        className="fixed left-1/2 top-1/2 flex w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Вставить ссылку на страницу"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="font-wide text-xl font-semibold">Связать страницу</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">Выберите страницу, чтобы создать backlink.</p>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded-xl border border-editor-border-control px-4 text-sm outline-none focus:border-[#7b67ee]"
          placeholder="Поиск по названию или содержанию"
          autoFocus
        />

        <div className="max-h-72 overflow-y-auto rounded-xl border border-editor-border-subtle">
          {isLoading ? <p className="p-4 text-sm text-editor-text-tertiary">Ищем страницы...</p> : null}
          {!isLoading && errorMessage ? <p className="p-4 text-sm text-[#b00025]">{errorMessage}</p> : null}
          {!isLoading && !errorMessage && pages.length === 0 ? (
            <p className="p-4 text-sm text-editor-text-tertiary">Подходящих страниц нет</p>
          ) : null}
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelect(page)}
              className="block w-full border-b border-editor-border-subtle px-4 py-3 text-left text-sm last:border-b-0 hover:bg-editor-bg-control"
            >
              <span className="font-semibold">{page.title}</span>
              {page.excerpt ? <span className="mt-1 block truncate text-xs text-editor-text-tertiary">{page.excerpt}</span> : null}
            </button>
          ))}
        </div>

        <ModalActionButton onClick={onClose} variant="secondary">
          Отмена
        </ModalActionButton>
      </div>
    </div>
  );
}
