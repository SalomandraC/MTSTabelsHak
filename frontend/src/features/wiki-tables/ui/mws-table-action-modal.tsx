import type { WorkspaceTreeNode } from '../../../shared/api/wikilive';

export function MwsTableActionModal({
  node,
  isCreating,
  isDeleting,
  onCreatePage,
  onOpenMws,
  onDelete,
  onClose,
}: {
  node: WorkspaceTreeNode | null;
  isCreating: boolean;
  isDeleting: boolean;
  onCreatePage: () => void;
  onOpenMws: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!node) {
    return null;
  }

  const isBusy = isCreating || isDeleting;

  return (
    <div className="fixed inset-0 z-[101] bg-black/30" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-editor-border-subtle bg-white shadow-[0_24px_70px_rgba(17,25,40,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-label="Действия с MWS таблицей"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-editor-border-subtle p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">MWS Tables</p>
            <h3 className="mt-2 truncate font-wide text-xl font-semibold text-[#1f1f1f]">{node.title}</h3>
            <p className="mt-2 text-sm text-editor-text-tertiary">
              Таблица остается живой сущностью MWS. WikiLive может создать рядом страницу с embedded live-таблицей.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8d8d8d] hover:bg-[#f2f3f5] hover:text-[#1f1f1f]"
            aria-label="Закрыть"
          >
            <span aria-hidden="true" className="text-lg leading-none">×</span>
          </button>
        </div>
        <div className="grid gap-3 p-5">
          <button
            type="button"
            onClick={onCreatePage}
            disabled={isBusy}
            className="rounded-xl bg-[#d70032] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-60"
          >
            {isCreating ? 'Создаем страницу...' : 'Создать страницу с таблицей'}
          </button>
          <button
            type="button"
            onClick={onOpenMws}
            className="rounded-xl border border-[#1f1f1f] bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f2f3f5]"
          >
            Перейти на таблицу в tables.mws.ru
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isBusy}
            className="rounded-xl border border-[#ffd2d9] bg-[#fff7f8] px-4 py-3 text-sm font-semibold text-[#b00025] transition-colors hover:border-[#d70032] hover:bg-[#fff1f3] disabled:cursor-wait disabled:opacity-60"
          >
            {isDeleting ? 'Удаляем таблицу...' : 'Удалить таблицу'}
          </button>
        </div>
      </section>
    </div>
  );
}
