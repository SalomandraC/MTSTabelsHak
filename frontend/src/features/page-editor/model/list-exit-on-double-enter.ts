import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Selection } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

type SupportedListType = 'bulletList' | 'orderedList' | 'taskList';
type SupportedItemType = 'listItem' | 'taskItem';

type EmptyListExitContext = {
  itemPos: number;
  itemTypeName: SupportedItemType;
  listPos: number;
  listTypeName: SupportedListType;
  rootBlockDepth: number;
  rootBlockNode: ProseMirrorNode;
  rootBlockPos: number;
  itemIndex: number;
};

type ListExitStorage = {
  lastArmedItemPos: number | null;
  lastArmedAt: number;
};

const LIST_EXIT_ARM_WINDOW_MS = 1200;

function getEmptyListExitContext(editor: { state: { selection: Selection; doc: ProseMirrorNode } }): EmptyListExitContext | null {
  const { selection } = editor.state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;

  if (!$from.parent.isTextblock || $from.parent.content.size > 0) {
    return null;
  }

  let itemDepth = -1;
  let listDepth = -1;
  let rootBlockDepth = -1;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeTypeName = $from.node(depth).type.name;

    if (itemDepth < 0 && (nodeTypeName === 'listItem' || nodeTypeName === 'taskItem')) {
      itemDepth = depth;
      continue;
    }

    if (itemDepth >= 0 && listDepth < 0 && (nodeTypeName === 'bulletList' || nodeTypeName === 'orderedList' || nodeTypeName === 'taskList')) {
      listDepth = depth;
      continue;
    }

    if (nodeTypeName === 'rootblock') {
      rootBlockDepth = depth;
      break;
    }
  }

  if (itemDepth < 0 || listDepth < 0 || rootBlockDepth < 0) {
    return null;
  }

  return {
    itemPos: $from.before(itemDepth),
    itemTypeName: $from.node(itemDepth).type.name as SupportedItemType,
    listPos: $from.before(listDepth),
    listTypeName: $from.node(listDepth).type.name as SupportedListType,
    rootBlockDepth,
    rootBlockNode: $from.node(rootBlockDepth),
    rootBlockPos: $from.before(rootBlockDepth),
    itemIndex: $from.index(listDepth),
  };
}

export const ListExitOnDoubleEnter = Extension.create<Record<string, never>, ListExitStorage>({
  name: 'listExitOnDoubleEnter',

  priority: 1100,

  addStorage() {
    return {
      lastArmedItemPos: null,
      lastArmedAt: 0,
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const context = getEmptyListExitContext(this.editor);

        if (!context) {
          this.storage.lastArmedItemPos = null;
          this.storage.lastArmedAt = 0;
          return false;
        }

        const now = Date.now();
        const isSecondPress =
          this.storage.lastArmedItemPos === context.itemPos && now - this.storage.lastArmedAt <= LIST_EXIT_ARM_WINDOW_MS;

        this.storage.lastArmedItemPos = context.itemPos;
        this.storage.lastArmedAt = now;

        if (!isSecondPress) {
          return true;
        }

        const { state, view } = this.editor;
        const { schema } = state;
        const rootBlockType = schema.nodes.rootblock;
        const paragraphType = schema.nodes.paragraph;

        if (!rootBlockType || !paragraphType) {
          return false;
        }

        const rootBlockContent = context.rootBlockNode.firstChild;

        if (!rootBlockContent || rootBlockContent.type.name !== context.listTypeName) {
          return false;
        }

        const listItemsBefore: ProseMirrorNode[] = [];
        const listItemsAfter: ProseMirrorNode[] = [];

        rootBlockContent.forEach((child, _offset, index) => {
          if (child.type.name !== context.itemTypeName) {
            return;
          }

          if (index < context.itemIndex) {
            listItemsBefore.push(child);
            return;
          }

          if (index > context.itemIndex) {
            listItemsAfter.push(child);
          }
        });

        const replacementNodes: ProseMirrorNode[] = [];

        if (listItemsBefore.length > 0) {
          replacementNodes.push(
            rootBlockType.create(
              context.rootBlockNode.attrs,
              [rootBlockContent.type.create(rootBlockContent.attrs, listItemsBefore)],
            ),
          );
        }

        const paragraph = paragraphType.createAndFill();

        if (!paragraph) {
          return false;
        }

        replacementNodes.push(rootBlockType.create(context.rootBlockNode.attrs, [paragraph]));

        if (listItemsAfter.length > 0) {
          replacementNodes.push(
            rootBlockType.create(
              context.rootBlockNode.attrs,
              [rootBlockContent.type.create(rootBlockContent.attrs, listItemsAfter)],
            ),
          );
        }

        const paragraphRootBlockOffset =
          replacementNodes.length > 1 && listItemsBefore.length > 0 ? replacementNodes[0].nodeSize : 0;
        const paragraphSelectionPos = context.rootBlockPos + paragraphRootBlockOffset + 2;

        let tr = state.tr.replaceWith(
          context.rootBlockPos,
          context.rootBlockPos + context.rootBlockNode.nodeSize,
          replacementNodes,
        );

        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(paragraphSelectionPos))).scrollIntoView();

        view.dispatch(tr);

        this.storage.lastArmedItemPos = null;
        this.storage.lastArmedAt = 0;

        return true;
      },
    };
  },
});
