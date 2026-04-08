import {
  getPlaybackTime,
  ensurePlaybackTimestamps,
  getSortedUniquePlaybackTimes,
  buildGraphAtPlaybackTime,
  mergePlaybackTimesFromEdit,
  cloneGraphForCommit,
} from './graphPlayback';

describe('graphPlayback', () => {
  test('getPlaybackTime prefers createdAt over timestamp', () => {
    expect(getPlaybackTime({ createdAt: 1, timestamp: 2 })).toBe(1);
    expect(getPlaybackTime({ timestamp: 2 })).toBe(2);
  });

  test('ensurePlaybackTimestamps assigns monotonic times for legacy graphs', () => {
    const g = cloneGraphForCommit({
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [{ source: 'a', target: 'b', relationship: 'r' }],
    });
    ensurePlaybackTimestamps(g);
    const ta = getPlaybackTime(g.nodes[0]);
    const tb = getPlaybackTime(g.nodes[1]);
    const tl = getPlaybackTime(g.links[0]);
    expect(ta).toEqual(expect.any(Number));
    expect(tb).toBeGreaterThan(ta);
    expect(tl).toBeGreaterThan(tb);
  });

  test('getSortedUniquePlaybackTimes dedupes and sorts', () => {
    const g = {
      nodes: [
        { id: 'a', createdAt: 10 },
        { id: 'b', createdAt: 5 },
      ],
      links: [{ source: 'a', target: 'b', createdAt: 10 }],
    };
    expect(getSortedUniquePlaybackTimes(g)).toEqual([5, 10]);
  });

  test('buildGraphAtPlaybackTime is cumulative by cutoff', () => {
    const g = cloneGraphForCommit({
      nodes: [
        { id: 'a', createdAt: 1 },
        { id: 'b', createdAt: 2 },
      ],
      links: [{ source: 'a', target: 'b', createdAt: 2 }],
    });
    const s1 = buildGraphAtPlaybackTime(g, 1);
    expect(s1.nodes).toHaveLength(1);
    expect(s1.links).toHaveLength(0);
    const s2 = buildGraphAtPlaybackTime(g, 2);
    expect(s2.nodes).toHaveLength(2);
    expect(s2.links).toHaveLength(1);
  });

  test('mergePlaybackTimesFromEdit preserves existing ids', () => {
    const prev = cloneGraphForCommit({
      nodes: [{ id: 'a', createdAt: 100, label: 'A' }],
      links: [],
    });
    const next = {
      nodes: [{ id: 'a', label: 'A2' }],
      links: [],
    };
    const out = mergePlaybackTimesFromEdit(next, prev);
    expect(getPlaybackTime(out.nodes[0])).toBe(100);
  });
});
