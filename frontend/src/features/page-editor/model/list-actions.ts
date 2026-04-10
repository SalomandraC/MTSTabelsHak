import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

type ListTypeName = 'bulletList' | 'orderedList' | 'taskList';

/** Get rootblock nodes within selection. */
function getSelectedRootBlocks(editor: Editor): Array<{ pos: number; node: ProseMirrorNode }> {
  const { state } = editor;
  const { selection, schema, doc } = state;
  const rootBlockType = schema.nodes.rootblock;

  if (!rootBlockType || selection.empty) {
    return [];
  }

  const selectedRootBlocks: Array<{ pos: number; node: ProseMirrorNode }> = [];

  doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
    if (node.type === rootBlockType && parent === doc) {
      selectedRootBlocks.push({ pos, node });
    }
  });

  return selectedRootBlocks;
}

/** Unwrap selection from list back to paragraphs. */
function unwrapSelectionFromList(editor: Editor, listTypeName: ListTypeName): boolean {
  const { state, view } = editor;
  const { selection, schema } = state;

  if (selection.empty) {
    return false;
  }

  const selectedRootBlocks = getSelectedRootBlocks(editor);
  if (selectedRootBlocks.length === 0) {
    return false;
  }

  const rootBlockType = schema.nodes.rootblock;
  const paragraphType = schema.nodes.paragraph;
  const listType = schema.nodes[listTypeName];

  if (!rootBlockType || !paragraphType || !listType) {
    return false;
  }

  // Unwrap only if all selected blocks are exactly this list type
  if (!selectedRootBlocks.every(({ node }) => node.firstChild?.type === listType)) {
    return false;
  }

  let hasSelectedItems = false;
  let tr = state.tr;

  [...selectedRootBlocks]
    .sort((a, b) => b.pos - a.pos)
    .forEach(({ pos, node }) => {
      const listNode = node.firstChild;
      if (!listNode) {
        return;
      }

      const listPos = pos + 1;
      const selectedIndexes = new Set<number>();

      listNode.forEach((item, offset, index) => {
        const itemFrom = listPos + 1 + offset;
        const itemTo = itemFrom + item.nodeSize;
        const intersectsSelection = itemFrom < selection.to && itemTo > selection.from;

        if (intersectsSelection) {
          selectedIndexes.add(index);
        }
      });

      if (selectedIndexes.size === 0) {
        return;
      }

      hasSelectedItems = true;
      const replacementNodes: ProseMirrorNode[] = [];
      let pendingListItems: ProseMirrorNode[] = [];

      listNode.forEach((item, _offset, index) => {
        const isSelected = selectedIndexes.has(index);

        if (!isSelected) {
          pendingListItems.push(item);
          return;
        }

        if (pendingListItems.length > 0) {
          replacementNodes.push(rootBlockType.create(null, [listType.create(listNode.attrs, pendingListItems)]));
          pendingListItems = [];
        }

        const paragraphSource = item.firstChild;
        const paragraphContent = paragraphSource?.type === paragraphType ? paragraphSource.content : item.textContent ? schema.text(item.textContent) : null;
        const paragraphNode = paragraphType.create(
          paragraphSource?.type === paragraphType ? paragraphSource.attrs : null,
          paragraphContent,
        );

        replacementNodes.push(rootBlockType.create(null, [paragraphNode]));
      });

      if (pendingListItems.length > 0) {
        replacementNodes.push(rootBlockType.create(null, [listType.create(listNode.attrs, pendingListItems)]));
      }

      if (replacementNodes.length > 0) {
        tr = tr.replaceWith(pos, pos + node.nodeSize, replacementNodes);
      }
    });

  if (!hasSelectedItems) {
    return false;
  }

  tr = tr.scrollIntoView();
  view.dispatch(tr);
  editor.commands.focus(Math.max(1, selectedRootBlocks[0].pos + 2));
  return true;
}

