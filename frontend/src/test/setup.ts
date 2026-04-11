import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

Object.defineProperty(window, 'devicePixelRatio', {
  configurable: true,
  value: 1,
});

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

const getCanvasContextMock = (() => ({
  setTransform: () => {},
  clearRect: () => {},
  fillRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  strokeRect: () => {},
  fillText: () => {},
  save: () => {},
  rect: () => {},
  clip: () => {},
  restore: () => {},
  measureText: (value: string) => ({ width: value.length * 7 }),
  fillStyle: '#000000',
  strokeStyle: '#000000',
  font: '13px sans-serif',
  textBaseline: 'middle',
  lineWidth: 1,
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.getContext = getCanvasContextMock;
