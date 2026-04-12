import type { ReactNode } from 'react';
import { Crown, Eye, MessageSquare, Pencil } from 'lucide-react';

import type { DocumentAccessSummary } from '../../../shared/api/wikilive';

type WorkspaceAccessSummary = {
  title: string;
  description: string;
  icon: ReactNode;
  badge: string;
};

export function getWorkspaceAccessSummary(access: DocumentAccessSummary | null | undefined): WorkspaceAccessSummary | null {
  if (!access) {
    return null;
  }

  if (access.capabilities.canManageAccess) {
    return {
      title: 'Полный доступ',
      description: 'Вы можете редактировать страницу и управлять правами.',
      icon: <Crown size={16} strokeWidth={2.1} />,
      badge: 'Владелец',
    };
  }

  if (access.capabilities.canEdit) {
    return {
      title: 'Редактирование',
      description: 'Вы можете менять содержимое страницы.',
      icon: <Pencil size={16} strokeWidth={2.1} />,
      badge: 'Редактор',
    };
  }

  if (access.capabilities.canComment) {
    return {
      title: 'Комментарий',
      description: 'Вы можете оставлять комментарии к странице.',
      icon: <MessageSquare size={16} strokeWidth={2.1} />,
      badge: 'Комментатор',
    };
  }

  if (access.capabilities.canView) {
    return {
      title: 'Только просмотр',
      description: 'Страница доступна только для чтения.',
      icon: <Eye size={16} strokeWidth={2.1} />,
      badge: 'Просмотр',
    };
  }

  return {
    title: 'Ограниченный доступ',
    description: 'Ваши права на эту страницу ограничены.',
    icon: <Eye size={16} strokeWidth={2.1} />,
    badge: 'Доступ ограничен',
  };
}

export function WorkspaceAccessSummary({ access }: { access: DocumentAccessSummary | null | undefined }) {
  const summary = getWorkspaceAccessSummary(access);

  if (!summary || access?.capabilities.canManageAccess) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#d7e2f2] bg-[#f7fafe] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#556987]">Ваши права</p>
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-[#dde6f4] bg-white/90 px-3 py-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#edf3fe] text-[#4f6380]">
          {summary.icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#1c2735]">{summary.title}</p>
            <span className="rounded-full border border-[#d4dfef] bg-[#eef4ff] px-2 py-0.5 text-[11px] font-semibold text-[#4e637f]">{summary.badge}</span>
          </div>
          <p className="mt-1 text-sm text-[#5f7189]">{summary.description}</p>
          {access?.principal ? (
            <p className="mt-1 text-[11px] text-[#7a8ca6]">
              {access.principal === 'authenticated' ? 'Вход выполнен, права не редактируются.' : 'Гость всегда работает в режиме только чтения.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}