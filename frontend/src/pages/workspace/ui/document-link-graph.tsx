import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

const colaPlugin = (cola as any).default ?? cola;
const isColaPlugin = typeof colaPlugin === 'function';
const defaultLayoutName = isColaPlugin ? 'cola' : 'cose';

if (isColaPlugin) {
  cytoscape.use(colaPlugin);
} else {
  // eslint-disable-next-line no-console
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

  if (zoom < 0.82) {
    cy.zoom(0.82);
  }
  if (zoom > 1.4) {
    cy.zoom(1.4);
  }
}

function updateSelection(cy: cytoscape.Core, activePageId: string | null) {
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
    const connectedEdges = activeNode.connectedEdges();
    const connectedNodes = activeNode.connectedNodes().difference(activeNode);

    connectedEdges.addClass('highlighted-edge');
    connectedNodes.addClass('highlight-node');
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
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    onSelectPageRef.current = onSelectPage;
  }, [onSelectPage]);

  const pagesKey = pages.map((page) => `${page.id}:${page.title}:${page.fileSizeBytes ?? ''}`).join('|');
  const edgesKey = edges.map((edge) => `${edge.sourcePageId}:${edge.targetPageId}:${edge.mentionCount}`).join('|');
  const elements = useMemo(() => buildElements(pages, edges), [pagesKey, edgesKey]);
  const activeTitle = pages.find((page) => page.id === activePageId)?.title;

  const hasFittedGraphRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) {
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
            color: '#111827',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-margin-y': 0,
            'text-wrap': 'wrap',
            'text-max-width': 140,
            'text-opacity': 0,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': 5,
            'text-background-shape': 'roundrectangle',
            'transition-property': 'background-color width height border-color text-opacity',
            'transition-duration': '250ms',
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
            'font-weight': '700',
            'text-valign': 'top',
            'text-margin-y': -12,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': 6,
          },
        },
        {
          selector: '.highlight-node',
          style: {
            'background-color': '#fde2e8',
            'border-color': '#fb7185',
            'text-opacity': 1,
            color: '#111827',
            'font-weight': '600',
            'text-valign': 'top',
            'text-margin-y': -12,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': 6,
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
      minZoom: 0.82,
      maxZoom: 1.4,
      wheelSensitivity: 0.8,
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

    const initialLayout = cy.layout({
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
    } as ColaLayoutOptions);

    initialLayout.on('layoutstop', () => {
      if (!hasFittedGraphRef.current) {
        cy.fit(cy.elements(), 25);
        hasFittedGraphRef.current = true;
      }
    });

    initialLayout.run();
    cytoscapeRef.current = cy;
    updateSelection(cy, activePageId);

    return () => {
      cy.destroy();
      cytoscapeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    updateGraphElements(cy, elements);
    const layout = cy.layout({
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
    } as ColaLayoutOptions);

    layout.run();
  }, [elements]);

  useEffect(() => {
    const cy = cytoscapeRef.current;
    if (!cy) {
      return;
    }

    updateSelection(cy, activePageId);
  }, [activePageId]);

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
          <div
            ref={containerRef}
            className="h-full w-full"
            style={{ touchAction: 'none', cursor: isHovered ? 'grab' : 'default' }}
            aria-label="Graph canvas"
          />
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
