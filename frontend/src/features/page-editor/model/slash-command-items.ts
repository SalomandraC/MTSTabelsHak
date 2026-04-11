import type { Editor } from '@tiptap/core';

import type { SlashMenuItem } from '../../slash-menu';

export type PageEditorSlashCommandItem = SlashMenuItem & {
  run: (editor: Editor) => void;
};

export const slashCommandItems: PageEditorSlashCommandItem[] = [
  {
    id: 'text',
    label: 'Текст',
    hint: 'Начать ввод с обычного текста',
    keywords: ['text', 'paragraph', 'body', 'текст', 'абзац', 'параграф'],
    icon: 'T',
    run: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    id: 'link',
    label: 'Ссылка',
    hint: 'Добавить ссылку с текстом',
    keywords: ['ссылка', 'линк', 'link', 'url', 'href', 'гиперссылка'],
    icon: 'L',
    run: () => {
      // Handled in PageEditor with modal flow.
    },
  },
  {
    id: 'page-link',
    label: 'Страница',
    hint: 'Вставить ссылку на wiki-страницу',
    keywords: ['page', 'wiki', 'страница', 'вики', 'backlink', 'связь'],
    icon: '@',
    run: () => {
      // Handled in PageEditor with page picker flow.
    },
  },
  {
    id: 'mws-table',
    label: 'MWS таблица',
    hint: 'Вставить live embed существующей таблицы',
    keywords: ['table', 'mws', 'таблица', 'embed', 'live', 'datasheet'],
    icon: 'Tbl',
    run: () => {
      // Handled in PageEditor with table picker flow.
    },
  },
  {
    id: 'ai-generate',
    label: 'AI: Сгенерировать',
    hint: 'Сгенерировать блок контента по prompt',
    keywords: ['ai', 'generate', 'gpt', 'генерация', 'контент', 'текст'],
    icon: 'AI',
    run: () => {
      // Handled in PageEditor controller with prompt flow.
    },
  },
  {
    id: 'task-list',
    label: 'Чеклист',
    hint: 'Создать список задач с чекбоксами',
    keywords: ['checklist', 'task', 'todo', 'чеклист', 'задача', 'список задач', 'checkbox'],
    icon: '[]',
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: 'image',
    label: 'Изображение',
    hint: 'Загрузить изображение в документ',
    keywords: ['image', 'img', 'photo', 'картинка', 'изображение', 'фото', 'рисунок'],
    icon: '🖼',
    run: () => {
      // Handled in PageEditor with modal flow.
    },
  },
  {
    id: 'heading-1',
    label: 'Заголовок 1',
    hint: 'Крупный заголовок раздела',
    keywords: ['h1', 'title', 'heading', 'заголовок', 'раздел', 'титул'],
    shortcut: 'H1',
    icon: 'H1',
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    id: 'heading-2',
    label: 'Заголовок 2',
    hint: 'Средний заголовок раздела',
    keywords: ['h2', 'subtitle', 'heading', 'подзаголовок', 'заголовок', 'раздел'],
    shortcut: 'H2',
    icon: 'H2',
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    id: 'bullet-list',
    label: 'Маркированный список',
    hint: 'Создать список с маркерами',
    keywords: ['list', 'bullet', 'ul', 'unordered', 'маркированный', 'список'],
    icon: 'UL',
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: 'ordered-list',
    label: 'Нумерованный список',
    hint: 'Создать список с номерами',
    keywords: ['list', 'numbered', 'ol', 'ordered', 'нумерованный', 'список'],
    icon: 'OL',
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: 'blockquote',
    label: 'Цитата',
    hint: 'Вставить блок цитаты',
    keywords: ['quote', 'blockquote', 'цитата', 'цитирование'],
    icon: '"',
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: 'divider',
    label: 'Разделитель',
    hint: 'Вставить горизонтальную линию',
    keywords: ['divider', 'rule', 'line', 'разделитель', 'линия'],
    icon: '---',
    run: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
];
