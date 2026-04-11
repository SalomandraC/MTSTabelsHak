import { useId, useRef } from 'react';
import { ModalActionButton } from '../../../shared/ui';

type PageImageModalProps = {
  isOpen: boolean;
  errorMessage: string;
  fileName: string;
  fileSizeLabel: string;
  previewSrc: string;
  isConfirmDisabled: boolean;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onConfirm: () => void;
};

export function PageImageModal({
  isOpen,
  errorMessage,
  fileName,
  fileSizeLabel,
  previewSrc,
  isConfirmDisabled,
  onClose,
  onFileSelect,
  onConfirm,
}: PageImageModalProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) {
    return null;
  }

  const hasPreview = Boolean(previewSrc);

  return (
    <div className="fixed inset-0 z-[85] bg-black/45" onMouseDown={onClose}>
      <div
        className="mx-auto flex w-[min(44rem,calc(100vw-1.5rem))] max-w-[calc(100%-24px)] flex-col gap-3 rounded-[14px] bg-white p-6 shadow-[0px_4px_24px_rgba(0,0,0,0.12),0px_8px_16px_rgba(0,0,0,0.08)] fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        role="dialog"
        aria-modal="true"
        aria-label="Вставить изображение"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[1.75rem] font-semibold leading-8 text-[#252b36]">Вставить изображение</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#f0f2f6] text-xl leading-none text-[#333845]"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {errorMessage ? (
          <div className="rounded-md bg-[#fbece8] px-3 py-2 text-sm text-[#db5d3e]">{errorMessage}</div>
        ) : null}

        <label className="text-sm leading-5 text-[#5d6878]">Файл изображения</label>
        <label
          htmlFor={inputId}
          className="flex min-h-16 cursor-pointer items-center justify-between rounded-md border border-dashed border-[#d4dae3] px-4 py-3 text-sm text-[#3b4250]"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              onFileSelect(file);
            }
          }}
        >
          <span className="text-[#6f7a8a]">Выберите файл или перетащите его сюда</span>
          <span className="font-medium text-[#1f6feb]">Выберите файл</span>
        </label>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onFileSelect(file);
            }
            event.currentTarget.value = '';
          }}
        />

        <p className="text-xs leading-4 text-[#6f7a8a]">Формат файла: JPG, PNG, GIF. Не более 5 МБ</p>

        {hasPreview ? (
          <div className="rounded-md border border-dashed border-[#d4dae3] p-2">
            <div className="flex items-start gap-3">
              <img src={previewSrc} alt={fileName || 'preview'} className="h-20 w-28 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[#384253]">{fileName}</p>
                <p className="text-xs text-[#6f7a8a]">{fileSizeLabel}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid w-full grid-cols-2 gap-2">
          <ModalActionButton onClick={onClose} variant="secondary" className="w-full">
            Отменить
          </ModalActionButton>
          <ModalActionButton
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            variant="primary"
            className="w-full"
          >
            Подтвердить
          </ModalActionButton>
        </div>
      </div>
    </div>
  );
}
