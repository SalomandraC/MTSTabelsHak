export type PageEditorViewMode = 'standard' | 'paged';

export type PageEditorViewPreferences = {
  mode: PageEditorViewMode;
  leftIndent: number;
  rightIndent: number;
};

export const PAGE_EDITOR_VIEW_PREFERENCES_STORAGE_KEY = 'wikilive:page-editor:view-preferences';
export const DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES: PageEditorViewPreferences = {
  mode: 'standard',
  leftIndent: 2.54,
  rightIndent: 2.54,
};

export const MIN_PAGE_INDENT = 0.5;
export const MAX_PAGE_INDENT = 6.5;

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampPageIndent(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES.leftIndent;
  }

  return roundToTenth(Math.min(MAX_PAGE_INDENT, Math.max(MIN_PAGE_INDENT, value)));
}

function normalizeLegacyPixelsToCm(value: number) {
  if (value > 20) {
    return value / 37.7952755906;
  }

  return value;
}

export function normalizePageEditorViewMode(value: unknown): PageEditorViewMode {
  return value === 'paged' ? 'paged' : 'standard';
}

export function normalizePageEditorViewPreferences(value: unknown): PageEditorViewPreferences {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES;
  }

  const candidate = value as Partial<PageEditorViewPreferences>;

  return {
    mode: normalizePageEditorViewMode(candidate.mode),
    leftIndent: clampPageIndent(normalizeLegacyPixelsToCm(candidate.leftIndent ?? DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES.leftIndent)),
    rightIndent: clampPageIndent(normalizeLegacyPixelsToCm(candidate.rightIndent ?? DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES.rightIndent)),
  };
}

export function readPageEditorViewPreferences(): PageEditorViewPreferences {
  try {
    const raw = window.localStorage.getItem(PAGE_EDITOR_VIEW_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES;
    }

    return normalizePageEditorViewPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_PAGE_EDITOR_VIEW_PREFERENCES;
  }
}

export function writePageEditorViewPreferences(preferences: PageEditorViewPreferences) {
  try {
    window.localStorage.setItem(
      PAGE_EDITOR_VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizePageEditorViewPreferences(preferences)),
    );
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }
}
