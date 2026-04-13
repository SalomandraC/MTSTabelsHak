import { ModalActionButton } from '../../../shared/ui';

type IframeModalProps = {
  isOpen: boolean;
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function IframeModal({ isOpen, url, onUrlChange, onSubmit, onClose }: IframeModalProps) {
  if (!isOpen) {
    return null;
  }

  const canSubmit = url.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[101] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-6 shadow-[0_24px_70px_rgba(17,25,40,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-label="Встроить iframe"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">Встраивание контента</p>
          <h3 className="mt-2 font-wide text-xl font-semibold text-[#1f1f1f]">Вставить iframe</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Вставьте URL для встраивания — YouTube, карты, презентации и другое.
          </p>
        </div>

        <label className="flex w-full flex-col gap-1">
          <span className="text-sm leading-5 text-[#5a6676]">URL для встраивания</span>
          <input
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && canSubmit) onSubmit(); }}
            className="h-11 w-full rounded-lg border border-[#cfd5dc] px-4 text-base leading-6 text-[#262b33] outline-none placeholder:text-[#9aa3ae] focus:border-[#b8c1cc]"
            placeholder="https://www.youtube.com/embed/XIMLoLxmTDw"
            autoFocus
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <ModalActionButton
            onClick={onSubmit}
            disabled={!canSubmit}
            variant="primary"
            size="sm"
            className="w-full"
          >
            Вставить
          </ModalActionButton>
          <ModalActionButton
            onClick={onClose}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Отмена
          </ModalActionButton>
        </div>
      </div>
    </div>
  );
}
