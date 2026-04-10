import Image from '@tiptap/extension-image';
import { NodeSelection, Plugin } from '@tiptap/pm/state';

export type ImageAlign = 'left' | 'center' | 'right';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      setImageAlign: (align: ImageAlign) => ReturnType;
      setImageAlignInSelection: (align: ImageAlign) => ReturnType;
    };
  }
}

export const ImageBlock = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: (element) => (element.getAttribute('data-align') as ImageAlign | null) ?? 'left',
        renderHTML: (attributes) => ({
          'data-align': attributes.align ?? 'left',
        }),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageAlign:
        (align: ImageAlign) =>
        ({ state, dispatch }) => {
          const { selection } = state;

          if (selection instanceof NodeSelection && selection.node.type.name === this.name) {
            if (dispatch) {
              dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, align }));
            }
            return true;
          }

          return false;
        },
      setImageAlignInSelection:
        (align: ImageAlign) =>
        ({ state, dispatch }) => {
          const { selection, doc } = state;
          let updated = false;
          let tr = state.tr;

          if (selection instanceof NodeSelection && selection.node.type.name === this.name) {
            tr = tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, align });
            updated = true;
          }

          doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (node.type.name !== this.name) {
              return;
            }

            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
            updated = true;
          });

          if (!updated) {
            return false;
          }

          if (dispatch) {
            dispatch(tr);
          }

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClickOn: (view, _pos, node, nodePos) => {
            if (node.type.name !== this.name) {
              return false;
            }

            const selection = NodeSelection.create(view.state.doc, nodePos);
            view.dispatch(view.state.tr.setSelection(selection));
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
});
