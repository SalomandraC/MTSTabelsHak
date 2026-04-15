import { describe, expect, it, beforeEach } from 'vitest';

import {
  clampPageIndent,
  DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES,
  MAX_PAGE_INDENT,
  MIN_PAGE_INDENT,
  PAGE_EDITOR_VIEW_PREFERENCES_STORAGE_KEY,
  readPageEditorViewPreferences,
  writePageEditorViewPreferences,
} from './editor-view-preferences';

describe('editor-view-preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when storage is empty', () => {
    expect(readPageEditorViewPreferences()).toEqual(DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES);
  });

  it('normalizes invalid values from storage', () => {
    window.localStorage.setItem(
      PAGE_EDITOR_VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        mode: 'unexpected',
        leftIndent: 0.1,
        rightIndent: 999,
      }),
    );

    expect(readPageEditorViewPreferences()).toEqual({
      mode: 'standard',
      leftIndent: MIN_PAGE_INDENT,
      rightIndent: MAX_PAGE_INDENT,
    });
  });

  it('persists normalized preferences', () => {
    writePageEditorViewPreferences({
      mode: 'paged',
      leftIndent: 2.56,
      rightIndent: 3.14,
    });

    expect(readPageEditorViewPreferences()).toEqual({
      mode: 'paged',
      leftIndent: 2.6,
      rightIndent: 3.1,
    });
  });

  it('clamps page indents to supported range', () => {
    expect(clampPageIndent(MIN_PAGE_INDENT - 20)).toBe(MIN_PAGE_INDENT);
    expect(clampPageIndent(MAX_PAGE_INDENT + 20)).toBe(MAX_PAGE_INDENT);
  });

  it('migrates legacy pixel values to centimeters', () => {
    window.localStorage.setItem(
      PAGE_EDITOR_VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        mode: 'paged',
        leftIndent: 96,
        rightIndent: 108,
      }),
    );

    expect(readPageEditorViewPreferences()).toEqual({
      mode: 'paged',
      leftIndent: 2.5,
      rightIndent: 2.9,
    });
  });
});
