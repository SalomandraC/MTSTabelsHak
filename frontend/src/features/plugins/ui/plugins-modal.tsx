import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { PluginCatalogItem, PluginPlan } from '../../../shared/api/wikilive';

type PluginsModalProps = {
  isOpen: boolean;
  items: PluginCatalogItem[];
  plan: PluginPlan | null;
  isLoading: boolean;
  errorMessage: string;
  pendingPluginId: string | null;
  onClose: () => void;
  onTogglePlugin: (pluginId: string, enabled: boolean) => void;
};

function getStatusLabel(item: PluginCatalogItem) {
  switch (item.status) {
    case 'core':
      return 'Core';
    case 'enabled':
      return 'Подключен';
    case 'available':
      return 'Доступен';
    case 'locked':
      return 'По подписке';
    case 'comingSoon':
      return 'Скоро';
    default:
      return '';
  }
}

function getStatusClassName(item: PluginCatalogItem) {
  switch (item.status) {
    case 'core':
      return 'border-[#d9e6ff] bg-[#eef4ff] text-[#3058b7]';
    case 'enabled':
      return 'border-[#d6f1e5] bg-[#edf9f2] text-[#1f8056]';
    case 'available':
      return 'border-editor-border-subtle bg-editor-bg-control text-editor-text-secondary';
    case 'locked':
      return 'border-[#f0dfb3] bg-[#fff8e7] text-[#926b12]';
    case 'comingSoon':
      return 'border-[#eadcf9] bg-[#f7f0ff] text-[#6a4ca7]';
    default:
      return 'border-editor-border-subtle bg-editor-bg-control text-editor-text-secondary';
  }
}

export function PluginsModal({
  isOpen,
  items,
  plan,
  isLoading,
  errorMessage,
  pendingPluginId,
  onClose,
  onTogglePlugin,
}: PluginsModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(17,24,39,0.38)] p-3 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Каталог плагинов"
        className="flex max-h-[min(90vh,48rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-editor-border-subtle bg-white shadow-[0_28px_80px_rgba(17,24,39,0.26)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-editor-border-subtle px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-editor-text-tertiary">Plugins</p>
            <h2 className="mt-1 font-wide text-xl font-semibold text-editor-text-primary">Управление плагинами</h2>
            <p className="mt-2 max-w-2xl text-sm text-editor-text-tertiary">
              {plan ? `${plan.title}: ${plan.description}` : 'Загружаем информацию о подписке и доступных модулях.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть каталог плагинов"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-editor-border-subtle text-editor-text-secondary transition-colors hover:bg-editor-bg-control"
          >
            <X size={18} strokeWidth={2.1} />
          </button>
        </div>

        {errorMessage ? (
          <div className="border-b border-[#ffd2d9] bg-[#fff1f3] px-4 py-3 text-sm text-[#b00025] sm:px-6">{errorMessage}</div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
            {isLoading ? <p className="text-sm text-editor-text-tertiary">Загружаем каталог плагинов...</p> : null}
            {!isLoading && items.length === 0 ? <p className="text-sm text-editor-text-tertiary">Плагины пока не найдены.</p> : null}
            <div className="space-y-3">
              {items.map((item) => {
                const isPending = pendingPluginId === item.id;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-editor-border-subtle bg-white p-4 shadow-sm transition-colors hover:bg-[#fcfcfd]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-editor-text-primary">{item.title}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusClassName(item)}`}>
                            {getStatusLabel(item)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-editor-text-secondary">{item.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-editor-text-tertiary">
                          <span className="rounded-full bg-editor-bg-control px-2.5 py-1">{item.category}</span>
                          {item.placement.map((placement) => (
                            <span key={placement} className="rounded-full bg-editor-bg-control px-2.5 py-1">
                              {placement}
                            </span>
                          ))}
                        </div>
                        {item.lockedReason ? (
                          <p className="mt-3 text-xs text-editor-text-tertiary">{item.lockedReason}</p>
                        ) : null}
                      </div>

                      {item.canToggle ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => onTogglePlugin(item.id, !item.enabled)}
                          className={[
                            'inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors',
                            item.enabled
                              ? 'border border-editor-border-control bg-white text-editor-text-secondary hover:bg-editor-bg-control'
                              : 'bg-[#ff0037] text-white hover:bg-[#db0030]',
                            isPending ? 'cursor-progress opacity-70' : '',
                          ].join(' ')}
                        >
                          {isPending ? 'Сохраняем...' : item.enabled ? 'Отключить' : 'Подключить'}
                        </button>
                      ) : (
                        <div className="text-xs font-semibold text-editor-text-tertiary">
                          {item.kind === 'core' ? 'Всегда включен' : item.status === 'locked' ? 'Недоступен на плане' : 'Недоступен для включения'}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="border-t border-editor-border-subtle bg-[#fafbfc] p-4 lg:border-l lg:border-t-0">
            <h3 className="text-sm font-semibold text-editor-text-primary">Как это работает</h3>
            <p className="mt-2 text-sm leading-6 text-editor-text-tertiary">
              Core-модули обязательны для demo contour и всегда активны. Optional plugins можно включать только если они доступны по текущему плану и уже реализованы в MVP.
            </p>
            <div className="mt-4 space-y-2 text-xs text-editor-text-tertiary">
              <p>Current plan: {plan?.title ?? '...'}</p>
              <p>Enabled: {items.filter((item) => item.enabled).length}</p>
              <p>Locked: {items.filter((item) => item.status === 'locked').length}</p>
              <p>Coming soon: {items.filter((item) => item.status === 'comingSoon').length}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
