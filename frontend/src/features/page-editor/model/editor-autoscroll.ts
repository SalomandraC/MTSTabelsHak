type VerticalBounds = {
  top: number;
  bottom: number;
};

type CaretBounds = {
  top: number;
  bottom: number;
};

export const DEFAULT_CARET_SCROLL_PADDING_PX = 96;

export function calculateVerticalCaretScrollDelta(
  viewport: VerticalBounds,
  caret: CaretBounds,
  padding = DEFAULT_CARET_SCROLL_PADDING_PX,
) {
  const topBoundary = viewport.top + padding;
  const bottomBoundary = viewport.bottom - padding;

  if (caret.bottom > bottomBoundary) {
    return Math.ceil(caret.bottom - bottomBoundary);
  }

  if (caret.top < topBoundary) {
    return -Math.ceil(topBoundary - caret.top);
  }

  return 0;
}