/** Convert selection to list. */
function convertSelectionToList(editor: Editor, listTypeName: ListTypeName): boolean {
  const { state, view } = editor;
  const { selection, schema, doc } = state;

  if (selection.empty) {
    return false;
  }

  const rootBlockType = schema.nodes.rootblock;
  const paragraphType = schema.nodes.paragraph;
  const listType = schema.nodes[listTypeName];
  const itemType = listTypeName === 'taskList' ? schema.nodes.taskItem : schema.nodes.listItem;

  if (!rootBlockType || !paragraphType || !listType || !itemType) {
    return false;
  }

  // All possible list types
  const allListTypes: Array<keyof typeof schema.nodes> = ['bulletList', 'orderedList', 'taskList'];

  const selectedRootBlocks = getSelectedRootBlocks(editor);

  if (selectedRootBlocks.length === 0) {
    return false;
  }

  // Check if selected rootblocks contain lists of any type
  const hasExistingList = selectedRootBlocks.some(({ node }) => {
    const fc = node.firstChild;
    return fc && allListTypes.includes(fc.type.name);
  });

  if (hasExistingList) {
    // Convert between list types: each old list item becomes a new list item
    const allListItems: ProseMirrorNode[] = [];

    for (const { node } of selectedRootBlocks) {
      const oldList = node.firstChild;
      if (!oldList || !allListTypes.includes(oldList.type.name)) {
        // Not a list — convert as paragraph
        const text = (oldList?.textContent ?? '').trim();
        const paragraphContent = text ? state.schema.text(text) : null;
        const paragraph = paragraphType.create(
          oldList?.type === paragraphType ? oldList.attrs : null,
          oldList?.type === paragraphType ? oldList.content : paragraphContent,
        );

        if (listTypeName === 'taskList') {
          allListItems.push(itemType.create({ checked: false }, [paragraph]));
        } else {
          allListItems.push(itemType.create(null, [paragraph]));
        }
        continue;
      }

      // It's a list — expand each item into a separate listItem
      oldList.forEach((oldItem) => {
        const innerNode = oldItem.firstChild;

        // Preserve checked attribute for taskList
        const attrs = listTypeName === 'taskList'
          ? { checked: (oldItem.attrs.checked as boolean) ?? false }
          : null;

        if (innerNode && innerNode.type === paragraphType) {
          if (listTypeName === 'taskList') {
            allListItems.push(itemType.create(attrs, [innerNode.copy(innerNode.content)]));
          } else {
            allListItems.push(itemType.create(null, [innerNode.copy(innerNode.content)]));
          }
        } else if (innerNode) {
          const text = (innerNode.textContent ?? '').trim();
          const paragraphContent = text ? state.schema.text(text) : null;
          const paragraph = paragraphType.create(null, paragraphContent);
          if (listTypeName === 'taskList') {
            allListItems.push(itemType.create(attrs, [paragraph]));
          } else {
            allListItems.push(itemType.create(null, [paragraph]));
          }
        }
      });
    }

    if (allListItems.length === 0) {
      return false;
    }

    const from = selectedRootBlocks[0].pos;
    const last = selectedRootBlocks[selectedRootBlocks.length - 1];
    const to = last.pos + last.node.nodeSize;
    const newList = listType.create(null, allListItems);
    const newRootBlock = rootBlockType.create(null, [newList]);

    let tr = state.tr.replaceWith(from, to, newRootBlock);
    tr = tr.scrollIntoView();
    view.dispatch(tr);
    editor.commands.focus(from + 2);

    return true;
  }

  // Standard logic: paragraphs → list
  const listItems = selectedRootBlocks
    .map(({ node }) => {
      const firstChild = node.firstChild;
      const text = (firstChild?.textContent ?? '').trim();
      const paragraphContent = text ? state.schema.text(text) : null;
      const paragraph = paragraphType.create(
        firstChild?.type === paragraphType ? firstChild.attrs : null,
        firstChild?.type === paragraphType ? firstChild.content : paragraphContent,
      );

      if (listTypeName === 'taskList') {
        return itemType.create({ checked: false }, [paragraph]);
      }

      return itemType.create(null, [paragraph]);
    })
    .filter(Boolean);

  if (listItems.length === 0) {
    return false;
  }

  const from = selectedRootBlocks[0].pos;
  const last = selectedRootBlocks[selectedRootBlocks.length - 1];
  const to = last.pos + last.node.nodeSize;
  const listNode = listType.create(null, listItems);
  const newRootBlock = rootBlockType.create(null, [listNode]);

  let tr = state.tr.replaceWith(from, to, newRootBlock);
  tr = tr.scrollIntoView();
  view.dispatch(tr);
  editor.commands.focus(from + 2);

  return true;
}

/** Smart list handling: unwrap → convert → fallback toggle. */
export function handleListAction(editor: Editor, listTypeName: ListTypeName): void {
  if (unwrapSelectionFromList(editor, listTypeName)) {
    return;
  }

  if (convertSelectionToList(editor, listTypeName)) {
    return;
  }

  // Fallback for single cursor
  if (listTypeName === 'bulletList') {
    editor.chain().focus().toggleBulletList().run();
    return;
  }

  if (listTypeName === 'orderedList') {
    editor.chain().focus().toggleOrderedList().run();
    return;
  }

  editor.chain().focus().toggleTaskList().run();
}
