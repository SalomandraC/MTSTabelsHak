import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export type CommentAnchorAttrs = {
  threadId: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentAnchor: {
      setCommentAnchor: (attrs: CommentAnchorAttrs) => ReturnType;
      removeCommentAnchor: (threadId: string) => ReturnType;
    };
  }
}

type CommentAnchorOptions = {
  onOpenThread?: (threadId: string) => void;
};

export const CommentAnchor = Mark.create<CommentAnchorOptions>({
  name: 'commentAnchor',
  inclusive: false,

  addOptions() {
    return {
      onOpenThread: undefined,
    };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-thread-id'),
        renderHTML: (attributes) => ({ 'data-comment-thread-id': attributes.threadId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-thread-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'comment-anchor',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCommentAnchor:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },
      removeCommentAnchor:
        (threadId) =>
        ({ state, dispatch }) => {
          const markType = state.schema.marks[this.name];

          if (!markType) {
            return false;
          }

          let tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (!node.isText) {
              return;
            }

            const hasThreadMark = node.marks.some((mark) => mark.type === markType && mark.attrs.threadId === threadId);
            if (hasThreadMark) {
              tr = tr.removeMark(pos, pos + node.nodeSize, markType);
            }
          });

          if (!tr.docChanged) {
            return false;
          }

          dispatch?.(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('commentAnchorClickHandler'),
        props: {
          handleClick: (_view, _pos, event) => {
            const target = event.target instanceof HTMLElement
              ? event.target.closest<HTMLElement>('[data-comment-thread-id]')
              : null;
            const threadId = target?.dataset.commentThreadId;

            if (!threadId) {
              return false;
            }

            this.options.onOpenThread?.(threadId);
            return true;
          },
        },
      }),
    ];
  },
});
