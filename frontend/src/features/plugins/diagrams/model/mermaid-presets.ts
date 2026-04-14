export type MermaidPreset = {
  id: 'class' | 'flowchart' | 'sequence';
  label: string;
  code: string;
};

export const DEFAULT_MERMAID_CODE = `flowchart TD
  Start[Начало] --> Action[Действие]
  Action --> End[Результат]`;

export const MERMAID_PRESETS: MermaidPreset[] = [
  {
    id: 'class',
    label: 'Class Diagram',
    code: `classDiagram
  class User {
    +String id
    +String name
    +login()
  }
  class Order {
    +String id
    +Number total
    +pay()
  }
  User "1" --> "*" Order : creates`,
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    code: `flowchart TD
  A[Клик по заказу] --> B{Есть адрес?}
  B -->|Да| C[Подтвердить заказ]
  B -->|Нет| D[Запросить адрес]
  C --> E[Передать курьеру]
  E --> F[Доставка]`,
  },
  {
    id: 'sequence',
    label: 'Sequence Diagram',
    code: `sequenceDiagram
  participant U as User
  participant W as WikiLive
  participant AI as AI Copilot
  U->>W: Описывает процесс
  W->>AI: Запрос на диаграмму
  AI-->>W: Mermaid код
  W-->>U: Вставленная диаграмма`,
  },
];
