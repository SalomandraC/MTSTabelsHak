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
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      await wikiliveApi.login(trimmed);
      const session = await wikiliveApi.refreshSession();
      if (!session) {
        throw new Error('Не удалось получить access token');
      }

      const me = await wikiliveApi.getMe();
      setDisplayName(me.user.displayName);
      setRefreshIntervalMs(getRefreshIntervalMs(session.expiresInSec));
      setApiKey('');
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
      setRefreshIntervalMs(null);
      setAuthState('unauthorized');
    }
  };

  return {
    authState,
    apiKey,
    setApiKey,
    isSubmitting,
    errorMessage,
    displayName,
    handleLogin,
    handleLogout,
  };
}
