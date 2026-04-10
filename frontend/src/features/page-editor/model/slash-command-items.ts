import type { Editor } from '@tiptap/core';

import type { SlashMenuItem } from '../../slash-menu';

export type PageEditorSlashCommandItem = SlashMenuItem & {
  run: (editor: Editor) => void;
};

export const slashCommandItems: PageEditorSlashCommandItem[] = [
  {
    id: 'text',
    label: 'Text',
    hint: 'Start writing with plain text',
    keywords: ['text', 'paragraph', 'body'],
    icon: 'T',
    run: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    id: 'link',
    label: 'Ссылка',
    hint: 'Добавить ссылку с текстом',
    keywords: ['ссылка', 'линк', 'link', 'url', 'href'],
    icon: 'L',
    run: () => {
      // Handled in PageEditor with modal flow.
    },
  },
  {
    id: 'task-list',
    label: 'Чеклист',
    hint: 'Создать список задач с чекбоксами',
    keywords: ['checklist', 'task', 'todo', 'чеклист', 'задача'],
    icon: '[]',
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: 'image',
    label: 'Изображение',
    hint: 'Загрузить изображение в документ',
    keywords: ['image', 'img', 'photo', 'картинка', 'изображение'],
    icon: '🖼',
    run: () => {
      // Handled in PageEditor with modal flow.
    },
  },
  {
    id: 'root-block',
    label: 'Блок',
    hint: 'Добавить перетаскиваемый блок как в Notion',
    keywords: ['block', 'root', 'section', 'блок', 'секция', 'notion'],
    icon: '+',
    run: (editor) => {
      editor.chain().focus().insertRootBlock().run();
    },
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    hint: 'Big section title',
    keywords: ['h1', 'title', 'heading'],
    shortcut: 'H1',
    icon: 'H1',
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    hint: 'Medium section title',
    keywords: ['h2', 'subtitle', 'heading'],
    shortcut: 'H2',
    icon: 'H2',
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    id: 'bullet-list',
    label: 'Bulleted list',
    hint: 'Create a bullet list',
    keywords: ['list', 'bullet', 'ul'],
    icon: 'UL',
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    hint: 'Create an ordered list',
    keywords: ['list', 'numbered', 'ol'],
    icon: 'OL',
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: 'blockquote',
    label: 'Quote',
    hint: 'Insert a quote block',
    keywords: ['quote', 'blockquote'],
    icon: '"',
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: 'code-block',
    label: 'Code block',
    hint: 'Display code with formatting',
    keywords: ['code', 'snippet', 'pre'],
    icon: '</>',
    run: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Insert a horizontal line',
    keywords: ['divider', 'rule', 'line'],
    icon: '---',
    run: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
];
