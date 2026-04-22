import { useEffect, useState } from 'react';
import { BrainCircuit, Boxes, Check, Crown, GitBranch, MessageSquareQuote, ShieldCheck, Star, X } from 'lucide-react';
import type { PluginCatalogItem, PluginPlan } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';
import type { AiAssistantFeatureSlot } from '../model/plugins-context';

type PluginsModalProps = {
  isOpen: boolean;
  items: PluginCatalogItem[];
  plan: PluginPlan | null;
  isLoading: boolean;
  errorMessage: string;
  pendingPluginId: string | null;
  aiAssistantFeatures: Record<AiAssistantFeatureSlot, boolean>;
  onClose: () => void;
  onTogglePlugin: (pluginId: string, enabled: boolean) => void;
  onToggleSettings: (pluginId: string, settings: Record<string, boolean>) => void;
  onToggleAiAssistantFeature: (slot: AiAssistantFeatureSlot, enabled: boolean) => void;
};

const AI_ASSISTANT_FEATURE_LABELS: Array<{ slot: AiAssistantFeatureSlot; label: string }> = [
  { slot: 'ghost_text', label: 'Подсказки при наборе (ghost)' },
  { slot: 'inline_chat', label: 'Inline chat' },
  { slot: 'text_transform', label: 'Сократить и улучшить' },
  { slot: 'document_structure', label: 'Автоструктурирование документа' },
];

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

type CanvasSettingsCheckboxesProps = {
  pluginId: string;
  settings: Record<string, boolean>;
  isPending: boolean;
  onToggle: (key: string) => void;
};

function CanvasSettingsCheckboxes({ settings, isPending, onToggle }: CanvasSettingsCheckboxesProps) {
  const options = [
    { key: 'toolbar', label: 'Основной тулбар' },
    { key: 'floating-toolbar', label: 'Плавающее меню' },
    { key: 'slash-menu', label: 'Slash-меню' },
  ];

  return (
    <div className="mt-3 rounded-xl border border-editor-border-subtle bg-white/60 px-3 py-2.5">
      <p className="text-xs font-medium text-editor-text-secondary">Отображение кнопок:</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {options.map((opt) => (
          <label
            key={opt.key}
            className="flex cursor-pointer items-center gap-2 text-sm text-editor-text-primary"
          >
            <span
              role="checkbox"
              tabIndex={0}
              aria-checked={settings[opt.key]}
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                settings[opt.key]
                  ? 'border-[#d81f44] bg-[#d81f44] text-white'
                  : 'border-editor-border-control bg-white',
                isPending ? 'opacity-50' : '',
              ].join(' ')}
              onClick={() => onToggle(opt.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(opt.key); }}
            >
              {settings[opt.key] ? <Check size={14} strokeWidth={3} /> : null}
            </span>
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function PluginsModal({
  isOpen,
  items,
  plan,
  isLoading,
  errorMessage,
  pendingPluginId,
  aiAssistantFeatures,
  onClose,
  onTogglePlugin,
  onToggleSettings,
  onToggleAiAssistantFeature,
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
      className="fixed inset-0 z-[101] flex items-center justify-center bg-[rgba(17,24,39,0.38)] p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Каталог плагинов"
        className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_rgba(17,24,39,0.26)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-[#b00025] bg-[#d70032] px-4 py-5 text-white sm:px-6">
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
          <div className="flex-shrink-0 border-b border-[#ffd2d9] bg-[#fff7f8] px-4 py-3 text-sm text-[#b00025] sm:px-6">{errorMessage}</div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-0 overflow-y-auto bg-[#f6f7f9] px-4 py-4 pb-5 sm:px-6">
            {isLoading ? <p className="text-sm text-editor-text-tertiary">Загружаем каталог плагинов...</p> : null}
            {!isLoading && items.length === 0 ? <p className="text-sm text-editor-text-tertiary">Плагины пока не найдены.</p> : null}
            <div className="space-y-3 pb-4">
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

                        {/* Canvas-draw sub-feature checkboxes */}
                        {item.id === 'canvas-draw' && item.enabled && item.settings ? (
                          <CanvasSettingsCheckboxes
                            pluginId={item.id}
                            settings={item.settings}
                            isPending={isPending}
                            onToggle={(key) => {
                              const next = { ...item.settings, [key]: !item.settings?.[key] };
                              onToggleSettings(item.id, next);
                            }}
                          />
                        ) : null}

                        {/* iframe-embed sub-feature checkboxes */}
                        {item.id === 'iframe-embed' && item.enabled && item.settings ? (
                          <CanvasSettingsCheckboxes
                            pluginId={item.id}
                            settings={item.settings}
                            isPending={isPending}
                            onToggle={(key) => {
                              const next = { ...item.settings, [key]: !item.settings?.[key] };
                              onToggleSettings(item.id, next);
                            }}
                          />
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span
                            className={[
                              'rounded-lg px-2.5 py-1 text-[11px] font-semibold',
                              item.enabled
                                ? 'border border-transparent bg-[#d70032] text-white'
                                : 'border border-[#f0d6da] bg-[#fff7f8] text-[#b00025]',
                            ].join(' ')}
                          >
                            {getCategoryLabel(item.category)}
                          </span>
                          {item.placement.map((placement) => (
                            <span key={placement} className="rounded-full border border-[#f0d6da] bg-[#fff7f8] px-2.5 py-1 text-[#b00025]">
                              {placement}
                            </span>
                          ))}
                        </div>
                        {item.requiredPlans.length > 0 ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#ffd4da] bg-[#fff1f3] px-2.5 py-1 text-[11px] font-semibold text-[#d70032]">
                            <Crown size={12} strokeWidth={2.1} />
                            {item.requiredPlans.map((planId) => planId === 'pro' ? 'Командный' : planId === 'enterprise' ? 'Enterprise' : 'Базовый').join(' / ')}
                          </div>
                        ) : null}
                        {item.lockedReason ? (
                          <p className="mt-3 text-xs leading-5 text-editor-text-tertiary">{item.lockedReason}</p>
                        ) : null}

                        {item.id === 'ai-assistant' ? (
                          <div className="mt-4 rounded-xl border border-editor-border-subtle bg-white/75 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">
                              Функции модуля
                            </p>
                            <div className="mt-2 grid gap-2">
                              {AI_ASSISTANT_FEATURE_LABELS.map((feature) => {
                                const enabled = aiAssistantFeatures[feature.slot];
                                const disabled = !item.enabled || !item.canToggle || isPending;

                                return (
                                  <button
                                    key={feature.slot}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => onToggleAiAssistantFeature(feature.slot, !enabled)}
                                    className={[
                                      'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                                      enabled
                                        ? 'border-[#d6f1e5] bg-[#edf9f2] text-[#1f8056]'
                                        : 'border-editor-border-subtle bg-white text-editor-text-secondary',
                                      disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-editor-bg-control',
                                    ].join(' ')}
                                  >
                                    <span
                                      className={[
                                        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold leading-none',
                                        enabled
                                          ? 'border-[#1f8056] bg-[#1f8056] text-white'
                                          : 'border-editor-border-control bg-white text-transparent',
                                      ].join(' ')}
                                    >
                                      ✓
                                    </span>
                                    <span className="min-w-0 whitespace-normal break-words">{feature.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {!item.enabled ? (
                              <p className="mt-2 text-[11px] text-editor-text-tertiary">Сначала подключите модуль ИИ, затем включайте нужные функции.</p>
                            ) : null}
                          </div>
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
          </aside>
        </div>
      </div>
    </div>
  );
}
