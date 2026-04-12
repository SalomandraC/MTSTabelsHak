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
  defaultSettings?: Record<string, boolean>;
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
    defaultEnabled: true,
    implemented: true,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['Боковая панель редактора'],
  },
  {
    id: 'time-machine',
    title: 'Машина времени',
    description: 'История изменений документа с просмотром checkpoint-версий и восстановлением состояния страницы.',
    category: 'insights',
    kind: 'optional',
    defaultEnabled: true,
    implemented: true,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['Правая панель'],
  },
  {
    id: 'page-navigation',
    title: 'Навигация и структура',
    description: 'Автоматическое оглавление документа и умная нумерация заголовков',
    category: 'insights',
    kind: 'optional',
    defaultEnabled: true,
    implemented: true,
    placement: ['Правая панель', 'Редактор'],
  },
  {
    id: 'ai-assistant',
    title: 'ИИ-ассистент',
    description: 'Контекстные ИИ-действия в sidebar и редакторе: чат, генерация, трансформации и автодополнение.',
    category: 'assistant',
    kind: 'optional',
    defaultEnabled: true,
    implemented: true,
    requiredPlans: ['enterprise'],
    placement: ['sidebar', 'slash_menu', 'toolbar_bubble', 'editor_extension'],
  },
  {
    id: 'canvas-draw',
    title: 'Рисование на холсте',
    description: 'Встраивание интерактивных блоков для рисования от руки прямо в текст страницы.',
    category: 'core',
    kind: 'optional',
    defaultEnabled: false,
    implemented: true,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['Редактор', 'Тулбар редактора'],
    defaultSettings: {
      'toolbar': true,
      'floating-toolbar': true,
      'slash-menu': true,
    },
  },
  {
    id: 'iframe-embed',
    title: 'Встраивание контента (iframe)',
    description: 'Встраивание внешнего контента — YouTube, карты, презентации и другие iframe-элементы прямо в текст страницы.',
    category: 'core',
    kind: 'optional',
    defaultEnabled: false,
    implemented: true,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['Редактор', 'Тулбар редактора'],
    defaultSettings: {
      'toolbar': true,
      'floating-toolbar': true,
      'slash-menu': true,
    },
  },
];
