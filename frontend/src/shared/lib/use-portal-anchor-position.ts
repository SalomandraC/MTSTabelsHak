import { useEffect, useMemo, useState, type RefObject } from 'react';

export type PortalAnchorPosition = {
  x: number;
  y: number;
  surfaceWidth?: number;
  surfaceHeight?: number;
};

type PortalAnchorPositionOptions = {
  panelWidth: number;
  panelHeight: number;
  gap?: number;
  margin?: number;
};

export function usePortalAnchorPosition(
  anchor: PortalAnchorPosition | null,
  surfaceRef: RefObject<HTMLElement | null> | null,
  options: PortalAnchorPositionOptions,
) {
  const { panelWidth, panelHeight, gap = 8, margin = 8 } = options;
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!anchor) {
      return undefined;
    }

    const surface = surfaceRef?.current;

    const refreshPosition = () => {
      setRevision((value) => value + 1);
    };

    surface?.addEventListener('scroll', refreshPosition, { passive: true });
    window.addEventListener('scroll', refreshPosition, { passive: true });
    window.addEventListener('resize', refreshPosition);

    if (typeof ResizeObserver !== 'undefined' && surface) {
      const observer = new ResizeObserver(refreshPosition);
      observer.observe(surface);

      refreshPosition();

      return () => {
        observer.disconnect();
        surface.removeEventListener('scroll', refreshPosition);
        window.removeEventListener('scroll', refreshPosition);
        window.removeEventListener('resize', refreshPosition);
      };
    }

    refreshPosition();

    return () => {
      surface?.removeEventListener('scroll', refreshPosition);
      window.removeEventListener('scroll', refreshPosition);
      window.removeEventListener('resize', refreshPosition);
    };
  }, [anchor, surfaceRef]);

  return useMemo(() => {
    if (!anchor) {
      return null;
    }

    const surfaceRect = surfaceRef?.current?.getBoundingClientRect();
    const viewportLeft = surfaceRect?.left ?? 0;
    const viewportTop = surfaceRect?.top ?? 0;
    const viewportWidth = surfaceRect?.width ?? window.innerWidth;
    const viewportHeight = surfaceRect?.height ?? window.innerHeight;

    const anchorX = viewportLeft + anchor.x;
    const anchorY = viewportTop + anchor.y;
    const preferRight = anchorX + gap;
    const preferLeft = anchorX - panelWidth - gap;
    const canOpenRight = preferRight + panelWidth <= viewportLeft + viewportWidth - margin;
    const canOpenLeft = preferLeft >= viewportLeft + margin;

    let left = preferRight;

    if (!canOpenRight && canOpenLeft) {
      left = preferLeft;
    } else if (!canOpenRight && !canOpenLeft) {
      left = Math.min(
        Math.max(anchorX + gap, viewportLeft + margin),
        Math.max(viewportLeft + margin, viewportLeft + viewportWidth - panelWidth - margin),
      );
    }

    const top = Math.min(
      Math.max(anchorY + gap, viewportTop + margin),
      Math.max(viewportTop + margin, viewportTop + viewportHeight - panelHeight - margin),
    );

    return {
      left,
      top,
    };
  }, [anchor, gap, margin, panelHeight, panelWidth, revision, surfaceRef]);
}