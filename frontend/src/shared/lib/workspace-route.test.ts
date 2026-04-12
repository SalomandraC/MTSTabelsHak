import { describe, expect, it } from 'vitest';

import { resolveAccessibleSpaceId } from './workspace-route';

describe('resolveAccessibleSpaceId', () => {
  const spaces = [
    { id: 'space-a', name: 'Space A' },
    { id: 'space-b', name: 'Space B' },
  ];

  it('prefers route space when it is accessible for the current user', () => {
    expect(resolveAccessibleSpaceId(spaces, 'space-b', 'space-a', 'demo-space')).toBe('space-b');
  });

  it('falls back from stale route space to stored accessible space', () => {
    expect(resolveAccessibleSpaceId(spaces, 'foreign-space', 'space-a', 'demo-space')).toBe('space-a');
  });

  it('falls back to the first accessible space when both route and storage are stale', () => {
    expect(resolveAccessibleSpaceId(spaces, 'foreign-space', 'stale-space', 'demo-space')).toBe('space-a');
  });
});
