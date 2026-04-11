import { ReactNode } from 'react';
import { useAuthSession } from '../model/use-auth-session';
import { AuthLoginCard } from './auth-login-card';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const {
    authState,
    apiKey,
    setApiKey,
    isSubmitting,
    errorMessage,
    displayName,
    handleLogin,
    handleLogout,
  } = useAuthSession();

  if (authState === 'bootstrapping') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f2f5fb] text-editor-text-primary">
        <p className="text-sm text-editor-text-tertiary">Восстанавливаем сессию...</p>
      </main>
    );
  }

  if (authState === 'unauthorized') {
    return (
      <AuthLoginCard
        apiKey={apiKey}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onApiKeyChange={setApiKey}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleLogout}
        className="absolute right-4 top-4 z-20 rounded-lg border border-editor-border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-editor-text-secondary shadow-sm transition-colors hover:bg-editor-bg-control"
      >
        {displayName ? `${displayName} • Выйти` : 'Выйти'}
      </button>
      {children}
    </div>
  );
}