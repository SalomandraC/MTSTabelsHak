import type { Editor } from '@tiptap/core';

export function ensureBoundaryBlocksAfterInsert(editor: Editor) {
  const { selection } = editor.state;
  const { $from } = selection;
  let rootBlockDepth = -1;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'rootblock') {
      rootBlockDepth = depth;
      break;
    }
  }

  if (rootBlockDepth >= 0) {
    const rootBlockStart = $from.start(rootBlockDepth);
    const rootBlockEnd = $from.after(rootBlockDepth);
    const docSize = editor.state.doc.content.size;
    const shouldInsertAbove = rootBlockStart === 1;
    const shouldInsertBelow = rootBlockEnd === docSize;

    if (shouldInsertBelow) {
      editor.chain().focus().setTextSelection(rootBlockEnd).insertRootBlock().run();
    }

    if (shouldInsertAbove) {
      editor.chain().focus().setTextSelection(rootBlockStart).insertRootBlock().run();
    }
  } else {
    editor.commands.insertRootBlock();
  }
}
