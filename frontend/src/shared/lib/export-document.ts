import { getAccessToken, getCurrentUser } from '../api/wikilive';

const DOCGEN_URL = import.meta.env.VITE_DOCGEN_URL ?? 'http://localhost:3200';
const APP_BASE_URL = import.meta.env.VITE_APP_BASE_URL ?? window.location.origin;

export type ExportFormat = 'pdf' | 'docx' | 'md';

export async function exportDocument(
  title: string,
  prosemirrorDoc: unknown,
  format: ExportFormat,
  spaceId?: string,
): Promise<void> {
  const token = getAccessToken();
  const user = getCurrentUser();

  const response = await fetch(`${DOCGEN_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format,
      title,
      document: prosemirrorDoc,
      appBaseUrl: APP_BASE_URL,
      spaceId,
      auth: {
        accessToken: token ?? undefined,
        userId: user?.userId,
        displayName: user?.displayName,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Ошибка генерации документа' }));
    throw new Error((err as { error?: string }).error ?? 'Ошибка генерации документа');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${sanitize(title)}.${format}`;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Zа-яА-Я0-9\s_-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'document';
}
