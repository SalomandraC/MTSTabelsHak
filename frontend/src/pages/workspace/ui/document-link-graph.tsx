import { useMemo } from 'react';

import type { Backlink, OutgoingLink, WikiPage } from '../../../shared/api/wikilive';

type GraphNode = {
  id: string;
  title: string;
  kind: 'active' | 'incoming' | 'outgoing' | 'bidirectional';
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: 'incoming' | 'outgoing';
};

type DocumentLinkGraphProps = {
  activePage: WikiPage | null;
  backlinks: Backlink[];
  outgoingLinks: OutgoingLink[];
  onSelectPage: (pageId: string) => void;
};

const WIDTH = 360;
const HEIGHT = 250;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 132;

function polarPoint(index: number, total: number) {
  const radiusX = 124;
  const radiusY = 74;
  const angle = total === 1 ? -Math.PI / 2 : -Math.PI / 2 + (index / total) * Math.PI * 2;

  return {
    x: CENTER_X + Math.cos(angle) * radiusX,
    y: CENTER_Y + Math.sin(angle) * radiusY,
  };
}

function truncateTitle(title: string) {
  return title.length > 24 ? `${title.slice(0, 21)}...` : title;
}

export function DocumentLinkGraph({ activePage, backlinks, outgoingLinks, onSelectPage }: DocumentLinkGraphProps) {
  const { nodes, edges } = useMemo(() => {
    if (!activePage) {
      return { nodes: [], edges: [] };
    }

    const related = new Map<string, Omit<GraphNode, 'x' | 'y'>>();
    const nextEdges: GraphEdge[] = [];

    backlinks.forEach((link) => {
      related.set(link.pageId, {
        id: link.pageId,
        title: link.title,
        kind: related.get(link.pageId)?.kind === 'outgoing' ? 'bidirectional' : 'incoming',
      });
      nextEdges.push({ id: `in-${link.pageId}`, from: link.pageId, to: activePage.id, kind: 'incoming' });
    });

    outgoingLinks.forEach((link) => {
      related.set(link.targetPageId, {
        id: link.targetPageId,
        title: link.targetTitle,
        kind: related.get(link.targetPageId)?.kind === 'incoming' ? 'bidirectional' : 'outgoing',
      });
      nextEdges.push({ id: `out-${link.targetPageId}`, from: activePage.id, to: link.targetPageId, kind: 'outgoing' });
    });

    const relatedNodes = [...related.values()].slice(0, 10).map((node, index, all) => ({
      ...node,
      ...polarPoint(index, all.length),
    }));

    return {
      nodes: [
        {
          id: activePage.id,
          title: activePage.title,
          kind: 'active' as const,
          x: CENTER_X,
          y: CENTER_Y,
        },
        ...relatedNodes,
      ],
      edges: nextEdges.filter((edge) => related.has(edge.from === activePage.id ? edge.to : edge.from)),
    };
  }, [activePage, backlinks, outgoingLinks]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const relatedCount = Math.max(0, nodes.length - 1);

  return (
    <section className="fixed bottom-5 right-5 z-30 hidden w-[360px] overflow-hidden rounded-3xl border border-white/70 bg-[#0f172a]/92 text-white shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,0,55,0.26),transparent_34%),radial-gradient(circle_at_82%_74%,rgba(14,165,233,0.22),transparent_38%)]" />
      <div className="relative border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Graph View</p>
            <h3 className="mt-1 truncate font-wide text-sm font-semibold">{activePage?.title ?? 'Страница не выбрана'}</h3>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-white/70">{relatedCount} связей</span>
        </div>
      </div>

      <div className="relative h-[250px]">
        {activePage ? (
          <>
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
              <defs>
                <marker id="graph-arrow" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.55)" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);

                if (!from || !to) {
                  return null;
                }

                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={edge.kind === 'incoming' ? 'rgba(125,211,252,0.58)' : 'rgba(255,255,255,0.48)'}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    markerEnd="url(#graph-arrow)"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const isActive = node.kind === 'active';
              const kindClass =
                node.kind === 'bidirectional'
                  ? 'border-[#fbbf24]/70 bg-[#fbbf24]/20 text-[#fff7d6]'
                  : node.kind === 'incoming'
                    ? 'border-sky-300/60 bg-sky-400/15 text-sky-50'
                    : node.kind === 'outgoing'
                      ? 'border-white/25 bg-white/12 text-white'
                      : 'border-[#ff4d70]/80 bg-[#ff0037] text-white shadow-[0_0_34px_rgba(255,0,55,0.48)]';

              return (
                <button
                  key={node.id}
                  type="button"
                  disabled={isActive}
                  onClick={() => onSelectPage(node.id)}
                  title={node.title}
                  className={[
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-transform hover:scale-105',
                    isActive ? 'min-w-[132px]' : 'max-w-[112px]',
                    isActive ? 'cursor-default' : 'cursor-pointer',
                    kindClass,
                  ].join(' ')}
                  style={{ left: node.x, top: node.y }}
                >
                  <span className="block truncate">{truncateTitle(node.title)}</span>
                </button>
              );
            })}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/60">Выберите страницу, чтобы увидеть граф связей.</div>
        )}

        {activePage && relatedCount === 0 ? (
          <div className="absolute inset-x-8 bottom-7 rounded-2xl border border-dashed border-white/15 bg-white/8 px-4 py-3 text-center text-xs text-white/60">
            Связей пока нет. Добавьте ссылку через /страница, и здесь появится карта документа.
          </div>
        ) : null}
      </div>
    </section>
  );
}
