import { FormEvent, useEffect, useState } from 'react';
import { wikiliveApi } from '../../../shared/api/wikilive';
import { clearBrowserPersistence } from '../../../shared/lib/browser-persistence';
import { resetWorkspaceRoute } from '../../../shared/lib/workspace-route';

export type AuthState = 'bootstrapping' | 'unauthorized' | 'authorized';
const FALLBACK_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function getRefreshIntervalMs(expiresInSec: number | null | undefined): number {
  if (!expiresInSec || expiresInSec <= 60) {
    return FALLBACK_REFRESH_INTERVAL_MS;
  }

  return Math.max(60_000, (expiresInSec - 60) * 1000);
}

export function useAuthSession() {
  const [authState, setAuthState] = useState<AuthState>('bootstrapping');
  const [apiKey, setApiKey] = useState('');
  const [pendingDisplayName, setPendingDisplayName] = useState('');
  const [requiresDisplayName, setRequiresDisplayName] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await wikiliveApi.restoreSession();
        if (cancelled) {
          return;
        }

        if (session) {
          setDisplayName(session.user.displayName);
          setRefreshIntervalMs(getRefreshIntervalMs(session.expiresInSec));
          setAuthState('authorized');
          return;
        }

        setRefreshIntervalMs(null);
        setAuthState('unauthorized');
      } catch {
        if (!cancelled) {
          setRefreshIntervalMs(null);
          setAuthState('unauthorized');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'authorized' || !refreshIntervalMs) {
      return;
    }

    const timer = window.setInterval(() => {
      void wikiliveApi.refreshSession().then((session) => {
        if (!session) {
          setAuthState('unauthorized');
          setDisplayName('');
          setRefreshIntervalMs(null);
          setErrorMessage('Сессия истекла. Введите API-ключ снова.');
          return;
        }

        setRefreshIntervalMs(getRefreshIntervalMs(session.expiresInSec));
      });
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [authState, refreshIntervalMs]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setErrorMessage('Введите API-ключ');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const loginResult = await wikiliveApi.login(trimmed, requiresDisplayName ? pendingDisplayName.trim() : undefined);
      if (loginResult.status === 'display_name_required') {
        setRequiresDisplayName(true);
        setPendingDisplayName((current) => current || loginResult.profile.suggestedDisplayName || '');
        setErrorMessage('Для первого входа задайте отображаемое имя.');
        return;
      }

      const session = await wikiliveApi.refreshSession();
      if (!session) {
        throw new Error('Не удалось получить access token');
      }

      const me = await wikiliveApi.getMe();
      setDisplayName(me.user.displayName);
      setRefreshIntervalMs(getRefreshIntervalMs(session.expiresInSec));
      setApiKey('');
      setPendingDisplayName('');
      setRequiresDisplayName(false);
      setAuthState('authorized');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Ошибка авторизации');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await wikiliveApi.logout();
    } finally {
      await clearBrowserPersistence();
      resetWorkspaceRoute();
      setDisplayName('');
      setPendingDisplayName('');
      setRequiresDisplayName(false);
      setRefreshIntervalMs(null);
      setAuthState('unauthorized');
    }
  };

  const handleUpdateDisplayName = async (nextDisplayName: string) => {
    const normalized = nextDisplayName.trim();
    if (!normalized) {
      setErrorMessage('Введите отображаемое имя');
      return;
    }

    setIsUpdatingDisplayName(true);
    setErrorMessage('');

    try {
      const response = await wikiliveApi.updateMeDisplayName(normalized);
      setDisplayName(response.user.displayName);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить отображаемое имя');
      throw error;
    } finally {
      setIsUpdatingDisplayName(false);
    }
  };

  return {
    authState,
    apiKey,
    setApiKey,
    pendingDisplayName,
    setPendingDisplayName,
    requiresDisplayName,
    isSubmitting,
    isUpdatingDisplayName,
    errorMessage,
    displayName,
    handleLogin,
    handleUpdateDisplayName,
    handleLogout,
  };
}
