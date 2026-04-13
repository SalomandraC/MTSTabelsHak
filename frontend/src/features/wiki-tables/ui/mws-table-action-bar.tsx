import {
  Columns3,
  Download,
  EyeOff,
  Filter,
  Group,
  Maximize2,
  Paperclip,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  SortAsc,
  Trash2,
  X
} from 'lucide-react';

type ToolbarButtonProps = {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
};

function ToolbarButton({
  label,
  icon,
  onClick,
  disabled = false,
  active = false
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4',
        active
          ? 'bg-[#d70032] text-white hover:bg-[#bd002c]'
          : 'text-[#3f3f46] hover:bg-[#edf0f5]'
      ].join(' ')}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export type MwsTableActionBarProps = {
  canCreateRow: boolean;
  canDeleteRow: boolean;
  canUploadToCell: boolean;
  canDownloadFromCell: boolean;
  canManageFields: boolean;
  canExpand: boolean;
  isLoading: boolean;
  isMutating: boolean;
  hasActiveFilter: boolean;
  hasActiveGroup: boolean;
  hasActiveSort: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCreateRow: () => void;
  onCreateField: () => void;
  onOpenFilePicker: () => void;
  onDownloadSelectedAttachment: () => void;
  onHideFields: () => void;
  onFilter: () => void;
  onGroup: () => void;
  onSort: () => void;
  onDeleteRow: () => void;
  onExpand: () => void;
  onRefresh: () => void;
  onResetAll?: () => void;
  onCloseExpanded?: () => void;
};

export function MwsTableActionBar({
  canCreateRow,
  canDeleteRow,
  canUploadToCell,
  canDownloadFromCell,
  canManageFields,
  canExpand,
  isLoading,
  isMutating,
  hasActiveFilter,
  hasActiveGroup,
  hasActiveSort,
  searchQuery,
  onSearchQueryChange,
  onCreateRow,
  onCreateField,
  onOpenFilePicker,
  onDownloadSelectedAttachment,
  onHideFields,
  onFilter,
  onGroup,
  onSort,
  onDeleteRow,
  onExpand,
  onRefresh,
  onResetAll,
  onCloseExpanded
}: MwsTableActionBarProps) {
  const hasAnyActiveTransforms =
    hasActiveFilter || hasActiveGroup || hasActiveSort;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-editor-border-subtle bg-[#f5f6f8] px-2 py-2">
      <ToolbarButton
        label=""
        icon={<RotateCcw className="h-4 w-4" />}
        disabled
      />
      <ToolbarButton
        label=""
        icon={<RotateCw className="h-4 w-4" />}
        disabled
      />
      <div className="mx-1 h-6 w-px bg-[#dfe3ea]" />
      <ToolbarButton
        label="Вставить запись"
        icon={<PlusCircle className="h-4 w-4" />}
        onClick={onCreateRow}
        disabled={!canCreateRow}
      />
      <ToolbarButton
        label="Столбец"
        icon={<Columns3 className="h-4 w-4" />}
        onClick={onCreateField}
        disabled={isMutating}
      />
      <ToolbarButton
        label="Файл"
        icon={<Paperclip className="h-4 w-4" />}
        onClick={onOpenFilePicker}
        disabled={!canUploadToCell}
      />
      <ToolbarButton
        label="Скачать файл"
        icon={<Download className="h-4 w-4" />}
        onClick={onDownloadSelectedAttachment}
        disabled={!canDownloadFromCell}
      />
      <ToolbarButton
        label="Скрыть поля"
        icon={<EyeOff className="h-4 w-4" />}
        onClick={onHideFields}
        disabled={!canManageFields}
      />
      <ToolbarButton
        label="Фильтр"
        icon={<Filter className="h-4 w-4" />}
        onClick={onFilter}
        disabled={!canManageFields}
        active={hasActiveFilter}
      />
      <ToolbarButton
        label="Группа"
        icon={<Group className="h-4 w-4" />}
        onClick={onGroup}
        disabled={!canManageFields}
        active={hasActiveGroup}
      />
      <ToolbarButton
        label="Сортировка"
        icon={<SortAsc className="h-4 w-4" />}
        onClick={onSort}
        disabled={!canManageFields}
        active={hasActiveSort}
      />
      {hasAnyActiveTransforms ? (
        <ToolbarButton
          label="Сбросить все"
          icon={<X className="h-4 w-4" />}
          onClick={onResetAll}
          disabled={!canManageFields}
        />
      ) : null}
      <ToolbarButton
        label="Удалить строку"
        icon={<Trash2 className="h-4 w-4" />}
        onClick={onDeleteRow}
        disabled={!canDeleteRow}
      />
      <ToolbarButton
        label="Раскрыть"
        icon={<Maximize2 className="h-4 w-4" />}
        onClick={onExpand}
        disabled={!canExpand}
      />
      <ToolbarButton
        label="Обновить"
        icon={<RefreshCw className="h-4 w-4" />}
        onClick={onRefresh}
        disabled={isLoading}
      />
      <div className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#dfe3ea] bg-white px-2">
        <Search className="h-4 w-4 text-[#626a75]" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Найти"
          className="h-7 w-28 border-0 bg-transparent text-sm outline-none"
        />
      </div>
      <ToolbarButton
        label="Дополнительно"
        icon={<Settings className="h-4 w-4" />}
        disabled
      />
      {onCloseExpanded ? (
        <button
          type="button"
          onClick={onCloseExpanded}
          className="ml-auto inline-flex h-8 items-center justify-center rounded-md px-2 text-[#626a75] transition-colors hover:bg-[#edf0f5]"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
