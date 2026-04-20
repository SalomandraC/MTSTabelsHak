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
import { RemoveBlockMenu } from '../../../../shared/ui/remove-block-menu';

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
        borderColor: '#5c1b29',
        background: 'linear-gradient(180deg, #24141a 0%, #1a1014 100%)',
        color: '#f9fafb',
      }
    : {
        borderColor: '#f2c6cf',
        background: 'linear-gradient(180deg, #fff7f8 0%, #ffffff 100%)',
        color: '#1f2937',
      };

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
      setDeletePopoverPosition({
        x: pressPositionRef.current.x + 8,
        y: pressPositionRef.current.y + 10,
      });
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

  return (
    <NodeViewWrapper
      className={[
        'mermaid-diagram-node my-2',
        selected ? 'mermaid-diagram-node--selected' : '',
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
      <div className="mermaid-diagram-node__header" contentEditable={false}>
        <div className="min-w-0">
          <span className="mermaid-diagram-node__title">Живой график</span>
          {isEditable ? (
            <p className="mt-1 text-[11px] text-[#6e7582]">
              Двойной клик: редактировать график. Долгое нажатие: удалить из документа.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] opacity-80">{attrs.chartType.toUpperCase()} · {attrs.datasheetId}</div>
          {isEditable ? (
            <button
              type="button"
              className="mermaid-diagram-node__edit"
              onClick={() => setIsPickerOpen(true)}
            >
              Изменить
            </button>
          ) : null}
        </div>
      </div>

      <div className="mermaid-diagram-node__surface" contentEditable={false}>
      <div className="mb-2 text-xs opacity-80">
        Ось X: <span className="font-semibold">{xFieldName}</span>
      </div>

      <div className="h-[280px] w-full overflow-hidden rounded-lg border border-editor-border-subtle p-2 bg-white">
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

      <RemoveBlockMenu
        isOpen={Boolean(deletePopoverPosition)}
        position={deletePopoverPosition}
        label="Удалить график из документа"
        onClose={() => setDeletePopoverPosition(null)}
        onConfirm={() => {
          setDeletePopoverPosition(null);
          deleteNode();
        }}
      />
    </NodeViewWrapper>
  );
}
