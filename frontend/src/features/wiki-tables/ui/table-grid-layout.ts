import {
  MAX_GRID_HEIGHT,
  MIN_GRID_HEIGHT
} from '../model/use-wiki-table-embed';

export function resolveTableGridHeight(
  gridHeight: number,
  isExpanded: boolean
) {
  if (isExpanded) {
    return '100%';
  }

  return Math.min(MAX_GRID_HEIGHT, Math.max(MIN_GRID_HEIGHT, gridHeight));
}
