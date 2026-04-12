import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, RefreshCcw, ZoomIn } from 'lucide-react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

const colaPlugin = (cola as any).default ?? cola;
const isColaPlugin = typeof colaPlugin === 'function';
const defaultLayoutName = isColaPlugin ? 'cola' : 'cose';

if (isColaPlugin) {
  cytoscape.use(colaPlugin);
} else {
  console.warn('Cytoscape cola plugin failed to load; falling back to cose layout.');
}

export type DocumentGraphEdge = {
  sourcePageId: string;
  targetPageId: string;
  mentionCount: number;
};

export type DocumentGraphPage = {
  id: string;
  title: string;
  fileSizeBytes?: number;
};

type DocumentLinkGraphProps = {
  pages: DocumentGraphPage[];
  activePageId: string | null;
  edges: DocumentGraphEdge[];
  onSelectPage: (pageId: string) => void;
};

type ColaLayoutOptions = cytoscape.LayoutOptions & {
  [key: string]: unknown;
};

function normalizeNodeSize(fileSizeBytes?: number) {
  if (!fileSizeBytes) {
    return 24;
  }

  const normalized = Math.min(42, Math.max(22, 12 + Math.log10(fileSizeBytes + 1) * 8));
  return Math.round(normalized);
}

function buildElements(pages: DocumentGraphPage[], edges: DocumentGraphEdge[]) {
  const nodes = pages.map((page) => ({
    data: {
      id: page.id,
      title: page.title,
      size: normalizeNodeSize(page.fileSizeBytes),
    },
    classes: 'document-node',
  }));

  const edgeElements = edges.map((edge, index) => ({
    data: {
      id: `edge-${edge.sourcePageId}-${edge.targetPageId}-${index}`,
      source: edge.sourcePageId,
      target: edge.targetPageId,
      mentionCount: edge.mentionCount,
    },
    classes: 'document-edge',
  }));

  return [...nodes, ...edgeElements];
}

const GRAPH_ZOOM_MIN = 0.35;
const GRAPH_ZOOM_MAX = 2.4;

function clampPan(cy: cytoscape.Core) {
  const pan = cy.pan();
  const zoom = cy.zoom();
  const limit = 170;

  const clamped = {
    x: Math.max(-limit, Math.min(limit, pan.x)),
    y: Math.max(-limit, Math.min(limit, pan.y)),
  };

  if (clamped.x !== pan.x || clamped.y !== pan.y) {
    cy.pan(clamped);
  }

  if (zoom < GRAPH_ZOOM_MIN) {
    cy.zoom(GRAPH_ZOOM_MIN);
  }
  if (zoom > GRAPH_ZOOM_MAX) {
    cy.zoom(GRAPH_ZOOM_MAX);
  }
}

function updateSelection(cy: cytoscape.Core, activePageId: string | null, edges: DocumentGraphEdge[]) {
  cy.batch(() => {
    cy.elements().removeClass(['selected-node', 'highlight-node', 'highlighted-edge']);

    if (!activePageId) {
      return;
    }

    const activeNode = cy.$id(activePageId);
    if (!activeNode.nonempty()) {
      return;
    }

    activeNode.addClass('selected-node');

    const connectedPageIds = new Set<string>();
    edges.forEach((edge) => {
      if (edge.sourcePageId === activePageId) {
        connectedPageIds.add(edge.targetPageId);
      }
      if (edge.targetPageId === activePageId) {
        connectedPageIds.add(edge.sourcePageId);
      }
    });

    const connectedNodes = cy.collection();
    connectedPageIds.forEach((pageId) => {
      const node = cy.$id(pageId);
      if (node.nonempty()) {
        connectedNodes.merge(node);
      }
    });

    connectedNodes.addClass('highlight-node');
    cy.edges()
      .filter((edge) => {
        const data = edge.data();
        return data.source === activePageId || data.target === activePageId;
      })
      .addClass('highlighted-edge');
  });
}

