import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wikiliveApi } from '../../../shared/api/wikilive';
import { useAuthSession } from './use-auth-session';
import * as browserPersistence from '../../../shared/lib/browser-persistence';
import * as workspaceRoute from '../../../shared/lib/workspace-route';

vi.mock('../../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/wikilive')>(
    '../../../shared/api/wikilive',
  );
  return {
    ...actual,
    wikiliveApi: {
      ...actual.wikiliveApi,
      restoreSession: vi.fn(),
      refreshSession: vi.fn(),
      login: vi.fn(),
      getMe: vi.fn(),
      logout: vi.fn(),
      updateMeDisplayName: vi.fn(),
    },
  };
});

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(wikiliveApi.restoreSession).mockResolvedValue(null);
    vi.mocked(wikiliveApi.refreshSession).mockResolvedValue({
      accessToken: 'access-token',
      expiresInSec: 900,
    });
    vi.mocked(wikiliveApi.login).mockResolvedValue({ status: 'authorized' });
    vi.mocked(wikiliveApi.logout).mockResolvedValue(undefined);
    vi.mocked(wikiliveApi.getMe).mockResolvedValue({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'MWS Space A',
      },
    });
    vi.mocked(wikiliveApi.updateMeDisplayName).mockResolvedValue({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'Updated Name',
      },
    });
    vi.spyOn(browserPersistence, 'clearBrowserPersistence').mockResolvedValue(undefined);
    vi.spyOn(workspaceRoute, 'resetWorkspaceRoute').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('restores an existing session on mount', async () => {
    vi.mocked(wikiliveApi.restoreSession).mockResolvedValueOnce({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'MWS Space A',
      },
      expiresInSec: 900,
    });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('authorized');
    });

    expect(result.current.displayName).toBe('MWS Space A');
  });

  it('falls back to unauthorized when there is no stored session', async () => {
    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('unauthorized');
    });

    expect(result.current.displayName).toBe('');
  });

  it('logs in with API key and loads the current user profile', async () => {
    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('unauthorized');
    });

    await act(async () => {
      result.current.setApiKey('  sk-test  ');
    });

    await act(async () => {
      await result.current.handleLogin({
        preventDefault: vi.fn(),
      } as never);
    });

    expect(wikiliveApi.login).toHaveBeenCalledWith('sk-test', undefined);
    expect(wikiliveApi.refreshSession).toHaveBeenCalledTimes(1);
    expect(wikiliveApi.getMe).toHaveBeenCalledTimes(1);
    expect(result.current.authState).toBe('authorized');
    expect(result.current.displayName).toBe('MWS Space A');
    expect(result.current.apiKey).toBe('');
  });

  it('refreshes the session before token expiration', async () => {
    let intervalHandler: TimerHandler | undefined;
    const originalSetInterval = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (typeof timeout === 'number' && timeout >= 1000) {
        intervalHandler = () => {
          if (typeof handler === 'function') {
            return handler(...args);
          }

          return undefined;
        };
      }

      return originalSetInterval(handler, timeout, ...args);
    });
    vi.mocked(wikiliveApi.restoreSession).mockResolvedValueOnce({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'MWS Space A',
      },
      expiresInSec: 120,
    });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('authorized');
    });

    expect(typeof intervalHandler).toBe('function');

    await act(async () => {
      await (intervalHandler as () => void)();
    });

    await waitFor(() => {
      expect(wikiliveApi.refreshSession).toHaveBeenCalledTimes(1);
    });
  });

  it('drops back to unauthorized state when auto-refresh fails', async () => {
    let intervalHandler: TimerHandler | undefined;
    const originalSetInterval = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (typeof timeout === 'number' && timeout >= 1000) {
        intervalHandler = () => {
          if (typeof handler === 'function') {
            return handler(...args);
          }

          return undefined;
        };
      }

      return originalSetInterval(handler, timeout, ...args);
    });
    vi.mocked(wikiliveApi.restoreSession).mockResolvedValueOnce({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'MWS Space A',
      },
      expiresInSec: 120,
    });
    vi.mocked(wikiliveApi.refreshSession).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('authorized');
    });

    await act(async () => {
      await (intervalHandler as () => void)();
    });

    await waitFor(() => {
      expect(result.current.authState).toBe('unauthorized');
    });

    expect(result.current.errorMessage).toBe('Сессия истекла. Введите API-ключ снова.');
    expect(result.current.displayName).toBe('');
  });

  it('clears browser persistence on logout so previous workspace state is not reused', async () => {
    vi.mocked(wikiliveApi.restoreSession).mockResolvedValueOnce({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'MWS Space A',
      },
      expiresInSec: 900,
    });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('authorized');
    });

    window.localStorage.setItem('wikilive:selected-space-id', 'space-foreign');

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(wikiliveApi.logout).toHaveBeenCalledTimes(1);
    expect(browserPersistence.clearBrowserPersistence).toHaveBeenCalledTimes(1);
    expect(workspaceRoute.resetWorkspaceRoute).toHaveBeenCalledTimes(1);
    expect(result.current.authState).toBe('unauthorized');
    expect(result.current.displayName).toBe('');
  });

  it('requests display name on first login and completes onboarding on retry', async () => {
    vi.mocked(wikiliveApi.login)
      .mockResolvedValueOnce({
        status: 'display_name_required',
        profile: {
          userId: 'user-1',
          clientId: 'client-1',
          suggestedDisplayName: 'Nikita',
        },
      })
      .mockResolvedValueOnce({ status: 'authorized' });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('unauthorized');
    });

    await act(async () => {
      result.current.setApiKey('sk-test');
    });

    await act(async () => {
      await result.current.handleLogin({
        preventDefault: vi.fn(),
      } as never);
    });

    expect(result.current.requiresDisplayName).toBe(true);
    expect(result.current.pendingDisplayName).toBe('Nikita');
    expect(result.current.errorMessage).toBe('Для первого входа задайте отображаемое имя.');
    expect(wikiliveApi.refreshSession).toHaveBeenCalledTimes(0);

    await act(async () => {
      result.current.setPendingDisplayName('Nikita Live');
    });

    await act(async () => {
      await result.current.handleLogin({
        preventDefault: vi.fn(),
      } as never);
    });

    expect(wikiliveApi.login).toHaveBeenNthCalledWith(1, 'sk-test', undefined);
    expect(wikiliveApi.login).toHaveBeenNthCalledWith(2, 'sk-test', 'Nikita Live');
    expect(result.current.authState).toBe('authorized');
    expect(result.current.requiresDisplayName).toBe(false);
    expect(result.current.pendingDisplayName).toBe('');
  });

  it('updates display name for an authorized user', async () => {
    vi.mocked(wikiliveApi.restoreSession).mockResolvedValueOnce({
      user: {
        userId: 'user-1',
        clientId: 'client-1',
        displayName: 'MWS Space A',
      },
      expiresInSec: 900,
    });

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(result.current.authState).toBe('authorized');
    });

    await act(async () => {
      await result.current.handleUpdateDisplayName('Updated Name');
    });

    expect(wikiliveApi.updateMeDisplayName).toHaveBeenCalledWith('Updated Name');
    expect(result.current.displayName).toBe('Updated Name');
  });
});
