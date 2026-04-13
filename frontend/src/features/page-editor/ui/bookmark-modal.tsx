import type { Editor } from '@tiptap/core';
import { Bookmark } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─── Create Bookmark Modal ──────────────────────────────────────────────────

type CreateBookmarkModalProps = {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  onConfirm: (label: string) => void;
  onClose: () => void;
};

export function CreateBookmarkModal({
  isOpen,
  anchorRect,
  onConfirm,
  onClose,
}: CreateBookmarkModalProps) {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLabel('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  const GAP = 8;
  const W = 272;
  let left = anchorRect.left;
  let top = anchorRect.bottom + GAP;
  if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
  if (left < 8) left = 8;
  if (top + 120 > window.innerHeight) top = anchorRect.top - 120 - GAP;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (label.trim()) onConfirm(label.trim());
  };

  return createPortal(
    <div
      style={{ position: 'fixed', top, left, zIndex: 9999, width: W }}
      className="rounded-xl border border-editor-border-control bg-white p-3 shadow-lg"
      role="dialog"
      aria-label="Создать закладку"
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-editor-text-secondary">
        <Bookmark className="h-3.5 w-3.5" />
        Название закладки
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Например, Введение"
          className="h-8 flex-1 rounded-md border border-editor-border-control px-2 text-sm outline-none focus:border-[#ff0037]"
        />
        <button
          type="submit"
          disabled={!label.trim()}
          className="h-8 rounded-md bg-[#ff0037] px-3 text-xs font-semibold text-white disabled:opacity-40"
        >
          OK
        </button>
      </form>
    </div>,
    document.body,
  );
}

// ─── Bookmark Picker Modal (pick existing bookmark to link to) ──────────────

type BookmarkEntry = { id: string; label: string };

type BookmarkPickerModalProps = {
  isOpen: boolean;
  anchorRect: DOMRect | null;
  bookmarks: BookmarkEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function BookmarkPickerModal({
  isOpen,
  anchorRect,
  bookmarks,
  onSelect,
  onClose,
}: BookmarkPickerModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  const GAP = 8;
  const W = 240;
  let left = anchorRect.left;
  let top = anchorRect.bottom + GAP;
  if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
  if (left < 8) left = 8;
  if (top + 200 > window.innerHeight) top = anchorRect.top - 200 - GAP;

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top, left, zIndex: 9999, width: W }}
      className="rounded-xl border border-editor-border-control bg-white py-1 shadow-lg"
      role="dialog"
      aria-label="Выбрать закладку"
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-editor-text-tertiary">
        Ссылка на закладку
      </div>
      {bookmarks.length === 0 ? (
        <div className="px-3 py-2 text-xs text-editor-text-tertiary">
          Нет закладок на этой странице
        </div>
      ) : (
        bookmarks.map((bm) => (
          <button
            key={bm.id}
            type="button"
            onClick={() => onSelect(bm.id)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[#f5f7fa]"
          >
            <Bookmark className="h-3.5 w-3.5 shrink-0 text-[#7b67ee]" />
            {bm.label}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}

// ─── Utility: collect all bookmarks from editor ─────────────────────────────

export function collectBookmarks(editor: Editor): BookmarkEntry[] {
  const bookmarks: BookmarkEntry[] = [];
  if (!editor.state?.doc?.descendants) return bookmarks;
  editor.state.doc.descendants((node) => {
    node.marks.forEach((mark) => {
      if (mark.type.name === 'bookmark' && mark.attrs.id) {
        if (!bookmarks.find((b) => b.id === mark.attrs.id)) {
          bookmarks.push({ id: mark.attrs.id as string, label: (mark.attrs.label as string) || mark.attrs.id });
        }
      }
    });
  });
  return bookmarks;
}

// ─── Click handler: scroll to bookmark ──────────────────────────────────────

export function scrollToBookmark(editor: Editor, bookmarkId: string) {
  const view = editor.view;
  let targetPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (targetPos !== null) return false;
    node.marks.forEach((mark) => {
      if (mark.type.name === 'bookmark' && mark.attrs.id === bookmarkId) {
        targetPos = pos;
      }
    });
  });

  if (targetPos === null) return;

  const coords = view.coordsAtPos(targetPos);
  window.scrollTo({ top: coords.top + window.scrollY - 80, behavior: 'smooth' });

  // Also scroll the editor container if needed
  const dom = view.nodeDOM(targetPos) as HTMLElement | null;
  dom?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
