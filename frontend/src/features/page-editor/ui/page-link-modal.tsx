import { createPortal } from 'react-dom';
import { ModalActionButton } from '../../../shared/ui';

type PageLinkModalProps = {
  isOpen: boolean;
  position: { top: number; left: number };
  linkText: string;
  url: string;
  openInNewTab: boolean;
  isExistingLink: boolean;
  onLinkTextChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onOpenInNewTabChange: (value: boolean) => void;
  onSubmit: () => void;
  onDeleteLink: () => void;
  onClose: () => void;
};

export function PageLinkModal({
  isOpen,
  position,
  linkText,
  url,
  openInNewTab,
  isExistingLink,
  onLinkTextChange,
  onUrlChange,
  onOpenInNewTabChange,
  onSubmit,
  onDeleteLink,
  onClose,
}: PageLinkModalProps) {
  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const canSubmit = linkText.trim().length > 0 && url.trim().length > 0;

  return createPortal(
    <div
      className="fixed z-[220] flex w-[min(26.5rem,calc(100vw-1rem))] flex-col items-start justify-center gap-3 rounded-xl bg-white p-6 shadow-[0px_4px_24px_rgba(0,0,0,0.12),0px_8px_16px_rgba(0,0,0,0.08)]"
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-modal="false"
      aria-label="Добавить ссылку"
    >
      <label className="flex w-full flex-col gap-1">
        <span className="text-sm leading-5 text-[#5a6676]">Текст ссылки</span>
        <input
          value={linkText}
          onChange={(event) => onLinkTextChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-[#cfd5dc] px-4 text-base leading-6 text-[#262b33] outline-none placeholder:text-[#9aa3ae] focus:border-[#b8c1cc]"
          placeholder="Например, Документация"
        />
      </label>

      <label className="flex w-full flex-col gap-1">
        <span className="text-sm leading-5 text-[#5a6676]">URL ссылки</span>
        <input
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-[#cfd5dc] px-4 text-base leading-6 text-[#262b33] outline-none placeholder:text-[#9aa3ae] focus:border-[#b8c1cc]"
          placeholder="https://example.com"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm leading-5 text-[#2f3640]">
        <input
          type="checkbox"
          checked={openInNewTab}
          onChange={(event) => onOpenInNewTabChange(event.target.checked)}
          className="h-5 w-5 rounded-[0.375rem] border border-[#9099a3]"
        />
        <span>Открывать в новой вкладке</span>
      </label>

      <div className="mt-1 grid w-full grid-cols-2 gap-2">
        <ModalActionButton
          onClick={onSubmit}
          disabled={!canSubmit}
          variant="primary"
          size="sm"
          className="w-full"
        >
          Сохранить
        </ModalActionButton>
        <ModalActionButton
          onClick={isExistingLink ? onDeleteLink : onClose}
          variant="secondary"
          size="sm"
          className="w-full"
        >
          {isExistingLink ? 'Удалить ссылку' : 'Отмена'}
        </ModalActionButton>
      </div>
    </div>
  , document.body);
}
