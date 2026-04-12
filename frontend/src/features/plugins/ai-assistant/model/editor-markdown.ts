import type { Editor } from '@tiptap/core';

export function getEditorMarkdown(editor: Editor | null): string {
  if (!editor) {
    return '';
  }

  const markdownStorage = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown;

  if (markdownStorage?.getMarkdown) {
    return markdownStorage.getMarkdown();
  }

  return editor.getText();
}
