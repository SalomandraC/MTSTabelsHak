import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import type { MwsField } from '../../../../shared/api/wikilive';
import { ModalActionButton } from '../../../../shared/ui';
import {
  getGlobalTableSnapshot,
  isNumericFieldType,
  type LiveChartAttrs,
  type LiveChartTableSnapshot,
  type LiveChartType,
} from '../model/live-chart-types';

type LiveChartPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (config: LiveChartAttrs) => void;
  initialConfig?: LiveChartAttrs | null;
  title?: string;
  submitLabel?: string;
};

function getAllSnapshots(): Array<{ datasheetId: string; snapshot: LiveChartTableSnapshot }> {
  const globalStore = window as unknown as {
    __wikiliveTableSnapshots?: Record<string, LiveChartTableSnapshot>;
  };

  const entries = Object.entries(globalStore.__wikiliveTableSnapshots ?? {});
  return entries
    .filter(([datasheetId]) => datasheetId.length > 0)
    .map(([datasheetId, snapshot]) => ({ datasheetId, snapshot }));
}

function getSnapshotDisplayName(item: { datasheetId: string; snapshot: LiveChartTableSnapshot }): string {
  const title = item.snapshot.title?.trim();
  if (title && title.length > 0) {
    return title;
  }

  return item.datasheetId;
}

export function LiveChartPickerModal({
  isOpen,
  onClose,
  onSubmit,
  initialConfig = null,
  title = 'Конструктор живой аналитики',
  submitLabel = 'Вставить график',
}: LiveChartPickerModalProps) {
  const [tick, setTick] = useState(0);
  const [datasheetId, setDatasheetId] = useState('');
  const [chartType, setChartType] = useState<LiveChartType>('bar');
  const [xAxisFieldId, setXAxisFieldId] = useState('');
  const [yAxisFieldIds, setYAxisFieldIds] = useState<string[]>([]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const bump = () => setTick((value) => value + 1);
    window.addEventListener('wikilive:table-snapshot-updated', bump);
    window.addEventListener('wikilive:ai-table-mutation', bump);

    return () => {
      window.removeEventListener('wikilive:table-snapshot-updated', bump);
      window.removeEventListener('wikilive:ai-table-mutation', bump);
    };
  }, [isOpen]);

  const snapshotItems = useMemo(() => getAllSnapshots(), [tick, isOpen]);
  const selectedSnapshot = useMemo(() => getGlobalTableSnapshot(datasheetId), [datasheetId, tick]);
  const fields = useMemo(() => (Array.isArray(selectedSnapshot?.fields) ? selectedSnapshot.fields : []), [selectedSnapshot]);

  useEffect(() => {
    if (!isOpen || wasOpenRef.current) {
      wasOpenRef.current = isOpen;
      return;
    }

    if (initialConfig) {
      setDatasheetId(initialConfig.datasheetId ?? '');
      setChartType(initialConfig.chartType ?? 'bar');
      setXAxisFieldId(initialConfig.xAxisFieldId ?? '');
      setYAxisFieldIds(Array.isArray(initialConfig.yAxisFieldIds) ? initialConfig.yAxisFieldIds : []);
    } else {
      setChartType('bar');
      setDatasheetId('');
      setXAxisFieldId('');
      setYAxisFieldIds([]);
    }

    wasOpenRef.current = isOpen;
  }, [initialConfig, isOpen]);

  useEffect(() => {
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!datasheetId && snapshotItems.length > 0) {
      setDatasheetId(snapshotItems[0].datasheetId);
    }
  }, [datasheetId, isOpen, snapshotItems]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextFields = fields as MwsField[];
    if (nextFields.length === 0) {
      setXAxisFieldId('');
      setYAxisFieldIds([]);
      return;
    }

    if (!nextFields.some((field) => field.id === xAxisFieldId)) {
      setXAxisFieldId(nextFields[0].id);
    }

    const numeric = nextFields.filter((field) => isNumericFieldType(field.type));
    const fallbackY = numeric[0]?.id ?? nextFields[1]?.id ?? nextFields[0].id;

    if (yAxisFieldIds.length === 0 || !yAxisFieldIds.every((fieldId) => nextFields.some((field) => field.id === fieldId))) {
      setYAxisFieldIds(fallbackY ? [fallbackY] : []);
    }
  }, [fields, isOpen, xAxisFieldId, yAxisFieldIds]);

  if (!isOpen) {
    return null;
  }

  const canSubmit = datasheetId.length > 0 && xAxisFieldId.length > 0 && yAxisFieldIds.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[220] bg-black/35 p-3 sm:p-6" onMouseDown={onClose} data-mws-stop-event="true">
      <div
        className="fixed left-1/2 top-1/2 flex w-[min(42rem,calc(100vw-1.5rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-editor-border-subtle bg-white shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Конструктор графика"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-editor-border-subtle p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">График</p>
            <h3 className="mt-2 font-wide text-xl font-semibold text-[#1f1f1f]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8d8d8d] hover:bg-[#f2f3f5] hover:text-[#1f1f1f]"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <label className="text-sm font-semibold text-editor-text-primary">
            Выберите таблицу
            <select
              value={datasheetId}
              onChange={(event) => setDatasheetId(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-editor-border-control bg-white px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            >
              {snapshotItems.length === 0 ? <option value="">Нет доступных таблиц</option> : null}
              {snapshotItems.map((item) => (
                <option key={item.datasheetId} value={item.datasheetId}>
                  {getSnapshotDisplayName(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-editor-text-primary">
            Тип графика
            <select
              value={chartType}
              onChange={(event) => setChartType(event.target.value as LiveChartType)}
              className="mt-1 h-11 w-full rounded-lg border border-editor-border-control bg-white px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            >
              <option value="bar">bar (сравнение)</option>
              <option value="line">line (тренд)</option>
              <option value="pie">pie (доли)</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-editor-text-primary">
            Что по горизонтали?
            <select
              value={xAxisFieldId}
              onChange={(event) => setXAxisFieldId(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-editor-border-control bg-white px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            >
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-editor-text-primary">
            Что по вертикали?
            <select
              value={yAxisFieldIds[0] ?? ''}
              onChange={(event) => setYAxisFieldIds(event.target.value ? [event.target.value] : [])}
              className="mt-1 h-11 w-full rounded-lg border border-editor-border-control bg-white px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            >
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-[#ffe2e7] bg-[#fff7f8] px-3 py-2 text-xs text-[#6b7280]">
            График автоматически обновляется при изменении значений в таблице.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-editor-border-subtle px-5 py-4">
          <ModalActionButton onClick={onClose} variant="secondary">
            Отмена
          </ModalActionButton>
          <ModalActionButton
            onClick={() => {
              if (!canSubmit) {
                return;
              }

              onSubmit({
                chartType,
                datasheetId,
                xAxisFieldId,
                yAxisFieldIds,
              });
            }}
            disabled={!canSubmit}
            variant="primary"
          >
            {submitLabel}
          </ModalActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
