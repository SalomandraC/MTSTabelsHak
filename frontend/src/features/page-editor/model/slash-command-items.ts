import React from 'react';
import type { Editor } from '@tiptap/core';
import type { PluginCatalogItem } from '../../plugins/model/plugin-registry';
import type { SlashMenuItem } from '../../slash-menu';

import List from '../../../app/images/list.svg';
import ListOrdered from '../../../app/images/list-ordered.svg';
import ListChecks from '../../../app/images/list-checks.svg';
import Quote from '../../../app/images/quote.svg';
import AtSign from '../../../app/images/at-sign.svg';
import Picture from '../../../app/images/Picture.svg';
import Table from '../../../app/images/logo.svg';

export type PageEditorSlashCommandItem = SlashMenuItem & {
  run: (editor: Editor) => void;
};

export function getSlashCommandItems(plugins: PluginCatalogItem[]): PageEditorSlashCommandItem[] {
  const canvasEnabled = plugins.some(p => p.id === 'canvas-draw' && p.enabled)
    && (plugins.find(p => p.id === 'canvas-draw')?.settings?.['slash-menu'] ?? true);

  const items: PageEditorSlashCommandItem[] = [
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
      run: () => { /* handled by controller */ },
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
      icon: React.createElement('img', {
        src: Table,
        alt: 'Список с чекбоксами',
        className: 'h-4 w-4',
      }),
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
      run: () => { /* handled by controller */ },
    },
    {
      id: 'template-variable',
      label: 'Параметр шаблона',
      hint: 'Вставить placeholder для будущего шаблона',
      keywords: ['template', 'variable', 'placeholder', 'шаблон', 'параметр', 'placeholder'],
      icon: '{{$}}',
      run: () => {
        // Handled in PageEditor controller with prompt flow.
      },
    },
    {
      id: 'live-reference',
      label: 'Живая переменная',
      hint: 'Привязать inline-значение к ячейке MWS таблицы',
      keywords: ['ref', 'cell', 'live', 'mws', 'ячейка', 'переменная', 'таблица', 'reference'],
      icon: '⦿',
      run: () => {
        // Handled in PageEditor with live reference picker flow.
      },
    },
    {
      id: 'live-formula',
      label: 'Живая формула',
      hint: 'Добавить вычисляемую формулу на основе [Ref:table:row:field]',
      keywords: ['formula', 'calc', 'math', 'live', 'формула', 'вычисление', 'арифметика'],
      icon: 'ƒx',
      run: () => {
        // Handled in PageEditor with live formula modal flow.
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
      run: (editor: Editor) => { editor.chain().focus().toggleHeading({ level: 1 }).run(); },
    },
    {
      id: 'heading-2',
      label: 'Заголовок 2',
      hint: 'Средний заголовок раздела',
      keywords: ['h2', 'subtitle', 'heading', 'подзаголовок', 'заголовок', 'раздел'],
      shortcut: 'H2',
      icon: 'H2',
      run: (editor: Editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); },
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
      run: (editor: Editor) => { editor.chain().focus().setHorizontalRule().run(); },
    },
  ];

  if (canvasEnabled) {
    items.push({
      id: 'canvas-draw',
      label: 'Холст для рисования',
      hint: 'Вставить блок для рисования от руки',
      keywords: ['canvas', 'draw', 'paint', 'рисование', 'холст', 'кисть', 'скетч'],
      icon: '✏️',
      run: (editor: Editor) => { editor.chain().focus().insertCanvasBlock().run(); },
    });
  }

  const iframeEnabled = plugins.some(p => p.id === 'iframe-embed' && p.enabled)
    && (plugins.find(p => p.id === 'iframe-embed')?.settings?.['slash-menu'] ?? true);

  if (iframeEnabled) {
    items.push({
      id: 'iframe',
      label: 'Встраивание (iframe)',
      hint: 'Встроить YouTube, карту или другой внешний контент',
      keywords: ['iframe', 'embed', 'video', 'youtube', 'встраивание', 'видео', 'карта'],
      icon: '▶',
      run: () => {
        // Handled in PageEditor with iframe modal flow.
      },
    });
  }

  const bookmarksEnabled = plugins.some(p => p.id === 'bookmarks' && p.enabled)
    && (plugins.find(p => p.id === 'bookmarks')?.settings?.['slash-menu'] ?? true);

  if (bookmarksEnabled) {
    items.push({
      id: 'bookmark',
      label: 'Закладка',
      hint: 'Создать именованную закладку в тексте',
      keywords: ['bookmark', 'anchor', 'закладка', 'якорь', 'метка'],
      icon: '🔖',
      run: (_editor: Editor) => { /* handled by controller via id */ },
    });
  }

  return items;
}
