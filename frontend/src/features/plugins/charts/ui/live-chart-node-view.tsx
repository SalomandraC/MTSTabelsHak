import { createPortal } from 'react-dom';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  buildLiveChartData,
  getGlobalTableSnapshot,
  type LiveChartAttrs,
} from '../model/live-chart-types';
import { LiveChartPickerModal } from './live-chart-picker-modal';

const MTS_SERIES_COLORS = ['#d70032', '#ff5c7a', '#ff9a3c', '#5f8dff', '#38b6a3', '#9867ff'];

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) {
      return;
    }

    const update = () => setIsDark(media.matches || document.documentElement.classList.contains('dark'));
    update();

    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return isDark;
}

const LONG_PRESS_DELETE_MS = 700;

export function LiveChartNodeView({ node, selected, editor, updateAttributes, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as LiveChartAttrs;
  const [tick, setTick] = useState(0);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [deletePopoverPosition, setDeletePopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const isDark = useIsDarkTheme();
  const longPressTimerRef = useRef<number | null>(null);
  const pressPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const onSnapshotUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ datasheetId?: string }>).detail;
      if (!detail?.datasheetId || detail.datasheetId === attrs.datasheetId) {
        setTick((value) => value + 1);
      }
    };

    window.addEventListener('wikilive:table-snapshot-updated', onSnapshotUpdated);
    window.addEventListener('wikilive:ai-table-mutation', onSnapshotUpdated);

    return () => {
      window.removeEventListener('wikilive:table-snapshot-updated', onSnapshotUpdated);
      window.removeEventListener('wikilive:ai-table-mutation', onSnapshotUpdated);
    };
  }, [attrs.datasheetId]);

  const snapshot = useMemo(() => getGlobalTableSnapshot(attrs.datasheetId), [attrs.datasheetId, tick]);
  const { points, xFieldName, ySeries } = useMemo(
    () => buildLiveChartData(attrs, snapshot),
    [attrs, snapshot],
  );

  const panelStyle = isDark
    ? {
        borderColor: '#374151',
        background: '#111827',
        color: '#f9fafb',
      }
    : {
        borderColor: '#ffd4da',
        background: '#fff7f8',
        color: '#1f2937',
      };

  const chartContainerStyle = isDark
    ? { background: '#0b1220' }
    : { background: '#ffffff' };

  const gridColor = isDark ? '#334155' : '#e8eaf0';
  const axisColor = isDark ? '#cbd5e1' : '#516073';

  const pieData = ySeries.length <= 1
    ? points.map((point) => ({
        name: point.xLabel,
        value: Number(point[ySeries[0]?.fieldId ?? ''] ?? 0),
      }))
    : ySeries.map((series) => ({
        name: series.fieldName,
        value: points.reduce((sum, point) => sum + Number(point[series.fieldId] ?? 0), 0),
      }));

  const isEditable = editor.isEditable;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const handleLongPressStart = () => {
    if (!isEditable || isPickerOpen || deletePopoverPosition || longPressTimerRef.current !== null) {
      return;
    }

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;

      const margin = 12;
      const popoverWidth = 230;
      const popoverHeight = 96;
      const x = Math.min(
        Math.max(pressPositionRef.current.x + 8, margin),
        window.innerWidth - popoverWidth - margin,
      );
      const y = Math.min(
        Math.max(pressPositionRef.current.y + 10, margin),
        window.innerHeight - popoverHeight - margin,
      );

      setDeletePopoverPosition({ x, y });
    }, LONG_PRESS_DELETE_MS);
  };

  useEffect(() => {
    if (!deletePopoverPosition) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeletePopoverPosition(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [deletePopoverPosition]);

  const deletePopover = deletePopoverPosition && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[230]"
          onMouseDown={() => setDeletePopoverPosition(null)}
          data-mws-stop-event="true"
        >
          <div
            className="absolute w-[230px] rounded-xl border border-[#ffd4dd] bg-white p-3 shadow-[0_16px_36px_rgba(17,24,39,0.24)]"
            style={{ left: deletePopoverPosition.x, top: deletePopoverPosition.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[#1f2937]">Удалить диаграмму?</p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-editor-border-subtle bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4b5563] hover:bg-[#f7f8fa]"
                onClick={() => setDeletePopoverPosition(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="rounded-md bg-[#d70032] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#b8002b]"
                onClick={() => {
                  setDeletePopoverPosition(null);
                  deleteNode();
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <NodeViewWrapper
      className={[
        'my-2 rounded-xl border p-3 shadow-[0_8px_20px_rgba(20,20,20,0.06)]',
        selected ? 'ring-2 ring-[#d70032]/30' : '',
      ].join(' ')}
      style={panelStyle}
      data-mws-stop-event="true"
      data-type="live-chart"
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
          return;
        }

        pressPositionRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
        handleLongPressStart();
      }}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onDoubleClick={() => {
        if (!isEditable) {
          return;
        }

        clearLongPressTimer();
        setDeletePopoverPosition(null);
        setIsPickerOpen(true);
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d70032]">Живая аналитика</div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] opacity-80">{attrs.chartType.toUpperCase()} · {attrs.datasheetId}</div>
          {isEditable ? (
            <button
              type="button"
              className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 text-[11px] font-semibold text-[#4b5563] hover:bg-[#f7f8fa]"
              onClick={() => setIsPickerOpen(true)}
            >
              Изменить
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-2 text-xs opacity-80">
        Ось X: <span className="font-semibold">{xFieldName}</span>
      </div>

      {isEditable ? (
        <div className="mb-2 text-[11px] text-[#6b7280]">
          Двойной клик: изменить. Удержание: удалить.
        </div>
      ) : null}

      <div className="h-[280px] w-full overflow-hidden rounded-lg border border-editor-border-subtle p-2" style={chartContainerStyle}>
        {points.length === 0 || ySeries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm opacity-70">
            Нет данных для построения графика
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {attrs.chartType === 'line' ? (
              <LineChart data={points} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="xLabel" tick={{ fill: axisColor, fontSize: 11 }} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {ySeries.map((series, index) => (
                  <Line
                    key={series.fieldId}
                    type="monotone"
                    dataKey={series.fieldId}
                    name={series.fieldName}
                    stroke={MTS_SERIES_COLORS[index % MTS_SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            ) : null}

            {attrs.chartType === 'bar' ? (
              <BarChart data={points} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="xLabel" tick={{ fill: axisColor, fontSize: 11 }} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {ySeries.map((series, index) => (
                  <Bar
                    key={series.fieldId}
                    dataKey={series.fieldId}
                    name={series.fieldName}
                    fill={MTS_SERIES_COLORS[index % MTS_SERIES_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : null}

            {attrs.chartType === 'pie' ? (
              <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <Tooltip />
                <Legend />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={92}
                  label
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={MTS_SERIES_COLORS[index % MTS_SERIES_COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            ) : null}
          </ResponsiveContainer>
        )}
      </div>

      <LiveChartPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSubmit={(nextConfig) => {
          updateAttributes(nextConfig);
          setIsPickerOpen(false);
        }}
        initialConfig={attrs}
        title="Редактирование графика"
        submitLabel="Сохранить"
      />

      {deletePopover}
    </NodeViewWrapper>
  );
}
