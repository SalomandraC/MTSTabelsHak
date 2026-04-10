import { Extension, textInputRule } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';

import { ImageBlock } from './image-block';
import { RootBlock } from './root-block';

const DashShortcut = Extension.create({
  name: 'dashShortcut',
  addInputRules() {
    return [
      textInputRule({
        find: /--$/,
        replace: '—',
      }),
    ];
  },
});

export const initialContent = `
<h1>Новая страница</h1>
<p></p>
`;

export function createPageEditorExtensions() {
  return [
    TextStyle,
    Highlight,
    Typography,
    DashShortcut,
    RootBlock,
    ImageBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'taskItem'],
    }),
    StarterKit,
    Placeholder.configure({
      emptyEditorClass: 'is-editor-empty',
      placeholder: 'Начните вводить содержимое или нажмите / чтобы использовать команды',
    }),
  ];
}
