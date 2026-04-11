import { describe, expect, it } from 'vitest';

import {
  clampSidebarWidth,
  getResizedSidebarWidth,
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
} from './workspace-layout';

describe('workspace layout helpers', () => {
  it('clamps sidebar width inside allowed bounds', () => {
    expect(clampSidebarWidth(120, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)).toBe(LEFT_SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(999, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH)).toBe(RIGHT_SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(360, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)).toBe(360);
  });

  it('resizes the left sidebar from its right edge', () => {
    expect(getResizedSidebarWidth('left', 296, 500, 560, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)).toBe(356);
    expect(getResizedSidebarWidth('left', 296, 500, 430, LEFT_SIDEBAR_MIN_WIDTH, LEFT_SIDEBAR_MAX_WIDTH)).toBe(LEFT_SIDEBAR_MIN_WIDTH);
  });

  it('resizes the right sidebar from its left edge', () => {
    expect(getResizedSidebarWidth('right', 320, 1200, 1120, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH)).toBe(400);
    expect(getResizedSidebarWidth('right', 320, 1200, 1500, RIGHT_SIDEBAR_MIN_WIDTH, RIGHT_SIDEBAR_MAX_WIDTH)).toBe(
      RIGHT_SIDEBAR_MIN_WIDTH,
    );
  });
});
