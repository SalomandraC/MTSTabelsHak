import { Mark, mergeAttributes } from '@tiptap/core';

// ─── Bookmark anchor (mark on selected text) ───────────────────────────────

export type BookmarkAttrs = {
  id: string;
  label: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (attrs: BookmarkAttrs) => ReturnType;
      unsetBookmark: () => ReturnType;
    };
  }
}

export const Bookmark = Mark.create({
  name: 'bookmark',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-bookmark-id'),
        renderHTML: (attrs) => ({ 'data-bookmark-id': attrs.id }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-bookmark-label') ?? '',
        renderHTML: (attrs) => ({ 'data-bookmark-label': attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-bookmark-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'bookmark-anchor' }),
      0,
    ];
  },

  addCommands() {
    return {
      setBookmark:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetBookmark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

// ─── BookmarkLink (mark on selected text that links to a bookmark) ──────────

export type BookmarkLinkAttrs = {
  bookmarkId: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmarkLink: {
      setBookmarkLink: (attrs: BookmarkLinkAttrs) => ReturnType;
      unsetBookmarkLink: () => ReturnType;
    };
  }
}

export const BookmarkLink = Mark.create({
  name: 'bookmarkLink',
  inclusive: false,

  addAttributes() {
    return {
      bookmarkId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-bookmark-href'),
        renderHTML: (attrs) => ({ 'data-bookmark-href': attrs.bookmarkId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-bookmark-href]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'bookmark-link' }),
      0,
    ];
  },

  addCommands() {
    return {
      setBookmarkLink:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetBookmarkLink:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
