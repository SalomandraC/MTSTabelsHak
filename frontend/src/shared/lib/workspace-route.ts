import type { MwsSpace } from '../api/wikilive';

export type WorkspaceRouteState = {
  spaceId: string | null;
  pageId: string | null;
};

export function readWorkspaceRoute(): WorkspaceRouteState {
  const url = new URL(window.location.href);
  const routeMatch = url.pathname.match(/^\/spaces\/([^/]+)(?:\/pages\/([^/]+))?/);

  if (routeMatch) {
    return {
      spaceId: decodeURIComponent(routeMatch[1] ?? ''),
      pageId: routeMatch[2] ? decodeURIComponent(routeMatch[2]) : null,
    };
  }

  return {
    spaceId: url.searchParams.get('spaceId'),
    pageId: url.searchParams.get('pageId'),
  };
}

export function writeWorkspaceRoute(spaceId: string, pageId: string | null, mode: 'push' | 'replace' = 'push') {
  const url = new URL(window.location.href);
  url.pathname = pageId
    ? `/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}`
    : `/spaces/${encodeURIComponent(spaceId)}`;
  url.searchParams.delete('spaceId');
  url.searchParams.delete('pageId');

  window.history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', url);
}

export function resetWorkspaceRoute() {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.searchParams.delete('spaceId');
  url.searchParams.delete('pageId');
  window.history.replaceState({}, '', url);
}

export function resolveAccessibleSpaceId(
  spaces: MwsSpace[],
  routeSpaceId: string | null,
  storedSpaceId: string | null,
  fallbackSpaceId: string,
) {
  if (routeSpaceId && spaces.some((space) => space.id === routeSpaceId)) {
    return routeSpaceId;
  }

  if (storedSpaceId && spaces.some((space) => space.id === storedSpaceId)) {
    return storedSpaceId;
  }

  return spaces[0]?.id ?? fallbackSpaceId;
}
