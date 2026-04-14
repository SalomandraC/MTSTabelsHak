import type { SlashMenuItem } from '../model/types';

type SlashMenuProps = {
  isOpen: boolean;
  items: SlashMenuItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (item: SlashMenuItem) => void;
  onHover: (index: number) => void;
};

export function SlashMenu({
  isOpen,
  items,
  selectedIndex,
  position,
  onSelect,
  onHover,
}: SlashMenuProps) {
  if (!isOpen || items.length === 0) {
    return null;
  }

  return (
    <div
      className="slash-menu-scroll absolute z-[60] max-h-[min(18rem,46vh)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-editor-border-subtle bg-white p-1.5 shadow-[0_12px_28px_rgba(17,25,40,0.14)] max-sm:left-3 max-sm:w-[calc(100vw-1.5rem)]"
      style={{ top: position.top, left: position.left }}
      role="listbox"
      aria-label="Slash menu"
    >
      {items.map((item, index) => {
        const active = index === selectedIndex;

        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={active} 
            className={[
              'group flex w-full items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 py-2 text-left transition-all',
              active
                ? 'bg-[#eaf1ff] border-[#d5e2ff] shadow-[inset_0_0_0_1px_rgba(110,145,214,0.22)]'
                : 'hover:bg-[#f4f8ff] hover:border-[#d9e5ff]',
            ]
              .join(' ')
              .trim()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(item)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item);
            }}
          >
            <span
              className={[
                'inline-flex h-[1.85rem] w-[1.85rem] shrink-0 items-center justify-center rounded-lg border text-[0.68rem] font-bold transition-colors',
                active
                  ? 'border-[#c8d8f6] bg-[#e2ecff] text-[#2f4d86]'
                  : 'border-editor-border-control bg-[#f6f8fb] text-[#3b4453] group-hover:border-[#cfdcf6] group-hover:bg-[#edf3ff]',
              ]
                .join(' ')
                .trim()}
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
