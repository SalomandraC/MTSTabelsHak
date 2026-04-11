import type { ReactElement } from 'react';

export type SlashMenuItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  shortcut?: string;
  icon: ReactElement | string | null;
};
