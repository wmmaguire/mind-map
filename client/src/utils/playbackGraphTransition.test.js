import {
  buildCommunityIdSet,
  newCommunityIdsForPlaybackTransition,
  linkKeyForProcessedCommunityLink,
  newLinkKeysForPlaybackTransition,
} from './playbackGraphTransition';

describe('playbackGraphTransition', () => {
  it('buildCommunityIdSet collects string ids', () => {
    expect(buildCommunityIdSet([{ id: 'a' }, { id: 2 }])).toEqual(new Set(['a', '2']));
  });

  it('newCommunityIdsForPlaybackTransition returns empty when no prev', () => {
    expect(newCommunityIdsForPlaybackTransition(null, [{ id: 'x' }])).toEqual(new Set());
    expect(newCommunityIdsForPlaybackTransition(new Set(), [{ id: 'x' }])).toEqual(new Set());
  });

  it('newCommunityIdsForPlaybackTransition returns only added ids', () => {
    const prev = new Set(['a', 'b']);
    const vis = [{ id: 'b' }, { id: 'c' }];
    expect(newCommunityIdsForPlaybackTransition(prev, vis)).toEqual(new Set(['c']));
  });

  it('linkKeyForProcessedCommunityLink is stable', () => {
    expect(
      linkKeyForProcessedCommunityLink({
        source: { id: 'n1' },
        target: { id: 'n2' },
      })
    ).toBe('n1|n2');
  });

  it('newLinkKeysForPlaybackTransition returns only added keys', () => {
    const prev = new Set(['a|b']);
    const links = [
      { source: { id: 'a' }, target: { id: 'b' } },
      { source: { id: 'a' }, target: { id: 'c' } },
    ];
    expect(newLinkKeysForPlaybackTransition(prev, links)).toEqual(new Set(['a|c']));
  });
});
