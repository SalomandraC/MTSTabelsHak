import type { PluginCatalogItem } from '../../../shared/api/wikilive';

export type WorkspaceSidebarSlot = 'document-graph';

type RuntimePluginDefinition = {
  id: string;
  workspaceSidebarSlots?: WorkspaceSidebarSlot[];
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
    id: 'ai-assist',
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
