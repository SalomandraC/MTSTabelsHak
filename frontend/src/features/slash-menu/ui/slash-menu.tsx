import { useMemo } from 'react';

import type { SlashMenuItem } from '../model/types';

type SlashMenuProps = {
  isOpen: boolean;
  query: string;
  items: SlashMenuItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (item: SlashMenuItem) => void;
  onHover: (index: number) => void;
};

export function SlashMenu({
  isOpen,
  query,
  items,
  selectedIndex,
  position,
  onSelect,
  onHover,
}: SlashMenuProps) {
  const visibleItems = useMemo(() => {
    if (!query) {
      return items;
    }

    const normalized = query.toLowerCase().trim();

    return items.filter((item) => {
      return (
        item.label.toLowerCase().includes(normalized) ||
        item.keywords.some((keyword) => keyword.includes(normalized))
      );
    });
  }, [items, query]);

  if (!isOpen || visibleItems.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed z-[60] max-h-[min(18rem,46vh)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-editor-border-subtle bg-white p-1.5 shadow-[0_12px_28px_rgba(17,25,40,0.14)] max-sm:left-3 max-sm:w-[calc(100vw-1.5rem)]"
      style={{ top: position.top, left: position.left }}
      role="listbox"
    >
      {visibleItems.map((item, index) => {
        const active = index === selectedIndex;

        return (
          <button
            key={item.id}
            type="button"
            className={[
              'flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-2 text-left transition-colors',
              active ? 'bg-[#f2f6ff]' : 'hover:bg-[#f2f6ff]',
            ]
              .join(' ')
              .trim()}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item);
            }}
          >
            <span
              className="inline-flex h-[1.85rem] w-[1.85rem] shrink-0 items-center justify-center rounded-lg border border-editor-border-control bg-[#f6f8fb] text-[0.68rem] font-bold text-[#3b4453]"
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm leading-4 text-editor-text-primary">{item.label}</span>
              <span className="truncate text-xs leading-4 text-editor-text-tertiary">{item.hint}</span>
            </span>
            <span className="shrink-0 pl-1 text-[0.7rem] text-[#98a0ae]">{item.shortcut ?? '/'}</span>
          </button>
        );
      })}
    </div>
  );
}
