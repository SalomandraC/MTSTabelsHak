import { useState } from 'react';
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const previewText = getPreviewText(selectedCheckpoint);

  return (
    <>
      <aside className="time-machine-panel hidden h-screen w-full shrink-0 flex-col overflow-hidden border-l border-editor-border-subtle bg-white text-editor-text-primary xl:flex">
        <header className="border-b border-editor-border-subtle px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#1d2023]">Машина времени</h2>
              <p className="mt-1 text-sm text-[#1d2023]">История изменений документа</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#505762] hover:bg-[#f3f4f6]"
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
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-[#9e6a83]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#da6a8d]" />
            Загружаем историю
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-sm text-[#9e6a83]">
            <Clock3 className="mb-3 h-8 w-8 text-[#d81f55]" />
            Истории изменений пока нет
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 h-9 rounded-md border border-editor-border-subtle bg-white px-3 text-sm font-semibold text-[#5f3647] hover:bg-[#f3f4f6]"
            >
              Обновить
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-2">
                {items.map((item) => {
                  const isSelected = item.id === selectedCheckpointId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenCheckpoint(item.id)}
                      className={[
                        'w-full rounded-md border p-3 text-left text-sm transition-colors duration-200 ease-out',
                        isSelected
                          ? 'border-[#d81f55] bg-[#fff0f6] shadow-sm'
                          : 'border-editor-border-subtle bg-white hover:bg-[#f8fafc]',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate font-semibold text-[#1d2023]">{getTriggerLabel(item.trigger)}</span>
                        <span className="shrink-0 text-xs text-[#9e6a83]">v{item.serverVersion}</span>
                      </span>
                      <span className="mt-1 block text-xs text-[#9e6a83]">{formatHistoryDate(item.createdAt)}</span>
                      <span className="mt-1 block truncate text-xs text-[#5f3647]">{getAuthorLabel(item)}</span>
                      {item.excerpt ? (
                        <span className="mt-2 block max-h-10 overflow-hidden text-xs leading-5 text-[#5f3647]">
                          {item.excerpt}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sticky bottom-0 border-t border-editor-border-subtle bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                disabled={!selectedCheckpoint || isRestoring}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#d70032] px-4 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 hover:-translate-x-0.5 hover:bg-[#c2154c] hover:shadow-[0_15px_40px_-20px_rgba(216,31,85,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbcfe8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {isRestoring ? 'Восстанавливаем' : 'Восстановить эту версию'}
              </button>
            </div>
          </div>
        )}
      </aside>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#d81f55] bg-white shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#d81f55]">Подтверждение</p>
                  <h2 className="mt-2 text-xl font-semibold text-[#1f1725]">Восстановить выбранную версию?</h2>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm text-[#4d374e]">
              <p>Текущее состояние будет сохранено отдельной точкой истории, и восстановление вернет документ к выбранной версии.</p>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#e5e7eb] bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-[#4d374e] transition duration-200 ease-out hover:-translate-y-0.5 hover:-translate-x-0.5 hover:bg-[#f3f4f6] sm:w-auto"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsConfirmOpen(false);
                  await onRestoreCheckpoint();
                }}
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-[#d70032] px-4 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 hover:-translate-x-0.5 hover:bg-[#c2154c] sm:w-auto"
              >
                Подтвердить восстановление
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
