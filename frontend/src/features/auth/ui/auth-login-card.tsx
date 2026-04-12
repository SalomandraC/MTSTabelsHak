import { FormEvent } from 'react';

type AuthLoginCardProps = {
  apiKey: string;
  displayName: string;
  shouldAskDisplayName: boolean;
  isSubmitting: boolean;
  errorMessage: string;
  onApiKeyChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function AuthLoginCard({
  apiKey,
  displayName,
  shouldAskDisplayName,
  isSubmitting,
  errorMessage,
  onApiKeyChange,
  onDisplayNameChange,
  onSubmit,
}: AuthLoginCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff4f6_0%,#f3f7ff_45%,#e9edf7_100%)] p-6 text-editor-text-primary">
      <section className="w-full max-w-md rounded-2xl border border-editor-border-subtle bg-white/95 p-6 shadow-[0_24px_70px_-28px_rgba(0,20,80,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">WikiLive</p>
        <h1 className="mt-2 font-wide text-2xl font-semibold">Вход по API-ключу</h1>
        <p className="mt-2 text-sm text-editor-text-tertiary">
          Укажите персональный API-ключ MWS Tables. Для нового пользователя мы попросим задать отображаемое имя один раз.
        </p>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-editor-text-primary" htmlFor="api-key">
            API-ключ
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="sk-..."
            className="w-full rounded-lg border border-editor-border-subtle px-3 py-2 text-sm outline-none transition-colors focus:border-[#ff0037] focus:ring-2 focus:ring-[#ff003733]"
          />

          {shouldAskDisplayName ? (
            <>
              <label className="block pt-2 text-sm font-medium text-editor-text-primary" htmlFor="display-name">
                Отображаемое имя
              </label>
              <input
                id="display-name"
                type="text"
                autoComplete="off"
                value={displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                placeholder="Как вас показывать в WikiLive"
                className="w-full rounded-lg border border-editor-border-subtle px-3 py-2 text-sm outline-none transition-colors focus:border-[#ff0037] focus:ring-2 focus:ring-[#ff003733]"
              />
            </>
          ) : null}

          {errorMessage ? <p className="text-sm text-[#b00025]">{errorMessage}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[#ff0037] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#dd0031] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Проверяем ключ...' : shouldAskDisplayName ? 'Сохранить имя и войти' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
