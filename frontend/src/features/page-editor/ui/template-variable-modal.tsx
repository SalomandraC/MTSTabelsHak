import { ModalActionButton } from '../../../shared/ui';

type TemplateVariableModalProps = {
  isOpen: boolean;
  label: string;
  description: string;
  isSubmitDisabled: boolean;
  onLabelChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function TemplateVariableModal({
  isOpen,
  label,
  description,
  isSubmitDisabled,
  onLabelChange,
  onDescriptionChange,
  onSubmit,
  onClose,
}: TemplateVariableModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black/35" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 flex w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Параметр шаблона"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="font-wide text-xl font-semibold">Параметр шаблона</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">
            Задайте название и подсказку для placeholder в шаблоне.
          </p>
        </div>

        <label className="grid gap-1 text-sm font-semibold">
          Название параметра
          <input
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            className="h-11 rounded-xl border border-editor-border-control px-4 text-sm font-normal outline-none focus:border-[#7b67ee]"
            placeholder="Например, Название компании"
            autoFocus
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Подсказка
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={3}
            className="rounded-xl border border-editor-border-control px-4 py-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
            placeholder="Что пользователь должен сюда подставить"
          />
        </label>

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
