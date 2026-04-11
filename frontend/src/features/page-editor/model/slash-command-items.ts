import React from 'react';
import type { Editor } from '@tiptap/core';

import type { SlashMenuItem } from '../../slash-menu';

export type PageEditorSlashCommandItem = SlashMenuItem & {
  run: (editor: Editor) => void;
};

import List from '../../../app/images/list.svg';
import ListOrdered from '../../../app/images/list-ordered.svg';
import ListChecks from '../../../app/images/list-checks.svg';
import Quote from '../../../app/images/quote.svg';
import AtSign from '../../../app/images/at-sign.svg';
import Picture from '../../../app/images/Picture.svg';

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
    icon: React.createElement('img', {
      src: AtSign,
      alt: 'Собачка',
      className: 'h-4 w-4',
    }),
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
    icon: React.createElement('img', {
      src: ListChecks,
      alt: 'Список с чекбоксами',
      className: 'h-4 w-4',
    }),
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: 'image',
    label: 'Изображение',
    hint: 'Загрузить изображение в документ',
    keywords: ['image', 'img', 'photo', 'картинка', 'изображение', 'фото', 'рисунок'],
    icon: React.createElement('img', {
      src: Picture,
      alt: 'Картинка',
      className: 'h-4 w-4',
    }),
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
    icon: React.createElement('img', {
      src: List,
      alt: 'Список',
      className: 'h-4 w-4',
    }),
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: 'ordered-list',
    label: 'Нумерованный список',
    hint: 'Создать список с номерами',
    keywords: ['list', 'numbered', 'ol', 'ordered', 'нумерованный', 'список'],
    icon: React.createElement('img', {
      src: ListOrdered,
      alt: 'Список нумерованный',
      className: 'h-4 w-4',
    }),
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: 'blockquote',
    label: 'Цитата',
    hint: 'Вставить блок цитаты',
    keywords: ['quote', 'blockquote', 'цитата', 'цитирование'],
    icon: React.createElement('img', {
      src: Quote,
      alt: 'Цитата',
      className: 'h-4 w-4',
    }),
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
