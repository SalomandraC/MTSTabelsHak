export type TemplateFieldKind = 'text' | 'multiline';

export type TemplateFieldDefinition = {
  key: string;
  label: string;
  description: string;
  kind: TemplateFieldKind;
  required: boolean;
  defaultValue?: string;
};

export type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: ProseMirrorNode[];
};

export type PageTemplateDefinition = {
  id: string;
  title: string;
  summary: string;
  category: string;
  audience: string;
  icon: string;
  pageTitleTemplate: string;
  fields: TemplateFieldDefinition[];
  document: ProseMirrorNode;
};

const variable = (
  key: string,
  label: string,
  description: string,
): ProseMirrorNode => ({
  type: 'templateVariable',
  attrs: {
    key,
    label,
    description,
  },
});

const text = (value: string): ProseMirrorNode => ({
  type: 'text',
  text: value,
});

const paragraph = (...content: ProseMirrorNode[]): ProseMirrorNode => ({
  type: 'paragraph',
  content,
});

const heading = (level: number, ...content: ProseMirrorNode[]): ProseMirrorNode => ({
  type: 'heading',
  attrs: { level },
  content,
});

const bulletList = (...items: ProseMirrorNode[]): ProseMirrorNode => ({
  type: 'bulletList',
  content: items,
});

const orderedList = (...items: ProseMirrorNode[]): ProseMirrorNode => ({
  type: 'orderedList',
  content: items,
});

const listItem = (...content: ProseMirrorNode[]): ProseMirrorNode => ({
  type: 'listItem',
  content,
});

