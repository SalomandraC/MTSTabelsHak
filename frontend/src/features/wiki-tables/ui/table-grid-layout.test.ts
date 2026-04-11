import { describe, expect, it } from 'vitest';

import {
  MAX_GRID_HEIGHT,
  MIN_GRID_HEIGHT
} from '../model/use-wiki-table-embed';
import { resolveTableGridHeight } from './table-grid-layout';

describe('resolveTableGridHeight', () => {
  it('returns full height for expanded mode', () => {
    expect(resolveTableGridHeight(1200, true)).toBe('100%');
  });

  it('keeps embedded tables at least the minimum height', () => {
    expect(resolveTableGridHeight(120, false)).toBe(MIN_GRID_HEIGHT);
  });

  it('caps embedded tables at the maximum preview height', () => {
    expect(resolveTableGridHeight(1200, false)).toBe(MAX_GRID_HEIGHT);
  });
});
