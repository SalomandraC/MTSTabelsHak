import { Clock3, Loader2, RotateCcw, X } from 'lucide-react';
import type { PageHistoryCheckpoint, PageHistoryItem, PageHistoryTrigger } from '../../../shared/api/wikilive';

type TimeMachinePanelProps = {
  items: PageHistoryItem[];
  selectedCheckpoint: PageHistoryCheckpoint | null;
  selectedCheckpointId: string | null;
  isLoading: boolean;
  isLoadingCheckpoint: boolean;
  isRestoring: boolean;
  errorMessage: string;
  onOpenCheckpoint: (checkpointId: string) => void;
  onRestoreCheckpoint: () => Promise<void>;
  onRetry: () => void;
  onClose: () => void;
};

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getTriggerLabel(trigger: PageHistoryTrigger) {
  switch (trigger) {
    case 'editor_idle':
      return 'Автосохранение';
    case 'before_unload':
      return 'Перед закрытием';
    case 'manual':
      return 'Ручная точка';
    case 'reconnect':
      return 'Переподключение';
    case 'collab_store':
      return 'Синхронизация';
    case 'restore':
      return 'Восстановление';
    default:
      return 'Версия';
  }
}

function getAuthorLabel(item: PageHistoryItem) {
  return item.createdByName?.trim() || item.createdBy?.trim() || 'WikiLive User';
}

function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typedNode = node as { text?: unknown; content?: unknown[] };
  const ownText = typeof typedNode.text === 'string' ? typedNode.text : '';
  const childText = Array.isArray(typedNode.content) ? typedNode.content.map(extractTextFromNode).join(' ') : '';

  return `${ownText} ${childText}`.trim();
}

function getPreviewText(checkpoint: PageHistoryCheckpoint | null) {
  if (!checkpoint) {
    return '';
  }

  const text = extractTextFromNode(checkpoint.document).replace(/\s+/g, ' ').trim();
  return text || checkpoint.checkpoint.excerpt || 'В этой версии нет текстового содержимого';
}

export function TimeMachinePanel({
  items,
  selectedCheckpoint,
  selectedCheckpointId,
  isLoading,
  isLoadingCheckpoint,
  isRestoring,
  errorMessage,
  onOpenCheckpoint,
  onRestoreCheckpoint,
  onRetry,
  onClose,
}: TimeMachinePanelProps) {
  const previewText = getPreviewText(selectedCheckpoint);

  return (
    <aside className="hidden h-screen w-[340px] shrink-0 flex-col border-l border-editor-border-subtle bg-white text-editor-text-primary xl:flex">
      <header className="border-b border-editor-border-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#1d2023]">Машина времени</h2>
            <p className="mt-1 text-sm text-[#969fa8]">История изменений документа</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#505762] hover:bg-[#f0f1f3]"
            aria-label="Закрыть машину времени"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {errorMessage ? (
        <div className="border-b border-[#ffd2d9] bg-[#fff1f3] px-6 py-2 text-xs text-[#b00025]">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#969fa8]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Загружаем историю
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-sm text-[#969fa8]">
          <Clock3 className="mb-3 h-8 w-8" />
          Истории изменений пока нет
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 h-9 rounded-md border border-editor-border-subtle bg-white px-3 text-sm font-semibold text-[#505762] hover:bg-[#f0f1f3]"
          >
            Обновить
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2 p-3">
            {items.map((item) => {
              const isSelected = item.id === selectedCheckpointId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenCheckpoint(item.id)}
                  className={[
                    'w-full rounded-md border p-3 text-left text-sm transition-colors',
                    isSelected
                      ? 'border-[#907ff0] bg-[#f7f4ff]'
                      : 'border-editor-border-subtle bg-white hover:bg-[#f7f8fa]',
                  ].join(' ')}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-[#1d2023]">{getTriggerLabel(item.trigger)}</span>
                    <span className="shrink-0 text-xs text-[#969fa8]">v{item.serverVersion}</span>
                  </span>
                  <span className="mt-1 block text-xs text-[#969fa8]">{formatHistoryDate(item.createdAt)}</span>
                  <span className="mt-1 block truncate text-xs text-[#505762]">{getAuthorLabel(item)}</span>
                  {item.excerpt ? <span className="mt-2 block max-h-10 overflow-hidden text-xs leading-5 text-[#505762]">{item.excerpt}</span> : null}
                </button>
              );
            })}
          </div>

          <section className="border-t border-editor-border-subtle px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#1d2023]">Превью версии</h3>
              {isLoadingCheckpoint ? <Loader2 className="h-4 w-4 animate-spin text-[#969fa8]" /> : null}
            </div>
            <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-editor-border-subtle bg-[#fafbfc] p-3 text-sm leading-6 text-[#505762]">
              {previewText || 'Выберите версию слева выше'}
            </div>
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm('Восстановить выбранную версию? Текущее состояние будет сохранено отдельной точкой истории.');

                if (confirmed) {
                  void onRestoreCheckpoint();
                }
              }}
              disabled={!selectedCheckpoint || isRestoring}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#907ff0] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {isRestoring ? 'Восстанавливаем' : 'Восстановить эту версию'}
            </button>
          </section>
        </div>
      )}
    </aside>
  );
}
