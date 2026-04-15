import { pickCommunityAnchorNode } from './clusterAnchor';

test('pickCommunityAnchorNode chooses highest degree within community', () => {
  const community = {
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ],
  };
  const links = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'b', target: 'a' },
  ];
  const { node, degreeMap } = pickCommunityAnchorNode(community, links);
  expect(degreeMap.get('b')).toBeGreaterThan(degreeMap.get('a'));
  expect(node.id).toBe('b');
});

test('pickCommunityAnchorNode tie-breaks on thumbnail then label length', () => {
  const community = {
    nodes: [
      { id: 'a', label: 'Longer label' },
      { id: 'b', label: 'B', thumbnailUrl: 'https://example.com/x.png' },
      { id: 'c', label: 'C' },
    ],
  };
  const links = []; // all degrees equal
  const { node } = pickCommunityAnchorNode(community, links);
  expect(node.id).toBe('b');
});

