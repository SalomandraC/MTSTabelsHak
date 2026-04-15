import { Paperclip, UploadCloud, X } from 'lucide-react';
import { useId, useRef } from 'react';

import { ModalActionButton } from '../../../shared/ui';

type AttachmentUploadModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  files: File[];
  errorMessage: string;
  onClose: () => void;
  onFilesSelect: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSubmit: () => void;
};

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} Б`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} КБ`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

export function AttachmentUploadModal({
  isOpen,
  isSubmitting,
  files,
  errorMessage,
  onClose,
  onFilesSelect,
  onRemoveFile,
  onSubmit
}: AttachmentUploadModalProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black/45" onMouseDown={onClose}>
      <div
        className="fixed left-1/2 top-1/2 flex w-[min(44rem,calc(100vw-1.5rem))] max-w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[14px] border border-[#e8edf5] bg-white p-6 shadow-[0px_4px_24px_rgba(0,0,0,0.12),0px_8px_16px_rgba(0,0,0,0.08)]"
        role="dialog"
        aria-modal="true"
        aria-label="Добавить файлы"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[1.75rem] font-semibold leading-8 text-[#252b36]">
              Добавить файлы
            </h3>
            <p className="mt-1 text-sm text-[#6f7a8a]">
              Перетащите несколько файлов сюда или выберите их с диска.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#f0f2f6] text-[#333845]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMessage ? (
          <div className="rounded-md bg-[#fbece8] px-3 py-2 text-sm text-[#db5d3e]">
            {errorMessage}
          </div>
        ) : null}

        <label
          htmlFor={inputId}
          className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#d4dae3] px-4 py-6 text-center"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const nextFiles = Array.from(event.dataTransfer.files ?? []);
            if (nextFiles.length > 0) {
              onFilesSelect(nextFiles);
            }
          }}
        >
          <UploadCloud className="h-8 w-8 text-[#6f7a8a]" />
          <div>
            <p className="text-sm text-[#3b4250]">Перетащите файлы сюда</p>
            <p className="text-sm text-[#1f6feb] font-medium">
              или нажмите, чтобы выбрать
            </p>
          </div>
        </label>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          aria-label="Добавить файлы"
          className="hidden"
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files ?? []);
            if (nextFiles.length > 0) {
              onFilesSelect(nextFiles);
            }
            event.currentTarget.value = '';
          }}
        />

        <div className="max-h-56 overflow-y-auto rounded-xl border border-[#eef2f7] bg-[#fbfcfe] p-2">
          {files.length > 0 ? (
            <div className="grid gap-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-[#667085]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#252b36]">
                      {file.name}
                    </p>
                    <p className="text-xs text-[#6f7a8a]">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveFile(index)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-[#b00025] hover:bg-[#fff1f3]"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-2 py-6 text-center text-sm text-[#6f7a8a]">
              Пока нет выбранных файлов
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ModalActionButton
            onClick={onClose}
            variant="secondary"
            className="w-full"
          >
            Отменить
          </ModalActionButton>
          <ModalActionButton
            onClick={() => fileInputRef.current?.click()}
            variant="secondary"
            className="w-full"
          >
            Добавить ещё
          </ModalActionButton>
          <ModalActionButton
            onClick={onSubmit}
            disabled={files.length === 0 || isSubmitting}
            variant="primary"
            className="w-full"
          >
            Загрузить
          </ModalActionButton>
        </div>
      </div>
    </div>
  );
}
