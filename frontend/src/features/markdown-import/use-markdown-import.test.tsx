import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wikiliveApi } from '../../shared/api/wikilive';
import { useMarkdownImport } from './use-markdown-import';

vi.mock('../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/wikilive')>('../../shared/api/wikilive');
  return {
    ...actual,
    wikiliveApi: {
      ...actual.wikiliveApi,
      createPage: vi.fn(),
    },
  };
});

class SuccessfulFileReaderMock {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsText(file: Blob) {
    void file.text().then((result) => {
      this.onload?.({ target: { result } } as ProgressEvent<FileReader>);
    });
  }
}

describe('useMarkdownImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('FileReader', SuccessfulFileReaderMock as unknown as typeof FileReader);
    vi.mocked(wikiliveApi.createPage)
      .mockResolvedValueOnce({
        page: {
          id: 'page-1',
          title: 'Imported 1',
          icon: 'doc',
          excerpt: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          backlinksCount: 0,
        },
      })
      .mockResolvedValueOnce({
        page: {
          id: 'page-2',
          title: 'Imported 2',
          icon: 'doc',
          excerpt: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          backlinksCount: 0,
        },
      });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens and closes the markdown import modal', () => {
    const { result } = renderHook(() =>
      useMarkdownImport({
        spaceId: 'space-1',
        onPageCreated: vi.fn(),
        onError: vi.fn(),
      }),
    );

    act(() => {
      result.current.triggerImport();
    });

    expect(result.current.isModalOpen).toBe(true);

    act(() => {
      result.current.closeImportModal();
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.selectedFiles).toEqual([]);
  });

  it('keeps valid markdown files and shows validation errors for invalid ones', () => {
    const { result } = renderHook(() =>
      useMarkdownImport({
        spaceId: 'space-1',
        onPageCreated: vi.fn(),
        onError: vi.fn(),
      }),
    );

    const validFile = new File(['# Valid'], 'valid.md', { type: 'text/markdown' });
    const invalidFile = new File(['oops'], 'invalid.txt', { type: 'text/plain' });

    act(() => {
      result.current.handleFilesSelect([validFile, invalidFile]);
    });

    expect(result.current.selectedFiles).toEqual([validFile]);
    expect(result.current.modalErrorMessage).toContain('invalid.txt');
    expect(result.current.modalErrorMessage).toContain('Поддерживаются только файлы .md');
  });

  it('imports multiple markdown files sequentially and opens the last imported page', async () => {
    let resolvePageCreated: (() => void) | null = null;
    const onPageCreated = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePageCreated = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useMarkdownImport({
        spaceId: 'space-1',
        onPageCreated,
        onError: vi.fn(),
      }),
    );

    const firstFile = new File(['# First'], 'first.md', { type: 'text/markdown' });
    const secondFile = new File(['---\ntitle: Imported 2\n---\n\n# Second'], 'second.md', { type: 'text/markdown' });

    act(() => {
      result.current.triggerImport();
      result.current.handleFilesSelect([firstFile, secondFile]);
    });

    await act(async () => {
      void result.current.submitImport();
    });

    await waitFor(() => {
      expect(wikiliveApi.createPage).toHaveBeenNthCalledWith(1, 'space-1', 'first');
      expect(wikiliveApi.createPage).toHaveBeenNthCalledWith(2, 'space-1', 'Imported 2');
      expect(onPageCreated).toHaveBeenCalledWith(
        'page-2',
        expect.objectContaining({
          type: 'doc',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'heading',
              attrs: { level: 1 },
            }),
          ]),
        }),
      );
    });

    expect(result.current.isImporting).toBe(true);

    await act(async () => {
      resolvePageCreated?.();
    });

    await waitFor(() => {
      expect(result.current.isImporting).toBe(false);
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.selectedFiles).toEqual([]);
  });

  it('reports partial failures but still keeps the last successful page as the opened one', async () => {
    vi.mocked(wikiliveApi.createPage)
      .mockReset()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        page: {
          id: 'page-2',
          title: 'Imported 2',
          icon: 'doc',
          excerpt: null,
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          backlinksCount: 0,
        },
      });

    const onError = vi.fn();
    const onPageCreated = vi.fn();

    const { result } = renderHook(() =>
      useMarkdownImport({
        spaceId: 'space-1',
        onPageCreated,
        onError,
      }),
    );

    const firstFile = new File(['# Broken'], 'broken.md', { type: 'text/markdown' });
    const secondFile = new File(['# Fine'], 'fine.md', { type: 'text/markdown' });

    act(() => {
      result.current.triggerImport();
      result.current.handleFilesSelect([firstFile, secondFile]);
    });

    await act(async () => {
      await result.current.submitImport();
    });

    await waitFor(() => {
      expect(onPageCreated).toHaveBeenCalledWith(
        'page-2',
        expect.objectContaining({
          type: 'doc',
        }),
      );
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('broken.md: Не удалось создать страницу'));
    });

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.selectedFiles).toEqual([]);
    expect(result.current.isImporting).toBe(false);
  });
});