function updateGraphElements(cy: cytoscape.Core, elements: cytoscape.ElementDefinition[]) {
  const incomingNodeIds = new Set<string>();
  const incomingEdgeIds = new Set<string>();

  elements.forEach((element) => {
    if (!element.data?.id) {
      return;
    }

    if (element.data.source) {
      incomingEdgeIds.add(element.data.id.toString());
    } else {
      incomingNodeIds.add(element.data.id.toString());
    }
  });

  cy.batch(() => {
    cy.nodes().filter((node) => !incomingNodeIds.has(node.id())).remove();
    cy.edges().filter((edge) => !incomingEdgeIds.has(edge.id())).remove();

    elements.forEach((element) => {
      if (!element.data?.id) {
        return;
      }

      const existing = cy.getElementById(element.data.id.toString());
      if (existing.nonempty()) {
        existing.data(element.data);
      } else {
        cy.add(element);
      }
    });
  });
}

export function DocumentLinkGraph({ pages, activePageId, edges, onSelectPage }: DocumentLinkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cytoscapeRef = useRef<cytoscape.Core | null>(null);
  const onSelectPageRef = useRef(onSelectPage);
  const dragStateRef = useRef<{ startX: number; startY: number; anchorX: number; anchorY: number } | null>(null);
  const initialLayoutDoneRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalOffset, setModalOffset] = useState({ x: 80, y: 60 });

  useEffect(() => {
    onSelectPageRef.current = onSelectPage;
  }, [onSelectPage]);

  const pagesKey = pages.map((page) => `${page.id}:${page.title}:${page.fileSizeBytes ?? ''}`).join('|');
  const edgesKey = edges.map((edge) => `${edge.sourcePageId}:${edge.targetPageId}:${edge.mentionCount}`).join('|');
  const elements = useMemo(() => buildElements(pages, edges), [pagesKey, edgesKey]);
  const activeTitle = pages.find((page) => page.id === activePageId)?.title;

  const layoutOptions: ColaLayoutOptions = {
    name: defaultLayoutName,
    animate: true,
    refresh: 1,
    maxSimulationTime: 4000,
    ungrabifyWhileSimulating: false,
    fit: false,
    padding: 30,
    nodeDimensionsIncludeLabels: false,
    randomize: false,
    avoidOverlap: true,
    handleDisconnected: true,
    convergenceThreshold: 0.01,
    nodeSpacing: 18,
    centerGraph: true,
    edgeLengthVal: 80,
    componentSpacing: 30,
  };

  useEffect(() => {
    if (!containerRef.current || cytoscapeRef.current || pages.length === 0) {
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#9ca3af',
            'border-width': 2,
            'border-color': '#d1d5db',
            width: 'data(size)',
            height: 'data(size)',
            label: 'data(title)',
            'font-size': 10,
            color: '#6b7280',
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': -10,
            'text-wrap': 'wrap',
            'text-max-width': '140px',
            'text-opacity': 1,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.75,
            'text-background-padding': '4px',
            'text-background-shape': 'roundrectangle',
            'transition-property': 'background-color width height border-color text-opacity',
            'transition-duration': 250,
            'transition-timing-function': 'ease-in-out',
          },
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
            'line-color': 'rgba(17,24,39,0.24)',
            width: 1,
            opacity: 0.9,
          },
        },
        {
          selector: '.selected-node',
          style: {
            'background-color': '#ff0037',
            'border-color': '#ff7b96',
            'text-opacity': 1,
            color: '#111827',
            'font-size': 12,
            'font-weight': 'bold',
            'text-valign': 'top',
            'text-margin-y': -12,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.95,
            'text-background-padding': '6px',
          },
        },
        {
          selector: '.highlight-node',
          style: {
            'background-color': '#fde2e8',
            'border-color': '#fb7185',
            'text-opacity': 1,
            color: '#111827',
            'font-weight': 'bold',
            'text-valign': 'top',
            'text-margin-y': -12,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '6px',
          },
        },
        {
          selector: '.highlighted-edge',
          style: {
            'line-color': '#ff0037',
            width: 2,
            opacity: 0.95,
          },
        },
      ],
      layout: {
        name: defaultLayoutName,
        animate: true,
        refresh: 1,
        maxSimulationTime: 4000,
        ungrabifyWhileSimulating: false,
        fit: false,
        padding: 30,
        nodeDimensionsIncludeLabels: false,
        randomize: false,
        avoidOverlap: true,
        handleDisconnected: true,
        convergenceThreshold: 0.01,
        nodeSpacing: 18,
        centerGraph: true,
        edgeLengthVal: 80,
        componentSpacing: 30,
      } as ColaLayoutOptions,
      minZoom: 0.35,
      maxZoom: 2.4,
      wheelSensitivity: 1.4,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      autounselectify: true,
    });

    cy.on('tap', 'node', (event) => {
      const node = event.target;
      onSelectPageRef.current(node.id());
    });

    cy.on('pan zoom', () => clampPan(cy));

    const scheduleLayout = () => {
      window.requestAnimationFrame(() => {
        cy.resize();
        const layout = cy.layout(layoutOptions);
        layout.on('layoutstop', () => {
          if (cy.elements().nonempty() && !initialLayoutDoneRef.current) {
            cy.fit(cy.elements(), 25);
            initialLayoutDoneRef.current = true;
          }
        });
        layout.run();
      });
    };

    const resizeObserver = new ResizeObserver(() => scheduleLayout());
    resizeObserver.observe(containerRef.current);

    scheduleLayout();
    cytoscapeRef.current = cy;
    updateSelection(cy, activePageId, edges);

    return () => {
      resizeObserver.disconnect();
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, [pages.length]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    window.requestAnimationFrame(() => {
      cy.resize();
    });
  }, [isModalOpen]);

  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    updateSelection(cy, activePageId, edges);
  }, [activePageId, edgesKey]);

  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    const container = cy.container();
    if (!container) {
      return undefined;
    }

    const onMouseEnter = () => setIsHovered(true);
    const onMouseLeave = () => setIsHovered(false);

    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);

    return () => {
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy || pages.length === 0) {
      return;
    }

    updateGraphElements(cy, elements);
    window.requestAnimationFrame(() => {
      cy.resize();
      const layout = cy.layout(layoutOptions);
      layout.run();
    });
  }, [elements, pages.length]);

  const handleRefreshGraph = () => {
    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    updateGraphElements(cy, elements);
    cy.layout({
      name: defaultLayoutName,
      animate: true,
      refresh: 1,
      maxSimulationTime: 4000,
      ungrabifyWhileSimulating: false,
      fit: false,
      padding: 30,
      nodeDimensionsIncludeLabels: false,
      randomize: false,
      avoidOverlap: true,
      handleDisconnected: true,
      convergenceThreshold: 0.01,
      nodeSpacing: 18,
      centerGraph: true,
      edgeLengthVal: 80,
      componentSpacing: 30,
    } as ColaLayoutOptions).run();
  };

  const handleExpandGraph = () => {
    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    cy.fit(cy.elements(), 20);
    const targetZoom = Math.min(cy.maxZoom(), cy.zoom() * 1.1);
    cy.zoom(targetZoom);
  };

  const handleOpenModal = () => {
    const modalWidth = Math.min(window.innerWidth * 0.84, 820);
    const modalHeight = Math.min(window.innerHeight * 0.76, 640);

    setModalOffset({
      x: Math.round((window.innerWidth - modalWidth) / 2),
      y: Math.round((window.innerHeight - modalHeight) / 2),
    });
    setIsModalOpen(true);
  };

  const graphContainerStyle = {
    touchAction: 'none',
    cursor: isHovered ? 'grab' : 'default',
  } as const;

  const handleModalPointerDown = (event: any) => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      anchorX: modalOffset.x,
      anchorY: modalOffset.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleModalPointerMove = (event: any) => {
    if (!dragStateRef.current) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;

    setModalOffset({
      x: Math.max(8, Math.min(window.innerWidth - 200, dragStateRef.current.anchorX + deltaX)),
      y: Math.max(8, Math.min(window.innerHeight - 120, dragStateRef.current.anchorY + deltaY)),
    });
  };

  const handleModalPointerUp = (event: any) => {
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm">
      <div className="relative overflow-hidden border-b border-editor-border-subtle px-3 py-2.5">
        <div className="absolute inset-y-0 left-0 w-1 bg-[#ff0037]" />
        <div className="relative flex items-center justify-between gap-3 pl-1">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-editor-text-tertiary">Graph View</p>
            <h3 className="mt-1 truncate font-wide text-sm font-semibold text-editor-text-primary">{activeTitle ?? 'Все документы'}</h3>
          </div>
          <span className="shrink-0 rounded-full border border-editor-border-subtle bg-editor-bg-control px-2.5 py-1 text-xs font-semibold text-editor-text-secondary">
            {pages.length}/{edges.length}
          </span>
        </div>
      </div>

      <div className="relative h-[214px] bg-[radial-gradient(circle_at_center,rgba(255,0,55,0.055),transparent_44%)]">
        {pages.length > 0 ? (
          <>
            {isModalOpen && (
              <div className="fixed inset-0 z-45">
                <div className="absolute inset-0 bg-black/30" onClick={() => setIsModalOpen(false)} />
                <div
                  className="absolute z-50 flex h-[min(76vh,640px)] w-[min(84vw,820px)] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_rgba(17,25,40,0.25)]"
                  style={{ left: modalOffset.x, top: modalOffset.y }}
                >
                  <div
                    className="flex h-10 cursor-grab items-center gap-3 rounded-t-3xl bg-red-600 px-3 text-sm font-semibold text-white"
                    onPointerDown={handleModalPointerDown}
                    onPointerMove={handleModalPointerMove}
                    onPointerUp={handleModalPointerUp}
                  >
                    <span className="truncate">{activeTitle ?? 'Текущий файл'}</span>
                  </div>
                </div>
              </div>
            )}

            {!isModalOpen && (
              <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-1.5 py-1 backdrop-blur-sm shadow-sm pointer-events-auto">
                <button
                  type="button"
                  onClick={handleRefreshGraph}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-slate-900 transition-colors hover:bg-white/20"
                  aria-label="Обновить граф"
                  title="Обновить граф"
                >
                  <RefreshCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleExpandGraph}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-slate-900 transition-colors hover:bg-white/20"
                  aria-label="Приблизить граф"
                  title="Приблизить граф"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleOpenModal}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-slate-900 transition-colors hover:bg-white/20"
                  aria-label="Открыть большой граф"
                  title="Открыть большой граф"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            )}
            <div
              ref={containerRef}
              className={isModalOpen ? 'absolute rounded-b-3xl bg-white shadow-[0_30px_80px_rgba(17,25,40,0.25)]' : 'h-full w-full'}
              style={{
                ...graphContainerStyle,
                ...(isModalOpen
                  ? {
                      position: 'fixed' as const,
                      top: modalOffset.y + 40,
                      left: modalOffset.x,
                      width: 'min(84vw,820px)',
                      height: 'calc(min(76vh,640px) - 40px)',
                      zIndex: 49,
                      borderRadius: '0 0 24px 24px',
                      backgroundColor: '#ffffff',
                    }
                  : {}),
              }}
              aria-label="Graph canvas"
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-editor-text-tertiary">Создайте страницы, чтобы увидеть граф связей.</div>
        )}

        {pages.length > 0 && edges.length === 0 ? (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-dashed border-editor-border-subtle bg-white/90 px-3 py-2.5 text-center text-xs text-editor-text-tertiary shadow-sm">
            Добавьте связь через /страница, и граф начнет оживать.
          </div>
        ) : null}
      </div>
    </section>
  );
}
