import { useEffect, useRef, useState } from 'react';

export const LEFT_SIDEBAR_MIN_WIDTH = 296;
export const LEFT_SIDEBAR_MAX_WIDTH = 420;
export const RIGHT_SIDEBAR_MIN_WIDTH = 320;
export const RIGHT_SIDEBAR_MAX_WIDTH = 440;

type SidebarSide = 'left' | 'right';

type DragState = {
  startX: number;
  startWidth: number;
};

type UseResizableSidebarOptions = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: SidebarSide;
};

export function clampSidebarWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(width, minWidth), maxWidth);
}

export function getResizedSidebarWidth(
  side: SidebarSide,
  startWidth: number,
  startX: number,
  currentX: number,
  minWidth: number,
  maxWidth: number,
) {
  const delta = side === 'left' ? currentX - startX : startX - currentX;
  return clampSidebarWidth(startWidth + delta, minWidth, maxWidth);
}

export function useResizableSidebar({ defaultWidth, minWidth, maxWidth, side }: UseResizableSidebarOptions) {
  const [width, setWidth] = useState(() => clampSidebarWidth(defaultWidth, minWidth, maxWidth));
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      setWidth(getResizedSidebarWidth(side, dragState.startWidth, dragState.startX, event.clientX, minWidth, maxWidth));
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
  }, [maxWidth, minWidth, side]);

  const startResize = (clientX: number) => {
    dragStateRef.current = {
      startX: clientX,
      startWidth: width,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return {
    width,
    isCollapsed,
    collapse: () => setIsCollapsed(true),
    expand: () => setIsCollapsed(false),
    startResize,
  };
}
