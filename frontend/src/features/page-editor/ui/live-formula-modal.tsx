import { createPortal } from 'react-dom';

import { ModalActionButton } from '../../../shared/ui';

type LiveFormulaModalProps = {
  isOpen: boolean;
  expression: string;
  isSubmitDisabled: boolean;
  submitLabel?: string;
  onExpressionChange: (value: string) => void;
  onPickReference: () => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function LiveFormulaModal({
  isOpen,
  expression,
  isSubmitDisabled,
  submitLabel = 'Вставить',
  onExpressionChange,
  onPickReference,
  onSubmit,
  onClose,
}: LiveFormulaModalProps) {
  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-[rgba(17,24,39,0.38)] p-3 sm:p-6" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex h-[92vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_rgba(17,24,39,0.26)]"
        role="dialog"
        aria-modal="true"
        aria-label="Живая формула"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-[#b00025] bg-[#d70032] px-4 py-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
                Живая формула
              </div>
              <h3 className="mt-3 font-wide text-xl font-semibold sm:text-2xl">Живая формула</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/84">
                Введите выражение, например: ([Ref:ds:row:amount] + [Ref:ds:row:tax]) / 2
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть живую формулу"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white transition-colors hover:bg-white/18"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7f9] px-4 py-4 sm:px-6">
          <div className="space-y-4 rounded-[20px] border border-[#dfe5ee] bg-white p-4 shadow-[0_10px_24px_rgba(17,24,39,0.05)] sm:p-5">
            <label className="grid gap-1 text-sm font-semibold text-editor-text-primary">
              Выражение
              <textarea
                value={expression}
                onChange={(event) => onExpressionChange(event.target.value)}
                rows={5}
                className="rounded-xl border border-editor-border-control px-4 py-3 text-sm font-normal outline-none focus:border-[#d70032]"
                placeholder="([Ref:datasheet:record:field] + 10) * 1.2"
                autoFocus
              />
            </label>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#ffd2d9] bg-[#fff7f8] px-4 py-3">
              <button
                type="button"
                onClick={onPickReference}
                className="inline-flex h-10 items-center rounded-xl border border-[#f0b6c2] bg-white px-3 text-sm font-semibold text-[#b00025] transition-colors hover:bg-[#fff0f3]"
              >
                Выбрать ячейку
              </button>
              <span className="text-xs text-[#8b6070]">Поддерживаются только числовые значения ячеек.</span>
            </div>

            <div className="grid w-full grid-cols-2 gap-2">
              <ModalActionButton onClick={onClose} variant="secondary" className="w-full">
                Отмена
              </ModalActionButton>
              <ModalActionButton
                onClick={onSubmit}
                disabled={isSubmitDisabled}
                variant="primary"
                className="w-full"
              >
                {submitLabel}
              </ModalActionButton>
            </div>
          </div>
        </div>
      </section>
    </div>
    ,
    document.body,
  );
}
