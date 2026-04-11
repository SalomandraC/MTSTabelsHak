import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

type ScrollAreaVariant = 'page' | 'table';

type ScrollAreaProps = ComponentPropsWithoutRef<'div'> & {
  variant?: ScrollAreaVariant;
};

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { className, variant = 'page', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={joinClassNames('scroll-area', variant === 'table' ? 'scroll-area--table' : 'scroll-area--page', className)}
      {...props}
    />
  );
});
