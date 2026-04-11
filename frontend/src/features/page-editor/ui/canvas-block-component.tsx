import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

type CanvasLine = {
  id: string;
  color: string;
  size: number;
  points: [number, number][]; // relative 0..1 coords
};

const COLOR_PALETTE = [
  '#A975FF',
  '#FB5151',
  '#FD9170',
  '#FFCB6B',
  '#68CEF8',
  '#80CBC4',
  '#9DEF8F',
];

const getRandomElement = <T,>(list: T[]): T =>
  list[Math.floor(Math.random() * list.length)];

/** Smooth catmull-rom → canvas bezier path */
function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);

  if (points.length === 2) {
    ctx.lineTo(points[1][0], points[1][1]);
  } else {
    for (let i = 1; i < points.length - 2; i += 1) {
      const [cx, cy] = [
        (points[i][0] + points[i + 1][0]) / 2,
        (points[i][1] + points[i + 1][1]) / 2,
      ];
      ctx.quadraticCurveTo(points[i][0], points[i][1], cx, cy);
    }
    const last = points.length - 1;
    ctx.quadraticCurveTo(
      points[last - 1][0],
      points[last - 1][1],
      points[last][0],
      points[last][1],
    );
  }
  ctx.stroke();
}

/** Redraw all lines onto the canvas */
function redrawAll(
  canvas: HTMLCanvasElement,
  lines: CanvasLine[],
  bgColor: string,
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, rect.width, rect.height);

  for (const line of lines) {
    if (line.points.length < 2) continue;
    const px = line.points.map(([x, y]) => [
      x * rect.width,
      y * rect.height,
    ]) as [number, number][];

    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawSmoothLine(ctx, px);
  }
}

export function CanvasBlockComponent({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const currentIdRef = useRef(uuidv4());

  const [color, setColor] = useState(() => getRandomElement(COLOR_PALETTE));
  const [size, setSize] = useState(() => Math.ceil(Math.random() * 10));

  const lines = (node.attrs.lines as CanvasLine[]) ?? [];

  /* ---- redraw whenever attrs change ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redrawAll(canvas, lines, '#f1f3f5');
  }, [lines]);

  /* ---- pointer handlers ---- */
  const getRelativePoint = useCallback(
    (e: PointerEvent): [number, number] => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return [
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
      ];
    },
    [],
  );

  const onPointerDown = useCallback((e: PointerEvent) => {
    // only left button or touch
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    drawingRef.current = true;
    pointsRef.current = [getRelativePoint(e)];
  }, [getRelativePoint]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      e.stopPropagation(); // prevent ProseMirror from stealing the event
      pointsRef.current.push(getRelativePoint(e));

      // draw current stroke in real-time
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const px = pointsRef.current.map(([x, y]) => [
        x * rect.width,
        y * rect.height,
      ]) as [number, number][];

      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawSmoothLine(ctx, px);
    },
    [color, size, getRelativePoint],
  );

  const onPointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const pts = pointsRef.current;
    if (pts.length >= 2) {
      const prev = lines.filter((l) => l.id !== currentIdRef.current);
      updateAttributes({
        lines: [
          ...prev,
          {
            id: currentIdRef.current,
            color,
            size,
            points: [...pts],
          },
        ],
      });
    }

    currentIdRef.current = uuidv4();
    pointsRef.current = [];

    // full redraw to commit the saved line
    const canvas = canvasRef.current;
    if (canvas) redrawAll(canvas, lines, '#f1f3f5');
  }, [lines, color, size, updateAttributes]);

  /* ---- attach listeners to canvas ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onPointerDown, onPointerMove, onPointerUp]);

  const clearCanvas = useCallback(() => {
    updateAttributes({ lines: [] });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper
      className="canvas-block-node"
      data-type="canvasBlock"
      contentEditable={false}
    >
      <div
        className={[
          'mb-2 rounded-lg border-2 border-editor-border-control bg-white shadow-sm transition-colors',
          selected ? 'border-red-400 shadow-md' : 'border-gray-200',
        ].join(' ')}
      >
        {/* controls */}
        <div
          className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"
          contentEditable={false}
        >
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600" htmlFor="canvas-color">
              Цвет:
            </label>
            <input
              id="canvas-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-gray-300"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600" htmlFor="canvas-size">
              Размер:
            </label>
            <input
              id="canvas-size"
              type="number"
              min={1}
              max={10}
              value={size}
              onChange={(e) => setSize(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="h-7 w-14 rounded border border-gray-300 px-2 text-xs"
            />
          </div>

          <div className="ml-auto">
            <button
              type="button"
              onClick={clearCanvas}
              className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300"
            >
              Очистить
            </button>
          </div>
        </div>

        {/* canvas */}
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair touch-none"
          style={{ height: '400px', background: '#f1f3f5' }}
        />

        <div className="px-3 py-1.5 text-center text-xs text-gray-400">
          Рисуйте мышью или пальцем на холсте
        </div>
      </div>
    </NodeViewWrapper>
  );
}
