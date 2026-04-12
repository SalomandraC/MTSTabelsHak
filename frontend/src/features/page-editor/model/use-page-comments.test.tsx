import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wikiliveApi } from '../../../shared/api/wikilive';
import { usePageComments } from './use-page-comments';

vi.mock('../../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/wikilive')>('../../../shared/api/wikilive');
  return {
    ...actual,
    wikiliveApi: {
      ...actual.wikiliveApi,
      getComments: vi.fn(),
    },
  };
});

describe('usePageComments', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(wikiliveApi.getComments).mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps local draft thread open during polling refresh before submit', async () => {
    const editor = {
      state: {
        selection: {
          from: 0,
          to: 5,
          empty: false,
        },
        doc: {
          textBetween: vi.fn(() => 'Тест'),
        },
      },
      chain: vi.fn(() => ({
        focus: vi.fn().mockReturnThis(),
        setCommentAnchor: vi.fn().mockReturnThis(),
        run: vi.fn(() => true),
      })),
      commands: {
        removeCommentAnchor: vi.fn(),
      },
    } as any;

    const { result } = renderHook(() =>
      usePageComments({
        pageId: 'page-1',
        editor,
        enabled: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.startThreadFromSelection(editor);
    });

    const activeDraftId = result.current.activeThreadId;
    expect(activeDraftId).toBeTruthy();
    expect(result.current.activeThread?.isDraft).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(result.current.activeThreadId).toBe(activeDraftId);
    expect(result.current.activeThread?.isDraft).toBe(true);
  });
});
