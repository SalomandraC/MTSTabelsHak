import { useMemo } from 'react';

import type { WikiTreeNode } from '../../../shared/api/wikilive';

export type DocumentGraphEdge = {
  sourcePageId: string;
  targetPageId: string;
  mentionCount: number;
};

type GraphNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  degree: number;
};

type DocumentLinkGraphProps = {
  pages: WikiTreeNode[];
  activePageId: string | null;
  edges: DocumentGraphEdge[];
  onSelectPage: (pageId: string) => void;
};

const WIDTH = 288;
const HEIGHT = 230;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2 + 8;

function ringPoint(index: number, total: number, ring: 1 | 2) {
  const radiusX = ring === 1 ? 82 : 116;
  const radiusY = ring === 1 ? 58 : 84;
  const angleOffset = ring === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / 8;
  const angle = total === 1 ? angleOffset : angleOffset + (index / total) * Math.PI * 2;

  return {
    x: CENTER_X + Math.cos(angle) * radiusX,
    y: CENTER_Y + Math.sin(angle) * radiusY,
  };
}

function truncateTitle(title: string) {
  return title.length > 28 ? `${title.slice(0, 25)}...` : title;
}

export function DocumentLinkGraph({ pages, activePageId, edges, onSelectPage }: DocumentLinkGraphProps) {
  const { nodes, visibleEdges } = useMemo(() => {
    const degree = new Map<string, number>();
    const pageIds = new Set(pages.map((page) => page.id));

    edges.forEach((edge) => {
      degree.set(edge.sourcePageId, (degree.get(edge.sourcePageId) ?? 0) + edge.mentionCount);
      degree.set(edge.targetPageId, (degree.get(edge.targetPageId) ?? 0) + edge.mentionCount);
    });

    const sortedPages = [...pages].sort((a, b) => {
      if (a.id === activePageId) return -1;
      if (b.id === activePageId) return 1;
      return (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.title.localeCompare(b.title);
    });

    const activePage = sortedPages.find((page) => page.id === activePageId);
    const otherPages = sortedPages.filter((page) => page.id !== activePageId);
    const innerCount = Math.min(otherPages.length, 8);
    const outerCount = Math.max(0, otherPages.length - innerCount);

    const nextNodes: GraphNode[] = [];

    if (activePage) {
      nextNodes.push({
        id: activePage.id,
        title: activePage.title,
        x: CENTER_X,
        y: CENTER_Y,
        degree: degree.get(activePage.id) ?? 0,
      });
    }

    otherPages.forEach((page, index) => {
      const isInner = index < innerCount;
      const point = isInner
        ? ringPoint(index, innerCount, 1)
        : ringPoint(index - innerCount, outerCount, 2);

      nextNodes.push({
        id: page.id,
        title: page.title,
        degree: degree.get(page.id) ?? 0,
        ...point,
      });
    });

    if (!activePage) {
      sortedPages.forEach((page, index, all) => {
        nextNodes.push({
          id: page.id,
          title: page.title,
          degree: degree.get(page.id) ?? 0,
          ...ringPoint(index, all.length, all.length > 8 ? 2 : 1),
        });
      });
    }

    const visiblePageIds = new Set(nextNodes.map((node) => node.id));

    return {
      nodes: nextNodes,
      visibleEdges: edges.filter(
        (edge) =>
          pageIds.has(edge.sourcePageId) &&
          pageIds.has(edge.targetPageId) &&
          visiblePageIds.has(edge.sourcePageId) &&
          visiblePageIds.has(edge.targetPageId),
      ),
    };
  }, [activePageId, edges, pages]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const activeTitle = pages.find((page) => page.id === activePageId)?.title;
  const maxDegree = Math.max(1, ...nodes.map((node) => node.degree));

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
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
              {visibleEdges.map((edge) => {
                const from = nodeById.get(edge.sourcePageId);
                const to = nodeById.get(edge.targetPageId);
                const touchesActive = edge.sourcePageId === activePageId || edge.targetPageId === activePageId;

                if (!from || !to) {
                  return null;
                }

                return (
                  <line
                    key={`${edge.sourcePageId}-${edge.targetPageId}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={touchesActive ? '#ff0037' : 'rgba(17,24,39,0.26)'}
                    strokeWidth={touchesActive ? 1.8 : 1.1}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const isActive = node.id === activePageId;
              const size = isActive ? 18 : 9 + Math.round((node.degree / maxDegree) * 7);

              return (
                <button
                  key={node.id}
                  type="button"
                  disabled={isActive}
                  onClick={() => onSelectPage(node.id)}
                  title={node.title}
                  aria-label={`Открыть страницу ${node.title}`}
                  className={[
                    'group absolute rounded-full border transition-transform hover:scale-125',
                    isActive
                      ? 'border-[#ff0037] bg-[#ff0037] shadow-[0_0_0_6px_rgba(255,0,55,0.12),0_8px_20px_rgba(255,0,55,0.26)]'
                      : 'border-[#111827] bg-[#111827] shadow-[0_6px_16px_rgba(17,24,39,0.16)]',
                    isActive ? 'cursor-default' : 'cursor-pointer',
                  ].join(' ')}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: size,
                    height: size,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <span
                    className={[
                      'pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-editor-border-subtle bg-white px-2 py-0.5 text-[10px] font-semibold text-editor-text-primary shadow-lg',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    ].join(' ')}
                  >
                    {truncateTitle(node.title)}
                  </span>
                </button>
              );
            })}
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
