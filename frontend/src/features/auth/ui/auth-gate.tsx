import { ReactNode } from 'react';
import { AuthSessionContext } from '../model/auth-session-context';
import { useAuthSession } from '../model/use-auth-session';
import { AuthLoginCard } from './auth-login-card';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const authSession = useAuthSession();
  const { authState, apiKey, setApiKey, isSubmitting, errorMessage, handleLogin } = authSession;

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

  return <AuthSessionContext.Provider value={authSession}>{children}</AuthSessionContext.Provider>;
}
