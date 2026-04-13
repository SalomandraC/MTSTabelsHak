export type { PluginCatalogItem } from '../../../shared/api/wikilive';

import type { PluginCatalogItem } from '../../../shared/api/wikilive';

export type WorkspaceSidebarSlot = 'document-graph' | 'sidebar' | 'navigation';
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
  {
    id: 'page-navigation',
    workspaceSidebarSlots: ['navigation'],
  },
  {
    id: 'canvas-draw',
  },
  {
    id: 'iframe-embed',
    editorSlots: ['slash_menu'],
  },
  {
    id: 'bookmarks',
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

/**
 * Return settings map for the canvas-draw plugin, or defaults if not found.
 * Keys: 'toolbar', 'floating-toolbar', 'slash-menu'
 */
export function getCanvasDrawSettings(items: PluginCatalogItem[]): Record<string, boolean> {
  const safeItems = items ?? [];
  const plugin = safeItems.find((item) => item.id === 'canvas-draw');
  if (!plugin?.enabled) return {};
  return plugin.settings ?? {
    toolbar: true,
    'floating-toolbar': true,
    'slash-menu': true,
  };
}

/**
 * Return settings map for the iframe-embed plugin, or defaults if not found.
 * Keys: 'toolbar', 'floating-toolbar', 'slash-menu'
 */
export function getIframeEmbedSettings(items: PluginCatalogItem[]): Record<string, boolean> {
  const safeItems = items ?? [];
  const plugin = safeItems.find((item) => item.id === 'iframe-embed');
  if (!plugin?.enabled) return {};
  return plugin.settings ?? {
    toolbar: true,
    'floating-toolbar': true,
    'slash-menu': true,
  };
}

export function isEditorSlotEnabled(items: PluginCatalogItem[], slot: EditorSlot) {
  return runtimePluginRegistry.some((definition) => {
    return definition.editorSlots?.includes(slot) && isPluginRuntimeEnabled(items, definition.id);
  });
}

/**
 * Return settings map for the bookmarks plugin, or defaults if not found.
 * Keys: 'toolbar', 'floating-toolbar', 'slash-menu'
 */
export function getBookmarkSettings(items: PluginCatalogItem[]): Record<string, boolean> {
  const plugin = items.find((item) => item.id === 'bookmarks');
  if (!plugin?.enabled) return {};
  return plugin.settings ?? {
    toolbar: true,
    'floating-toolbar': true,
    'slash-menu': true,
  };
}
