import { FormEvent, useEffect, useState } from 'react';
import { wikiliveApi } from '../../../shared/api/wikilive';

export type AuthState = 'bootstrapping' | 'unauthorized' | 'authorized';

export function useAuthSession() {
  const [authState, setAuthState] = useState<AuthState>('bootstrapping');
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const user = await wikiliveApi.restoreSession();
        if (cancelled) {
          return;
        }

        if (user) {
          setDisplayName(user.displayName);
          setAuthState('authorized');
          return;
        }

        setAuthState('unauthorized');
      } catch {
        if (!cancelled) {
          setAuthState('unauthorized');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'authorized') {
      return;
    }

    const timer = window.setInterval(() => {
      void wikiliveApi.refreshSession().then((token) => {
        if (!token) {
          setAuthState('unauthorized');
          setDisplayName('');
          setErrorMessage('Сессия истекла. Введите API-ключ снова.');
        }
      });
    }, 10 * 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authState]);

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
      const token = await wikiliveApi.refreshSession();
      if (!token) {
        throw new Error('Не удалось получить access token');
      }

      const me = await wikiliveApi.getMe();
      setDisplayName(me.user.displayName);
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
      setDisplayName('');
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