import { useEffect } from 'react';
import { BrainCircuit, Boxes, Crown, GitBranch, MessageSquareQuote, ShieldCheck, Star, X } from 'lucide-react';
import type { PluginCatalogItem, PluginPlan } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';

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

function getCategoryLabel(category: PluginCatalogItem['category']) {
  switch (category) {
    case 'core':
      return 'Базовый модуль';
    case 'insights':
      return 'Навигация и связи';
    case 'assistant':
      return 'AI и автоматизация';
    case 'collaboration':
      return 'Командная работа';
    default:
      return category;
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

function getPluginAccent(item: PluginCatalogItem) {
  switch (item.category) {
    case 'core':
      return {
        border: 'border-[#f1dfb0]',
        surface: 'bg-[#fffaf0]',
        iconWrap: 'bg-[#fff1cc] text-[#9a6c12]',
        icon: Star,
      };
    case 'insights':
      return {
        border: 'border-[#d5e2ff]',
        surface: 'bg-[#f6f9ff]',
        iconWrap: 'bg-[#e7f0ff] text-[#315dc2]',
        icon: GitBranch,
      };
    case 'assistant':
      return {
        border: 'border-[#e4d5fb]',
        surface: 'bg-[#fbf7ff]',
        iconWrap: 'bg-[#f0e5ff] text-[#7a4fc3]',
        icon: BrainCircuit,
      };
    case 'collaboration':
      return {
        border: 'border-[#d1f0df]',
        surface: 'bg-[#f4fcf7]',
        iconWrap: 'bg-[#e6f8ee] text-[#20845c]',
        icon: MessageSquareQuote,
      };
    default:
      return {
        border: 'border-editor-border-subtle',
        surface: 'bg-white',
        iconWrap: 'bg-editor-bg-control text-editor-text-secondary',
        icon: Boxes,
      };
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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,24,39,0.38)] p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Каталог плагинов"
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_rgba(17,24,39,0.26)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-[#b81235] bg-[#d81f44] px-4 py-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
                <ShieldCheck size={12} strokeWidth={2.2} />
                Каталог модулей
              </div>
              <h2 className="mt-3 font-wide text-xl font-semibold sm:text-2xl">Плагины рабочего пространства</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/84">
                {plan ? `${plan.title}: ${plan.description}` : 'Загружаем информацию о подписке и доступных модулях.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть каталог плагинов"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white transition-colors hover:bg-white/18"
            >
              <X size={18} strokeWidth={2.1} />
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="flex-shrink-0 border-b border-[#ffd2d9] bg-[#fff1f3] px-4 py-3 text-sm text-[#b00025] sm:px-6">{errorMessage}</div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-0 overflow-y-auto bg-[#f6f7f9] px-4 py-4 pb-5 sm:px-6">
            {isLoading ? <p className="text-sm text-editor-text-tertiary">Загружаем каталог плагинов...</p> : null}
            {!isLoading && items.length === 0 ? <p className="text-sm text-editor-text-tertiary">Плагины пока не найдены.</p> : null}
            <div className="space-y-3">
              {items.map((item) => {
                const isPending = pendingPluginId === item.id;
                const accent = getPluginAccent(item);
                const Icon = accent.icon;

                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-[20px] border p-4 shadow-[0_10px_24px_rgba(17,24,39,0.05)] transition-colors duration-150 hover:border-[#c9d3e3] ${accent.border} ${accent.surface}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accent.iconWrap} shadow-sm`}>
                            <Icon size={20} strokeWidth={2.1} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-editor-text-primary">{item.title}</h3>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusClassName(item)}`}>
                                {getStatusLabel(item)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-editor-text-primary/85">{item.description}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-editor-border-subtle bg-white px-2.5 py-1 font-semibold text-editor-text-secondary">
                            {getCategoryLabel(item.category)}
                          </span>
                          {item.placement.map((placement) => (
                            <span key={placement} className="rounded-full border border-editor-border-subtle bg-[#f9fafb] px-2.5 py-1 text-editor-text-tertiary">
                              {placement}
                            </span>
                          ))}
                        </div>
                        {item.requiredPlans.length > 0 ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-editor-border-subtle bg-white px-2.5 py-1 text-[11px] font-semibold text-editor-text-secondary">
                            <Crown size={12} strokeWidth={2.1} />
                            {item.requiredPlans.map((planId) => planId === 'pro' ? 'Командный' : planId === 'enterprise' ? 'Enterprise' : 'Базовый').join(' / ')}
                          </div>
                        ) : null}
                        {item.lockedReason ? (
                          <p className="mt-3 text-xs leading-5 text-editor-text-tertiary">{item.lockedReason}</p>
                        ) : null}
                      </div>

                      {item.canToggle ? (
                        <ModalActionButton
                          disabled={isPending}
                          onClick={() => onTogglePlugin(item.id, !item.enabled)}
                          variant={item.enabled ? 'secondary' : 'primary'}
                          className={['shrink-0 min-w-[9rem]', isPending ? 'cursor-progress opacity-70' : ''].join(' ')}
                        >
                          {isPending ? 'Сохраняем...' : item.enabled ? 'Отключить' : 'Подключить'}
                        </ModalActionButton>
                      ) : (
                        <ModalActionButton
                          disabled
                          variant="secondary"
                          className={[
                            'shrink-0 min-w-[9rem]',
                            item.kind === 'core' ? 'border border-editor-border-control opacity-60' : 'opacity-55',
                          ].join(' ')}
                        >
                          {item.kind === 'core' ? 'Всегда активен' : item.status === 'locked' ? 'Откроется после апгрейда' : 'Станет доступен позже'}
                        </ModalActionButton>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-editor-border-subtle bg-white p-4 lg:border-l lg:border-t-0">
            <div className="rounded-[20px] border border-editor-border-subtle bg-[#f8fafc] p-4">
              <h3 className="text-sm font-semibold text-editor-text-primary">Как это работает</h3>
              <p className="mt-2 text-sm leading-6 text-editor-text-tertiary">
                Базовые модули обеспечивают обязательный demo contour и всегда активны. Дополнительные плагины можно включать вручную, если они доступны на вашем тарифе и уже реализованы в MVP.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-1">
              <div className="rounded-[18px] border border-[#f0dfb3] bg-[#fff8e8] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#926b12]">Текущий план</p>
                <p className="mt-2 text-lg font-semibold text-editor-text-primary">{plan?.title ?? '...'}</p>
              </div>
              <div className="rounded-[18px] border border-[#d5e2ff] bg-[#eef4ff] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#315dc2]">Активно</p>
                <p className="mt-2 text-lg font-semibold text-editor-text-primary">{items.filter((item) => item.enabled).length}</p>
              </div>
              <div className="rounded-[18px] border border-[#eadcf9] bg-[#f8f1ff] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7a4fc3]">Скоро</p>
                <p className="mt-2 text-lg font-semibold text-editor-text-primary">{items.filter((item) => item.status === 'comingSoon').length}</p>
              </div>
              <div className="rounded-[18px] border border-[#d1f0df] bg-[#eefaf3] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#20845c]">По подписке</p>
                <p className="mt-2 text-lg font-semibold text-editor-text-primary">{items.filter((item) => item.status === 'locked').length}</p>
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-editor-border-subtle bg-[#fff6f8] p-4">
              <h3 className="text-sm font-semibold text-editor-text-primary">Рекомендация</h3>
              <p className="mt-2 text-sm leading-6 text-editor-text-tertiary">
                Для текущего MVP лучше всего усиливают сценарий WikiLive плагины навигации по знаниям, комментарии и AI-помощник для работы с документами.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
