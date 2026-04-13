import type { MwsTableEmbedController } from '../model/use-wiki-table-embed';
import { MwsTableActionBar } from './mws-table-action-bar';
import { TableGridCanvas } from './table-grid-canvas';

export type ExpandedTableModalProps = {
  isOpen: boolean;
  controller: MwsTableEmbedController;
  tableTitle: string;
  selectColorToCss: (color: string) => string;
  selectEditorRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onRefresh?: () => void;
  onSearchQueryChange: (value: string) => void;
  onCreateField: () => void;
  onHideFields: () => void;
  onFilter: () => void;
  onGroup: () => void;
  onSort: () => void;
  onExpand: () => void;
  onOpenFilePicker: () => void;
  onDownloadSelectedAttachment: () => void;
  onCreateRow: () => void;
  onDeleteRow: () => void;
  canUploadToCell: boolean;
  canDownloadFromCell: boolean;
  isAttachmentWidgetDismissed?: boolean;
  onAttachmentWidgetClose?: () => void;
  onOpenAttachmentUpload?: () => void;
  onDownloadAllAttachments?: () => void;
  onCanvasKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
};

export function ExpandedTableModal({
  isOpen,
  controller,
  tableTitle,
  selectColorToCss,
  selectEditorRef,
  onClose,
  onSearchQueryChange,
  onCreateField,
  onHideFields,
  onFilter,
  onGroup,
  onSort,
  onExpand,
  onOpenFilePicker,
  onDownloadSelectedAttachment,
  onCreateRow,
  onDeleteRow,
  onRefresh,
  canUploadToCell,
  canDownloadFromCell,
  isAttachmentWidgetDismissed = false,
  onAttachmentWidgetClose,
  onOpenAttachmentUpload,
  onDownloadAllAttachments,
  onCanvasKeyDown
}: ExpandedTableModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[102] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={onClose}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Полноэкранная таблица ${tableTitle}`}
        className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-editor-border-subtle bg-[#f8fafc] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-wide text-lg font-semibold text-editor-text-primary leading-none">
              {tableTitle}
            </h2>
            <p className="text-xs text-editor-text-tertiary mt-1">
              Полноэкранный просмотр
            </p>
          </div>
        </div>

        <MwsTableActionBar
          canCreateRow={
            Boolean(controller.capabilities.canCreateRecords) &&
            !controller.isMutating &&
            controller.fields.length > 0
          }
          canDeleteRow={
            Boolean(
              controller.selectedRecord &&
              controller.capabilities.canDeleteRecords
            ) && !controller.isMutating
          }
          canUploadToCell={canUploadToCell && !controller.isMutating}
          canDownloadFromCell={canDownloadFromCell && !controller.isMutating}
          canManageFields={controller.fields.length > 0}
          canExpand={controller.records.length > 0}
          isLoading={controller.isLoading}
          isMutating={controller.isMutating}
          searchQuery={controller.searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          onCreateRow={onCreateRow}
          onCreateField={onCreateField}
          onOpenFilePicker={onOpenFilePicker}
          onDownloadSelectedAttachment={onDownloadSelectedAttachment}
          onHideFields={onHideFields}
          onFilter={onFilter}
          onGroup={onGroup}
          onSort={onSort}
          onDeleteRow={onDeleteRow}
          onExpand={onExpand}
          onRefresh={onRefresh ? onRefresh : () => void controller.loadEmbed()}
          onCloseExpanded={onClose}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TableGridCanvas
            controller={controller}
            isExpanded
            selectColorToCss={selectColorToCss}
            isAttachmentWidgetDismissed={isAttachmentWidgetDismissed}
            onAttachmentWidgetClose={onAttachmentWidgetClose}
            onOpenAttachmentUpload={onOpenAttachmentUpload}
            onDownloadAllAttachments={onDownloadAllAttachments}
            onAddColumn={onCreateField}
            onAddRow={onCreateRow}
            onCanvasKeyDown={onCanvasKeyDown}
            selectEditorRef={selectEditorRef}
          />
        </div>
      </div>
    </div>
  );
}
