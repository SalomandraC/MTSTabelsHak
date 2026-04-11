import type { Editor } from '@tiptap/core';
import { createElement as h, type ReactNode } from 'react';

import type { SlashMenuItem } from '../../slash-menu';

import Sit from '../../../app/images/Sitate.svg';
import Pic from '../../../app/images/Picture.svg';

import {
  List,
  ListOrdered,
  ListChecks,
} from 'lucide-react';

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
    },
  },
  {
    id: 'task-list',
    label: 'Чеклист',
    hint: 'Создать список задач с чекбоксами',
    keywords: ['checklist', 'task', 'todo', 'чеклист', 'задача', 'список задач', 'checkbox'],
    icon: h(ListChecks, { size: 18 }),
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: 'image',
    label: 'Изображение',
    hint: 'Загрузить изображение в документ',
    keywords: ['image', 'img', 'photo', 'картинка', 'изображение', 'фото', 'рисунок'],
    icon: h('img', { src: Pic, alt: "Картинка", className: "h-4 w-4" }), 
    run: () => {
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
    icon: h(List, { size: 18 }),
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: 'ordered-list',
    label: 'Нумерованный список',
    hint: 'Создать список с номерами',
    keywords: ['list', 'numbered', 'ol', 'ordered', 'нумерованный', 'список'],
    icon: h(ListOrdered, { size: 18 }),
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: 'blockquote',
    label: 'Цитата',
    hint: 'Вставить блок цитаты',
    keywords: ['quote', 'blockquote', 'цитата', 'цитирование'],
    icon: h('img', { src: Sit, alt: "Цитата", className: "h-4 w-4" }), 
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