export const templateCatalog: PageTemplateDefinition[] = [
  {
    id: 'mts-resume',
    title: 'Резюме в компанию МТС',
    summary: 'Быстрый шаблон резюме с акцентом на опыт, навыки и мотивацию для отклика в МТС.',
    category: 'Карьера',
    audience: 'Все пользователи пространства',
    icon: 'briefcase',
    pageTitleTemplate: 'Резюме - {{fullName}} - МТС',
    fields: [
      {
        key: 'fullName',
        label: 'ФИО',
        description: 'Полное имя кандидата.',
        kind: 'text',
        required: true,
      },
      {
        key: 'position',
        label: 'Желаемая позиция',
        description: 'На какую роль кандидат откликается.',
        kind: 'text',
        required: true,
      },
      {
        key: 'city',
        label: 'Город',
        description: 'Текущий город или город для релокации.',
        kind: 'text',
        required: true,
      },
      {
        key: 'experience',
        label: 'Ключевой опыт',
        description: 'Краткое описание релевантного опыта.',
        kind: 'multiline',
        required: true,
      },
      {
        key: 'skills',
        label: 'Навыки',
        description: 'Набор ключевых навыков через запятую.',
        kind: 'multiline',
        required: true,
      },
      {
        key: 'motivation',
        label: 'Почему МТС',
        description: 'Короткая мотивация отклика.',
        kind: 'multiline',
        required: false,
        defaultValue: 'Хочу работать над продуктами с большой пользовательской аудиторией и заметным влиянием на клиентский опыт.',
      },
    ],
    document: {
      type: 'doc',
      content: [
        heading(1, variable('fullName', 'ФИО', 'Полное имя кандидата')),
        paragraph(
          text('Позиция: '),
          variable('position', 'Желаемая позиция', 'На какую роль кандидат откликается.'),
        ),
        paragraph(text('Город: '), variable('city', 'Город', 'Текущий город или город для релокации.')),
        heading(2, text('Профессиональный профиль')),
        paragraph(variable('experience', 'Ключевой опыт', 'Краткое описание релевантного опыта.')),
        heading(2, text('Ключевые навыки')),
        paragraph(variable('skills', 'Навыки', 'Набор ключевых навыков через запятую.')),
        heading(2, text('Почему хочу в МТС')),
        paragraph(variable('motivation', 'Почему МТС', 'Короткая мотивация отклика.')),
      ],
    },
  },
  {
    id: 'simple-telecom-contract',
    title: 'Примитивный договор на связь',
    summary: 'Упрощенный шаблон демонстрационного договора на услуги связи без юридических претензий.',
    category: 'Документы',
    audience: 'Все пользователи пространства',
    icon: 'file-text',
    pageTitleTemplate: 'Договор связи - {{customerName}}',
    fields: [
      {
        key: 'contractNumber',
        label: 'Номер договора',
        description: 'Внутренний номер документа.',
        kind: 'text',
        required: true,
      },
      {
        key: 'customerName',
        label: 'Клиент',
        description: 'ФИО или название клиента.',
        kind: 'text',
        required: true,
      },
      {
        key: 'serviceName',
        label: 'Услуга',
        description: 'Название подключаемой услуги.',
        kind: 'text',
        required: true,
        defaultValue: 'Подключение корпоративной связи',
      },
      {
        key: 'monthlyFee',
        label: 'Абонентская плата',
        description: 'Стоимость услуги в месяц.',
        kind: 'text',
        required: true,
        defaultValue: '1 500 руб./мес.',
      },
      {
        key: 'specialTerms',
        label: 'Особые условия',
        description: 'Необязательные дополнительные условия.',
        kind: 'multiline',
        required: false,
        defaultValue: 'Оплата производится ежемесячно, доступ к услуге предоставляется в течение 3 рабочих дней после подписания.',
      },
    ],
    document: {
      type: 'doc',
      content: [
        heading(1, text('Договор на услуги связи')),
        paragraph(text('Номер договора: '), variable('contractNumber', 'Номер договора', 'Внутренний номер документа.')),
        paragraph(text('Клиент: '), variable('customerName', 'Клиент', 'ФИО или название клиента.')),
        paragraph(text('Услуга: '), variable('serviceName', 'Услуга', 'Название подключаемой услуги.')),
        paragraph(text('Абонентская плата: '), variable('monthlyFee', 'Абонентская плата', 'Стоимость услуги в месяц.')),
        heading(2, text('Основные положения')),
        orderedList(
          listItem(paragraph(text('Исполнитель предоставляет клиенту услугу связи в согласованном объеме.'))),
          listItem(paragraph(text('Клиент использует услугу в рамках действующих правил эксплуатации.'))),
          listItem(paragraph(variable('specialTerms', 'Особые условия', 'Необязательные дополнительные условия.'))),
        ),
      ],
    },
  },
  {
    id: 'sprint-retro',
    title: 'Ретро по спринту',
    summary: 'Шаблон внутренней ретроспективы команды после спринта или короткого релиза.',
    category: 'Командная работа',
    audience: 'Команда продукта',
    icon: 'sparkles',
    pageTitleTemplate: 'Ретро - {{sprintName}}',
    fields: [
      {
        key: 'sprintName',
        label: 'Название спринта',
        description: 'Например Sprint 12 или Release April.',
        kind: 'text',
        required: true,
      },
      {
        key: 'period',
        label: 'Период',
        description: 'Даты проведения спринта.',
        kind: 'text',
        required: true,
      },
      {
        key: 'wins',
        label: 'Что получилось хорошо',
        description: 'Ключевые успехи команды.',
        kind: 'multiline',
        required: true,
      },
      {
        key: 'painPoints',
        label: 'Что мешало',
        description: 'Основные проблемы и узкие места.',
        kind: 'multiline',
        required: true,
      },
      {
        key: 'nextActions',
        label: 'Что изменим',
        description: 'Конкретные действия на следующий спринт.',
        kind: 'multiline',
        required: true,
      },
    ],
    document: {
      type: 'doc',
      content: [
        heading(1, text('Ретроспектива: '), variable('sprintName', 'Название спринта', 'Например Sprint 12 или Release April.')),
        paragraph(text('Период: '), variable('period', 'Период', 'Даты проведения спринта.')),
        heading(2, text('Что получилось хорошо')),
        bulletList(listItem(paragraph(variable('wins', 'Что получилось хорошо', 'Ключевые успехи команды.')))),
        heading(2, text('Что мешало')),
        bulletList(listItem(paragraph(variable('painPoints', 'Что мешало', 'Основные проблемы и узкие места.')))),
        heading(2, text('Что изменим в следующем цикле')),
        bulletList(listItem(paragraph(variable('nextActions', 'Что изменим', 'Конкретные действия на следующий спринт.')))),
      ],
    },
  },
];
