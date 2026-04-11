import type { PluginCatalogItem } from '../../../shared/api/wikilive';

export type WorkspaceSidebarSlot = 'document-graph' | 'sidebar';
export type EditorSlot = 'toolbar_bubble' | 'editor_extension' | 'slash_menu';

type RuntimePluginDefinition = {
  id: string;
  workspaceSidebarSlots?: WorkspaceSidebarSlot[];
  editorSlots?: EditorSlot[];
};

export const runtimePluginRegistry: RuntimePluginDefinition[] = [
  {
    id: 'document-graph',
    workspaceSidebarSlots: ['document-graph'],
  },
  {
    id: 'comments',
  },
  {
    id: 'time-machine',
  },
  {
    id: 'ai-assistant',
    workspaceSidebarSlots: ['sidebar'],
    editorSlots: ['toolbar_bubble', 'editor_extension', 'slash_menu'],
  },
];

function isPluginRuntimeEnabled(items: PluginCatalogItem[], pluginId: string) {
  const plugin = items.find((item) => item.id === pluginId);
  return Boolean(plugin?.enabled);
}

export function isWorkspaceSidebarSlotEnabled(items: PluginCatalogItem[], slot: WorkspaceSidebarSlot) {
  return runtimePluginRegistry.some((definition) => {
    return definition.workspaceSidebarSlots?.includes(slot) && isPluginRuntimeEnabled(items, definition.id);
  });
}

export function isEditorSlotEnabled(items: PluginCatalogItem[], slot: EditorSlot) {
  return runtimePluginRegistry.some((definition) => {
    return definition.editorSlots?.includes(slot) && isPluginRuntimeEnabled(items, definition.id);
  });
}
