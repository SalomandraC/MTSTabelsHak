import type { Editor } from '@tiptap/core';
import type { PluginCatalogItem } from '../../plugins/model/plugin-registry';
import type { SlashMenuItem } from '../../slash-menu';

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
      run: (editor: Editor) => { editor.chain().focus().setParagraph().run(); },
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
      icon: '@',
      run: () => { /* handled by controller */ },
    },
    {
      id: 'mws-table',
      label: 'MWS таблица',
      hint: 'Вставить live embed существующей таблицы',
      keywords: ['table', 'mws', 'таблица', 'embed', 'live', 'datasheet'],
      icon: 'Tbl',
      run: () => { /* handled by controller */ },
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
      id: 'task-list',
      label: 'Чеклист',
      hint: 'Создать список задач с чекбоксами',
      keywords: ['checklist', 'task', 'todo', 'чеклист', 'задача', 'список задач', 'checkbox'],
      icon: '[]',
      run: (editor: Editor) => { editor.chain().focus().toggleTaskList().run(); },
    },
    {
      id: 'image',
      label: 'Изображение',
      hint: 'Загрузить изображение в документ',
      keywords: ['image', 'img', 'photo', 'картинка', 'изображение', 'фото', 'рисунок'],
      icon: '🖼',
      run: () => { /* handled by controller */ },
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
      icon: 'UL',
      run: (editor: Editor) => { editor.chain().focus().toggleBulletList().run(); },
    },
    {
      id: 'ordered-list',
      label: 'Нумерованный список',
      hint: 'Создать список с номерами',
      keywords: ['list', 'numbered', 'ol', 'ordered', 'нумерованный', 'список'],
      icon: 'OL',
      run: (editor: Editor) => { editor.chain().focus().toggleOrderedList().run(); },
    },
    {
      id: 'blockquote',
      label: 'Цитата',
      hint: 'Вставить блок цитаты',
      keywords: ['quote', 'blockquote', 'цитата', 'цитирование'],
      icon: '"',
      run: (editor: Editor) => { editor.chain().focus().toggleBlockquote().run(); },
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

  return items;
}
