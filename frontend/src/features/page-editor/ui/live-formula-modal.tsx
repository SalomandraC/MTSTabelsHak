import { ModalActionButton } from '../../../shared/ui';

type LiveFormulaModalProps = {
  isOpen: boolean;
  expression: string;
  isSubmitDisabled: boolean;
  onExpressionChange: (value: string) => void;
  onPickReference: () => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function LiveFormulaModal({
  isOpen,
  expression,
  isSubmitDisabled,
  onExpressionChange,
  onPickReference,
  onSubmit,
  onClose,
}: LiveFormulaModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Живая формула"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="font-wide text-xl font-semibold">Живая формула</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Введите выражение, например: ([Ref:ds:row:amount] + [Ref:ds:row:tax]) / 2
          </p>
        </div>

        <label className="grid gap-1 text-sm font-semibold">
          Выражение
          <textarea
            value={expression}
            onChange={(event) => onExpressionChange(event.target.value)}
            rows={4}
            className="rounded-xl border border-editor-border-control px-4 py-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            placeholder="([Ref:datasheet:record:field] + 10) * 1.2"
            autoFocus
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPickReference}
            className="inline-flex h-10 items-center rounded-xl border border-[#d8def2] bg-[#f6f8ff] px-3 text-sm font-semibold text-[#3a4f88] transition-colors hover:bg-[#edf2ff]"
          >
            Выбрать ячейку
          </button>
          <span className="text-xs text-editor-text-tertiary">Поддерживаются только числовые значения ячеек.</span>
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
            Вставить
          </ModalActionButton>
        </div>
      </section>
    </div>
  );
}
