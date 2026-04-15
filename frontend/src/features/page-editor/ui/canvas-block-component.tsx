import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
// Use browser-native randomUUID when available, fallback to a short random string.
const uuidv4 = () =>
  (globalThis.crypto && typeof (globalThis.crypto as any).randomUUID === 'function')
    ? (globalThis.crypto as any).randomUUID()
    : Math.random().toString(36).slice(2, 10);

type CanvasLine = {
  id: string;
  color: string;
  size: number;
  points: [number, number][];
};

const COLORS = ['#A975FF','#FB5151','#FD9170','#FFCB6B','#68CEF8','#80CBC4','#9DEF8F'];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function drawLine(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0], pts[1][1]);
  } else {
    for (let i = 1; i < pts.length - 2; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts.length - 1;
    ctx.quadraticCurveTo(pts[l - 1][0], pts[l - 1][1], pts[l][0], pts[l][1]);
  }
  ctx.stroke();
}

function paint(canvas: HTMLCanvasElement | null, lines: CanvasLine[]) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f1f3f5';
  ctx.fillRect(0, 0, r.width, r.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ln of lines) {
    if (ln.points.length < 2) continue;
    const px = ln.points.map(([x, y]) => [x * r.width, y * r.height]) as [number, number][];
    ctx.strokeStyle = ln.color;
    ctx.lineWidth = ln.size;
    drawLine(ctx, px);
  }
}

export function CanvasBlockComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const ptsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  // mutable refs — never stale in closures
  const colorRef = useRef(pick(COLORS));
  const sizeRef = useRef(Math.ceil(Math.random() * 10));

  const [color, setColor] = useState(colorRef.current);
  const [size, setSize] = useState(sizeRef.current);
  colorRef.current = color;
  sizeRef.current = size;

  const lines = (node.attrs.lines as CanvasLine[]) ?? [];

  /* ---- redraw when lines change (not while drawing) ---- */
  useEffect(() => {
    if (!drawingRef.current) {
      paint(cvRef.current, lines);
    }
  }, [lines, selected]);

  /* ---- relayout on resize ---- */
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (!drawingRef.current) paint(cvRef.current, lines);
    });
    if (cvRef.current) obs.observe(cvRef.current);
    return () => obs.disconnect();
  }, [lines]);

  /* ---- pointer handlers ---- */
  const rel = useCallback((e: PointerEvent): [number, number] => {
    const r = cvRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }, []);

  const onDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    e.stopPropagation();
    drawingRef.current = true;
    ptsRef.current = [rel(e)];
  }, [rel]);

  const onMove = useCallback((e: PointerEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    ptsRef.current.push(rel(e));
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const r = cv.getBoundingClientRect();
    const px = ptsRef.current.map(([x, y]) => [x * r.width, y * r.height]) as [number, number][];
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth = sizeRef.current;
    drawLine(ctx, px);
  }, [rel]);

  const onUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = ptsRef.current;
    if (pts.length >= 2) {
      const id = uuidv4();
      // read LATEST lines from node attrs at call time
      const currentLines = (node.attrs.lines as CanvasLine[]) ?? [];
      const next = [...currentLines.filter(l => l.id !== id), {
        id, color: colorRef.current, size: sizeRef.current, points: [...pts],
      }];
      updateAttributes({ lines: next });
    }
    ptsRef.current = [];
  }, [node.attrs.lines, updateAttributes]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    return () => {
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
    };
  }, [onDown, onMove, onUp]);

  return (
    <NodeViewWrapper className="canvas-block-node" data-type="canvasBlock">
      <div
        className={[
          'mb-2 rounded-lg border-2 border-editor-border-control bg-white shadow-sm transition-colors',
          selected ? 'border-red-400 shadow-md' : 'border-gray-200',
        ].join(' ')}
      >
        <div
          className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"
          contentEditable={false}
          onPointerDown={e => e.stopPropagation()}
        >
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600">
            Цвет:
            <input type="color" value={color}
              onChange={e => setColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-gray-300" />
          </label>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600">
            Размер:
            <input type="number" min={1} max={10} value={size}
              onChange={e => setSize(Math.min(10, Math.max(1, +e.target.value)))}
              className="h-7 w-14 rounded border border-gray-300 px-2 text-xs" />
          </label>
          <button
            className="ml-auto rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
            onClick={() => updateAttributes({ lines: [] })}
          >
            Очистить
          </button>
        </div>

        <canvas
          ref={cvRef}
          className="block w-full cursor-crosshair touch-none"
          style={{ height: '300px', background: '#f1f3f5' }}
        />

        <div className="px-3 py-1.5 text-center text-xs text-gray-400">
          Рисуйте мышью или пальцем на холсте
        </div>
      </div>
    </NodeViewWrapper>
  );
}
