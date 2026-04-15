import type { Editor } from '@tiptap/core';

export type NavigationOutlineNode = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  pos: number;
  number: string;
  children: NavigationOutlineNode[];
};

function createNode(title: string, level: 1 | 2 | 3, pos: number, number: string): NavigationOutlineNode {
  return {
    id: `${level}-${pos}`,
    title,
    level,
    pos,
    number,
    children: [],
  };
}

export function collectNavigationOutline(editor: Editor | null): NavigationOutlineNode[] {
  if (!editor) {
    return [];
  }

  const counters = [0, 0, 0];
  const roots: NavigationOutlineNode[] = [];
  const stack: NavigationOutlineNode[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') {
      return true;
    }

    const rawLevel = Number(node.attrs?.level ?? 0);
    if (!Number.isFinite(rawLevel) || rawLevel < 1 || rawLevel > 3) {
      return true;
    }

    const level = rawLevel as 1 | 2 | 3;
    counters[level - 1] += 1;
    for (let index = level; index < counters.length; index += 1) {
      counters[index] = 0;
    }

    const title = node.textContent.trim();
    if (!title) {
      return true;
    }

    const number = counters.slice(0, level).filter(Boolean).join('.');
    const outlineNode = createNode(title, level, pos, number);

    while (stack.length >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(outlineNode);
    } else {
      stack[stack.length - 1].children.push(outlineNode);
    }

    stack.push(outlineNode);
    return true;
  });

  return roots;
}

export function findNavigationItemAtPos(nodes: NavigationOutlineNode[], selectionPos: number): NavigationOutlineNode | null {
  let current: NavigationOutlineNode | null = null;

  const visit = (items: NavigationOutlineNode[]) => {
    for (const item of items) {
      if (item.pos <= selectionPos) {
        current = item;
      }

      if (item.children.length > 0) {
        visit(item.children);
      }
    }
  };

  visit(nodes);
  return current;
}
