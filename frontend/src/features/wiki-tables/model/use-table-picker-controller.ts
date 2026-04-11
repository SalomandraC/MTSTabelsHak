import { useEffect, useMemo, useState } from 'react';

import { type MwsField, type MwsNode, type MwsSpace, type MwsView, wikiliveApi } from '../../../shared/api/wikilive';

export function isTableNode(node: MwsNode) {
  const type = node.type.toLowerCase();
  return Boolean(node.datasheetId ?? node.dstId) || type.includes('datasheet') || type.includes('table');
}

export function isFolderNode(node: MwsNode) {
  const type = node.type.toLowerCase();
  return type.includes('folder') || (!isTableNode(node) && Boolean(node.children?.length));
}

export function getDatasheetId(node: MwsNode) {
  return node.datasheetId ?? node.dstId ?? node.id;
}

function flattenNodes(nodes: MwsNode[]): MwsNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

export function filterNodesForPicker(nodes: MwsNode[]): MwsNode[] {
  return nodes.flatMap((node) => {
    const filteredChildren = filterNodesForPicker(node.children ?? []);

    if (isTableNode(node)) {
      return [{ ...node, children: [] }];
    }

    if (isFolderNode(node) && filteredChildren.length > 0) {
      return [{ ...node, children: filteredChildren }];
    }

    return [];
  });
}

export function nodePath(node: MwsNode) {
  return node.path?.filter(Boolean).join(' / ') || node.name;
}

type UseTablePickerControllerOptions = {
  isOpen: boolean;
  initialSpaceId: string;
};

export function useTablePickerController({ isOpen, initialSpaceId }: UseTablePickerControllerOptions) {
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaceId);
  const [nodes, setNodes] = useState<MwsNode[]>([]);
  const [query, setQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<MwsNode | null>(null);
  const [views, setViews] = useState<MwsView[]>([]);
  const [fields, setFields] = useState<MwsField[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [allowInlineEdit, setAllowInlineEdit] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const pickerNodes = useMemo(() => filterNodesForPicker(nodes), [nodes]);

  const searchableNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = flattenNodes(pickerNodes).filter(isTableNode);

    if (!normalized) {
      return items;
    }

    return items.filter((node) => {
      const haystack = `${node.name} ${node.type} ${nodePath(node)}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [pickerNodes, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    setSelectedNode(null);
    setSelectedViewId(null);
    setFields([]);
    setViews([]);

    void wikiliveApi
      .listMwsSpaces()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextSpaces = response.items.length > 0 ? response.items : [{ id: initialSpaceId, name: initialSpaceId }];
        setSpaces(nextSpaces);
        setSelectedSpaceId(nextSpaces.some((space) => space.id === initialSpaceId) ? initialSpaceId : nextSpaces[0]?.id ?? initialSpaceId);
      })
      .catch((error) => {
        if (!cancelled) {
          setSpaces([{ id: initialSpaceId, name: initialSpaceId }]);
          setSelectedSpaceId(initialSpaceId);
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить пространства MWS Tables');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialSpaceId, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedSpaceId) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    setSelectedNode(null);

    void wikiliveApi
      .listMwsNodes(selectedSpaceId)
      .then((response) => {
        if (!cancelled) {
          setNodes(response.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить ноды MWS Tables');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedSpaceId]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    let cancelled = false;
    const datasheetId = getDatasheetId(selectedNode);

    setIsConfigLoading(true);
    setErrorMessage('');
    setViews([]);
    setFields([]);
    setSelectedFieldIds([]);

    void (async () => {
      const viewsResponse = await wikiliveApi.listMwsViews(datasheetId);
      const nextViewId = viewsResponse.items[0]?.id ?? null;
      const fieldsResponse = await wikiliveApi.listMwsFields(datasheetId, nextViewId);

      if (cancelled) {
        return;
      }

      setViews(viewsResponse.items);
      setSelectedViewId(nextViewId);
      setFields(fieldsResponse.items);
      setSelectedFieldIds(fieldsResponse.items.map((field) => field.id));
    })()
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить настройки таблицы');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || !selectedViewId) {
      return;
    }

    let cancelled = false;
    const datasheetId = getDatasheetId(selectedNode);

    setIsConfigLoading(true);

    void wikiliveApi
      .listMwsFields(datasheetId, selectedViewId)
      .then((response) => {
        if (!cancelled) {
          setFields(response.items);
          setSelectedFieldIds(response.items.map((field) => field.id));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить поля view');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode, selectedViewId]);

  return {
    spaces,
    selectedSpaceId,
    setSelectedSpaceId,
    nodes: pickerNodes,
    query,
    setQuery,
    searchableNodes,
    selectedNode,
    setSelectedNode,
    views,
    fields,
    selectedViewId,
    setSelectedViewId,
    selectedFieldIds,
    setSelectedFieldIds,
    pageSize,
    setPageSize,
    allowInlineEdit,
    setAllowInlineEdit,
    isLoading,
    isConfigLoading,
    errorMessage,
    canInsert: Boolean(selectedNode) && !isConfigLoading,
  };
}
