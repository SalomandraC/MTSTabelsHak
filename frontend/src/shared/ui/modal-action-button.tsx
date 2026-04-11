import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ModalActionButtonVariant = 'primary' | 'secondary';
type ModalActionButtonSize = 'sm' | 'md';

type ModalActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ModalActionButtonVariant;
  size?: ModalActionButtonSize;
  fullWidth?: boolean;
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function ModalActionButton({
  children,
  className,
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  ...props
}: ModalActionButtonProps) {
  return (
    <button
      type={type}
      className={joinClasses(
        'modal-action-button',
        variant === 'primary' ? 'modal-action-primary' : 'modal-action-secondary',
        size === 'sm' ? 'modal-action-button-sm' : 'modal-action-button-md',
        fullWidth ? 'w-full' : '',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
