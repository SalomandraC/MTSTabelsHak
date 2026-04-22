import { describe, expect, it } from 'vitest';

import { calculateVerticalCaretScrollDelta, DEFAULT_CARET_SCROLL_PADDING_PX } from './editor-autoscroll';

describe('editor-autoscroll', () => {
  it('does not scroll when caret stays inside the comfortable viewport area', () => {
    expect(
      calculateVerticalCaretScrollDelta(
        { top: 100, bottom: 900 },
        { top: 420, bottom: 444 },
      ),
    ).toBe(0);
  });

  it('scrolls down when caret moves below the lower boundary', () => {
    expect(
      calculateVerticalCaretScrollDelta(
        { top: 100, bottom: 900 },
        { top: 830, bottom: 856 },
      ),
    ).toBe(52);
  });

  it('scrolls up when caret moves above the upper boundary', () => {
    expect(
      calculateVerticalCaretScrollDelta(
        { top: 100, bottom: 900 },
        { top: 162, bottom: 186 },
      ),
    ).toBe(-(DEFAULT_CARET_SCROLL_PADDING_PX - 62));
  });
});
