export type PluginPlanId = 'free' | 'pro' | 'enterprise';
export type PluginKind = 'core' | 'optional';
export type PluginCategory = 'core' | 'insights' | 'assistant' | 'collaboration';

export interface PluginDefinition {
  id: string;
  title: string;
  description: string;
  category: PluginCategory;
  kind: PluginKind;
  defaultEnabled: boolean;
  implemented: boolean;
  placement: string[];
  requiredPlans?: PluginPlanId[];
}

export const pluginPlans = {
  free: {
    id: 'free',
    title: 'Базовый',
    description: 'Обязательный контур wiki с редактором, ссылками, таблицами и синхронизацией.',
  },
  pro: {
    id: 'pro',
    title: 'Командный',
    description: 'Добавляет расширенную навигацию по знаниям и дополнительные модули рабочего пространства.',
  },
  enterprise: {
    id: 'enterprise',
    title: 'Enterprise',
    description: 'Открывает премиальные возможности автоматизации, AI и корпоративных сценариев.',
  },
} as const;

export const pluginDefinitions: PluginDefinition[] = [
  {
    id: 'live-tables',
    title: 'Живые таблицы MWS',
    description: 'Встраивание существующих таблиц MWS прямо в текст страницы как живых объектов.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['Редактор', 'Контент страницы'],
  },
  {
    id: 'backlinks',
    title: 'Обратные ссылки',
    description: 'Связи между страницами, входящие и исходящие упоминания для навигации по базе знаний.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['Правая панель'],
  },
  {
    id: 'slash-menu',
    title: 'Slash-меню',
    description: 'Палитра команд внутри редактора с клавиатурной навигацией и быстрыми вставками.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['Команды редактора'],
  },
  {
    id: 'autosave-sync',
    title: 'Автосохранение и синхронизация',
    description: 'Локальные черновики, восстановление после сбоев и синхронизация состояния с backend.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['Сохранение'],
  },
  {
    id: 'collaboration',
    title: 'Совместное редактирование',
    description: 'Присутствие участников, общая работа над документом и синхронное редактирование.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['Коллаборация'],
  },
  {
    id: 'document-graph',
    title: 'Граф документов',
    description: 'Визуальная карта связей между страницами в правой панели рабочего пространства.',
    category: 'insights',
    kind: 'optional',
    defaultEnabled: true,
    implemented: true,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['Правая панель'],
  },
  {
    id: 'comments',
    title: 'Комментарии',
    description: 'Обсуждения по фрагментам документа, ревью и асинхронная работа над контентом.',
    category: 'collaboration',
    kind: 'optional',
    defaultEnabled: false,
    implemented: false,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['Боковая панель редактора'],
  },
  {
    id: 'ai-assist',
    title: 'AI-помощник',
    description: 'Контекстные AI-действия для суммаризации, черновиков и помощи при работе с текстом.',
    category: 'assistant',
    kind: 'optional',
    defaultEnabled: false,
    implemented: false,
    requiredPlans: ['enterprise'],
    placement: ['Тулбар редактора', 'AI-панель'],
  },
];
