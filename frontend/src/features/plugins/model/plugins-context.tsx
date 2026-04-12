import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  type PluginCatalogItem,
  type PluginCatalogResponse,
  type PluginPlan,
  wikiliveApi,
} from '../../../shared/api/wikilive';
import {
  isEditorSlotEnabled,
  isWorkspaceSidebarSlotEnabled,
  type EditorSlot,
  type WorkspaceSidebarSlot,
} from './plugin-registry';

type PluginsContextValue = {
  items: PluginCatalogItem[];
  plan: PluginPlan | null;
  isLoading: boolean;
  errorMessage: string;
  pendingPluginId: string | null;
  refreshCatalog: () => Promise<void>;
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<void>;
  updatePluginSettings: (pluginId: string, settings: Record<string, boolean>) => Promise<void>;
  isPluginEnabled: (pluginId: string) => boolean;
  isWorkspaceSidebarEnabled: (slot: WorkspaceSidebarSlot) => boolean;
  isEditorSlotEnabled: (slot: EditorSlot) => boolean;
};

const PluginsContext = createContext<PluginsContextValue | null>(null);

function buildEmptyCatalog(): PluginCatalogResponse {
  return {
    plan: {
      id: 'free',
      title: 'Free',
      description: 'Base wiki experience with mandatory core capabilities.',
    },
    items: [],
  };
}

export function PluginsProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<PluginCatalogResponse>(buildEmptyCatalog);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await wikiliveApi.listPlugins();
      setCatalog(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить каталог плагинов');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const togglePlugin = useCallback(async (pluginId: string, enabled: boolean) => {
    setPendingPluginId(pluginId);
    setErrorMessage('');

    try {
      const response = enabled
        ? await wikiliveApi.activatePlugin(pluginId)
        : await wikiliveApi.deactivatePlugin(pluginId);
      setCatalog(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить состояние плагина');
    } finally {
      setPendingPluginId(null);
    }
  }, []);

  const updatePluginSettings = useCallback(async (pluginId: string, settings: Record<string, boolean>) => {
    setPendingPluginId(pluginId);
    setErrorMessage('');

    try {
      const response = await wikiliveApi.updatePluginSettings(pluginId, settings);
      setCatalog(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить настройки плагина');
    } finally {
      setPendingPluginId(null);
    }
  }, []);

  const value = useMemo<PluginsContextValue>(() => ({
    items: catalog.items,
    plan: catalog.plan,
    isLoading,
    errorMessage,
    pendingPluginId,
    refreshCatalog,
    togglePlugin,
    updatePluginSettings,
    isPluginEnabled: (pluginId: string) => catalog.items.some((item) => item.id === pluginId && item.enabled),
    isWorkspaceSidebarEnabled: (slot: WorkspaceSidebarSlot) => isWorkspaceSidebarSlotEnabled(catalog.items, slot),
    isEditorSlotEnabled: (slot: EditorSlot) => isEditorSlotEnabled(catalog.items, slot),
  }), [catalog.items, catalog.plan, errorMessage, isLoading, pendingPluginId, refreshCatalog, togglePlugin, updatePluginSettings]);

  return <PluginsContext.Provider value={value}>{children}</PluginsContext.Provider>;
}

export function usePlugins() {
  const context = useContext(PluginsContext);

  if (!context) {
    throw new Error('usePlugins must be used inside PluginsProvider');
  }

  return context;
}
