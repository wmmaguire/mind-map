import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import './GraphVisualization.css';

// Add this function at the top of the file, outside the component
const getBaseUrl = () => {
  return process.env.NODE_ENV === 'production'
    ? 'https://talk-graph.onrender.com'
    : 'http://localhost:5001';
};

function GraphVisualization({ data, onDataUpdate }) {
  const svgRef = useRef();
  const selectedNodeIds = useRef(new Set());
  const selectedNodeId = useRef(null);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [numNodesToAdd, setNumNodesToAdd] = useState(2);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNodeData, setNewNodeData] = useState({
    label: '',
    description: '',
    wikiUrl: ''
  });
  const [isAddingRelationship, setIsAddingRelationship] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [relationshipForm, setRelationshipForm] = useState({
    show: false,
    relationship: ''
  });
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Add width and height constants
  const width = 800;
  const height = 600;

  // Add new refs without modifying existing state
  const previousZoomRef = useRef(1);
  const MERGE_THRESHOLD = 0.8; // When to merge: current zoom is 80% of previous
  const communitiesRef = useRef(null);

  // Add new refs for tracking thresholds
  const mergeThresholdRef = useRef(0.8);  // Initial merge threshold
  const splitThresholdRef = useRef(1.2);  // Initial split threshold (1/0.8)

  // Add resize listener
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear existing elements

    // Initialize hierarchical communities with individual nodes
    const initializeCommunities = () => {
      const communities = new Map();
      
      data.nodes.forEach(node => {
        communities.set(node.id, {
          id: node.id,
          nodes: [{ ...node }],
          parent: null,
          children: [],
          level: 0,
          x: node.x || width/2,
          y: node.y || height/2,
          label: node.label,
          description: node.description,
          wikiUrl: node.wikiUrl,
          color: '#4a90e2' // All initial nodes should be blue
        });
      });
      return communities;
    };

    // Merge closest communities based on graph connectivity
    const mergeCommunities = (currentCommunities) => {
      if (currentCommunities.size <= 1) return currentCommunities;

      const communityArray = Array.from(currentCommunities.values());
      const newCommunities = new Map();
      const merged = new Set();
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

      for (let i = 0; i < communityArray.length; i++) {
        if (merged.has(communityArray[i].id)) continue;

        const community1 = communityArray[i];
        let closestCommunity = null;
        let minDistance = Infinity;

        for (let j = i + 1; j < communityArray.length; j++) {
          if (merged.has(communityArray[j].id)) continue;

          const community2 = communityArray[j];
          const distance = Math.sqrt(
            Math.pow(
              d3.mean(community1.nodes, n => n.x || 0) - 
              d3.mean(community2.nodes, n => n.x || 0), 2
            ) +
            Math.pow(
              d3.mean(community1.nodes, n => n.y || 0) - 
              d3.mean(community2.nodes, n => n.y || 0), 2
            )
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestCommunity = community2;
          }
        }

        if (closestCommunity && minDistance < 100) {
          const mergedNodes = [...community1.nodes, ...closestCommunity.nodes];
          
          // Create merged community with new unique color
          const mergedCommunity = {
            id: `merged-${community1.id}-${closestCommunity.id}`,
            nodes: mergedNodes,
            parent: null,
            children: [community1, closestCommunity],
            level: Math.max(community1.level, closestCommunity.level) + 1,
            x: d3.mean(mergedNodes, n => n.x || 0),
            y: d3.mean(mergedNodes, n => n.y || 0),
            label: `Group ${i}`,
            description: `Contains ${mergedNodes.length} nodes: ${mergedNodes.map(n => n.label).join(', ')}`,
            color: colorScale(Math.random()) // Assign new unique color to merged community
          };

          merged.add(community1.id);
          merged.add(closestCommunity.id);
          newCommunities.set(mergedCommunity.id, mergedCommunity);
        } else if (!merged.has(community1.id)) {
          newCommunities.set(community1.id, community1);
        }
      }

      // Add remaining unmerged communities
      communityArray.forEach(community => {
        if (!merged.has(community.id)) {
          newCommunities.set(community.id, community);
        }
      });

      return newCommunities;
    };

    // Split communities based on their hierarchy
    const splitCommunities = (currentCommunities) => {
      const communityArray = Array.from(currentCommunities.values());
      const newCommunities = new Map();

      // Find the largest community to split
      let largestCommunity = null;
      let maxSize = 1;

      communityArray.forEach(community => {
        if (community.nodes.length > maxSize) {
          maxSize = community.nodes.length;
          largestCommunity = community;
        }
      });

      if (!largestCommunity || maxSize <= 1) {
        return currentCommunities;
      }

      console.log('Splitting community:', largestCommunity); // Debug log

      // Split the largest community back into original nodes
      largestCommunity.nodes.forEach(node => {
        // Ensure all node properties are preserved
        const restoredNode = {
          id: node.id,
          nodes: [{
            ...node,
            label: node.label || 'Unnamed Node', // Ensure label exists
            description: node.description || '',
            wikiUrl: node.wikiUrl || ''
          }],
          parent: null,
          children: [],
          level: 0,
          x: node.x || largestCommunity.x || width/2,
          y: node.y || largestCommunity.y || height/2,
          // Preserve original node properties
          label: node.label || 'Unnamed Node',
          description: node.description || '',
          wikiUrl: node.wikiUrl || '',
          color: '#4a90e2', // All initial nodes should be blue
        };
        newCommunities.set(node.id, restoredNode);
      });

      // Keep all other communities as they are
      communityArray.forEach(community => {
        if (community.id !== largestCommunity.id) {
          newCommunities.set(community.id, community);
        }
      });

      return newCommunities;
    };

    // Initialize communities if not already done
    if (!communitiesRef.current) {
      communitiesRef.current = initializeCommunities();
    }

    // Clear any existing SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    // Set up the SVG dimensions
    svg.attr('width', width);
    svg.attr('height', height);
    // Always initialize communities when the component mounts or data changes
    communitiesRef.current = initializeCommunities();

    // Modify the zoom behavior
    const g = svg.append('g');
    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        const currentZoom = event.transform.k;
        
        console.log('Zoom event:', {
          currentZoom,
          previousZoom: previousZoomRef.current,
          mergeThreshold: mergeThresholdRef.current,
          splitThreshold: splitThresholdRef.current,
          currentCommunities: communitiesRef.current?.size || 0
        });

        // Check if we should merge or split
        if (currentZoom < mergeThresholdRef.current) {
          console.log('Attempting merge with', communitiesRef.current.size, 'communities');
          const newCommunities = mergeCommunities(communitiesRef.current);
          if (newCommunities !== communitiesRef.current) {
            communitiesRef.current = newCommunities;
            updateVisualization();
            // Update merge threshold based on current zoom
          }
          mergeThresholdRef.current = currentZoom * MERGE_THRESHOLD;
          splitThresholdRef.current = currentZoom / MERGE_THRESHOLD;
        } else if (currentZoom > splitThresholdRef.current) {
          console.log('Attempting split with', communitiesRef.current.size, 'communities');
          const newCommunities = splitCommunities(communitiesRef.current);
          if (newCommunities !== communitiesRef.current) {
            communitiesRef.current = newCommunities;
            updateVisualization();
            // Update split threshold based on current zoom
          }
          splitThresholdRef.current = currentZoom / MERGE_THRESHOLD;
          mergeThresholdRef.current = currentZoom * MERGE_THRESHOLD;
        }

        // Update positions and visuals based on current communities
        const visibleCommunities = communitiesRef.current;
        const visibleNodeCount = visibleCommunities.size;
        const reductionRatio = Math.max(1, data.nodes.length / visibleNodeCount);
        const baseSize = Math.min(200, 20 * Math.sqrt(reductionRatio));

        // Update community positions
        visibleCommunities.forEach(community => {
          if (community.nodes.length > 1) {
            const centerX = d3.mean(community.nodes, d => d.x);
            const centerY = d3.mean(community.nodes, d => d.y);
            const strength = Math.min(0.95, Math.max(0, 1 - currentZoom));
            
            community.nodes.forEach(node => {
              node.x = node.x * (1 - strength) + centerX * strength;
              node.y = node.y * (1 - strength) + centerY * strength;
            });
          }
        });

        // Update node sizes and appearance
        updateHighlighting();

        // Update link visibility
        g.selectAll('.link')
          .transition()
          .duration(300)
          .style('opacity', Math.max(0.2, Math.min(0.6, currentZoom)))
          .attr('stroke-width', Math.max(1, 3 * (1 / currentZoom)));

          
        // Update labels
        g.selectAll('.node text')
          .transition()
          .duration(300)
          .attr('y', d => {
            const community = Array.from(visibleCommunities.values())
              .find(c => c.nodes.some(n => n.id === d.id));
            if (community?.nodes.length > 1) {
              const sizeMultiplier = Math.sqrt(community.nodes.length);
              const nodeSize = Math.min(200, Math.max(30, baseSize * sizeMultiplier));
              return nodeSize + 15;
            }
            return 35;
          })
          .text(d => {
            const community = Array.from(visibleCommunities.values())
              .find(c => c.nodes.some(n => n.id === d.id));
            return community?.nodes.length > 1 ? 
              `${d.label} (${community.nodes.length})` : d.label;
          })
          .attr('font-size', d => {
            const community = Array.from(visibleCommunities.values())
              .find(c => c.nodes.some(n => n.id === d.id));
            return community?.nodes.length > 1 ? 
              `${Math.max(12, baseSize/2)}px` : '12px';
          });


        previousZoomRef.current = currentZoom;
      }));

    // Create a map of nodes for reference
    const nodeMap = new Map(data.nodes.map(node => [node.id, node]));

    // Process links to ensure they reference actual node objects
    const processedLinks = data.links.map(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      return {
        ...link,
        source: nodeMap.get(sourceId),
        target: nodeMap.get(targetId)
      };
    });

    // Create the force simulation with processed data
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(processedLinks)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);

    // Draw the links with clickable areas
    const linkGroups = g.append('g')
      .selectAll('g')
      .data(processedLinks)
      .join('g')
      .attr('class', 'link-group');

    // Add visible lines directly to linkGroups
    linkGroups.append('line')
      .attr('class', 'link-line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Add wider invisible lines for better hover/click area
    linkGroups.append('line')
      .attr('class', 'link-hover-area')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 10)
      .on('mouseover', handleLinkMouseover)
      .on('mouseout', handleLinkMouseout)
      .on('click', handleLinkClick);

    // Add relationship labels to links
    const linkLabels = linkGroups.append('text')
      .attr('class', 'link-label')
      .text(d => d.relationship)
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .attr('opacity', 0);

    // Add drag behavior
    const drag = d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);

    // Update node selection with click and drag handlers
    const node = g.selectAll('.node')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .classed('selected', d => selectedNodes.some(n => n.id === d.id))
      .on('click', (event, d) => {
        event.stopPropagation();
        
        // Handle both community structure and raw node data
        if (!d) {
          console.log('No data provided');
          return;
        }

        // If it's a raw node (not a community), wrap it in the community structure
        if (!d.nodes) {
          d = {
            id: d.id,
            nodes: [d],
            label: d.label,
            description: d.description,
            wikiUrl: d.wikiUrl,
            color: '#4a90e2' // Assign initial color
          };
        }

        // Now proceed with the existing logic
        if (d.nodes.length === 1) {
          try {
            const node = d.nodes[0];
            if (!node) {
              console.log('Invalid node in single node community:', d);
              return;
            }
            handleNodeClick(event, node);
          } catch (error) {
            console.error('Error handling node click:', error);
          }
          return;
        }

        // Handle community clicks
        if (isAddingRelationship) {
          const selectedNode = d.nodes[0];
          if (selectedNode && (selectedNodes.length === 0 || selectedNodes.length === 1)) {
            setSelectedNodes(prev => [...prev, selectedNode]);
            if (selectedNodes.length === 1) {
              setRelationshipForm({ show: true, relationship: '' });
            }
          }
          return;
        }

        if (isDeleteMode && d.nodes[0]) {
          handleDeleteNode(d.nodes[0]);
          return;
        }

        // Clear previous selection
        selectedNodeIds.current.clear();
        
        // For communities
        const selectedNode = d.nodes[0];
        if (!selectedNode) {
          console.log('No valid node found in:', d);
          return;
        }

        selectedNodeIds.current.add(selectedNode.id);
        selectedNodeId.current = selectedNode.id;

        // Find all directly connected nodes
        const connectedLinks = data.links.filter(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return sourceId === selectedNode.id || targetId === selectedNode.id;
        });

        updateHighlighting();

        // Show tooltip with node details
        const tooltip = d3.select('.tooltip');
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);

        let tooltipContent = '';
        try {
          if (d.nodes.length > 1) {
            // For community nodes
            const communityLabel = d.label || 'Group';
            const communityDescription = d.description || `Contains ${d.nodes.length} nodes`;
            const validNodes = d.nodes.filter(node => node && typeof node === 'object');
            const nodeLabels = validNodes
              .map(node => node.label || 'Unnamed Node')
              .join(', ');

            tooltipContent = `
              <strong>${communityLabel}</strong><br/>
              <br/>
              ${communityDescription}<br/>
              <br/>
              Nodes: ${nodeLabels}
            `;
          } else if (selectedNode) {
            // For single nodes - verify all properties exist
            const nodeLabel = selectedNode.label || 'Unnamed Node';
            const nodeDescription = selectedNode.description || '';
            const nodeWikiUrl = selectedNode.wikiUrl || '';
            
            tooltipContent = `
              <strong>${nodeLabel}</strong><br/>
              ${nodeDescription ? `${nodeDescription}<br/>` : ''}
              ${nodeWikiUrl ? `<a href="${nodeWikiUrl}" target="_blank">Learn more</a><br/>` : ''}
            `;

            // Add related nodes section if there are any
            if (connectedLinks.length > 0) {
              tooltipContent += '<br/><strong>Related Concepts:</strong><br/>';
              const relatedNodesContent = connectedLinks
                .map(link => {
                  try {
                    const otherNodeId = typeof link.source === 'object' 
                      ? (link.source.id === selectedNode.id ? link.target.id : link.source.id)
                      : (link.source === selectedNode.id ? link.target : link.source);
                    
                    const otherNode = data.nodes.find(n => n.id === otherNodeId);
                    if (!otherNode) return '';
                    
                    return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'}`;
                  } catch (e) {
                    console.error('Error processing related node:', e);
                    return '';
                  }
                })
                .filter(Boolean)
                .join('<br/>');
              tooltipContent += relatedNodesContent;
            }
          } else {
            tooltipContent = '<strong>Node information unavailable</strong>';
          }
        } catch (e) {
          console.error('Error generating tooltip:', e);
          console.log('Node data:', d);
          tooltipContent = '<strong>Error displaying node information</strong>';
        }
        
        tooltip.html(tooltipContent)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .call(drag);

    // Update link selection with click handler
    const link = g.selectAll('.link-group')
      .data(data.links)
      .join('g')
      .attr('class', 'link-group')
      .on('click', (event, d) => handleLinkClick(event, d));

    // Update visual states based on delete mode
    node.selectAll('circle')
      .data(d => [d])
      .join('circle')
      .attr('r', 20)
      .attr('fill', d => selectedNodes.some(n => n.id === d.id) ? '#e74c3c' : '#4a90e2')
      .classed('selectable', isAddingRelationship)
      .classed('selected', d => selectedNodes.some(n => n.id === d.id))
      .classed('deletable', isDeleteMode);

    link.selectAll('.link-line')
      .classed('deletable', isDeleteMode);

    // Add labels
    node.append('text')
      .text(d => d.label)
      .attr('x', 0)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333');

    // Interaction handlers
    function handleLinkMouseover(event, link) {
      if (!link) return;

      const sourceNode = typeof link.source === 'object' ? link.source : data.nodes.find(n => n.id === link.source);
      const targetNode = typeof link.target === 'object' ? link.target : data.nodes.find(n => n.id === link.target);

      if (!sourceNode || !targetNode) {
        console.log('Warning: Could not find source or target node for link:', link);
        return;
      }

      const tooltip = d3.select('.tooltip');
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);

      const sourceLabel = sourceNode.label || 'Unnamed Node';
      const targetLabel = targetNode.label || 'Unnamed Node';
      const relationship = link.relationship || 'related to';

      const tooltipContent = `
        <strong>${sourceLabel}</strong>
        <br/>
        ${relationship}
        <br/>
        <strong>${targetLabel}</strong>
      `;

      tooltip.html(tooltipContent)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    }

    function handleLinkMouseout() {
      d3.select('.tooltip')
        .transition()
        .duration(500)
        .style('opacity', 0);
    }

    function handleLinkClick(event, d) {
      event.stopPropagation();
      
      if (isDeleteMode) {
        handleDeleteLink(d);
      } else {
        if (selectedNodeIds.current.has(d.source.id) || selectedNodeIds.current.has(d.target.id)) {
          selectedNodeIds.current.clear();
          selectedNodeId.current = null;
          updateHighlighting();
          tooltip.transition().duration(200).style('opacity', 0);
        } else {
          selectedNodeIds.current.add(d.source.id);
          selectedNodeIds.current.add(d.target.id);
          selectedNodeId.current = d.source.id;
          updateHighlighting();
          
          // Show tooltip with Wikipedia link if available
          tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);
          
          let tooltipContent = '';
          if (d.nodes.length > 1) {
            tooltipContent = `
              <strong>${d.label}</strong><br/>
              <br/>
              ${d.description}<br/>
            `;
          } else {
            const relatedNodes = data.links.filter(l => l.source.id === d.id || l.target.id === d.id).map(l => l.source.id === d.id ? l.target : l.source);
            const selectedNode = data.nodes.find(n => n.id === d.id);
            tooltipContent = `
              <strong>${selectedNode.label}</strong><br/>
              ${selectedNode.description ? `${selectedNode.description}<br/>` : ''}
              ${selectedNode.wikiUrl ? `<a href="${selectedNode.wikiUrl}" target="_blank">Learn more</a><br/>` : ''}
              ${relatedNodes.length > 0 ? '<br/><strong>Related Concepts:</strong><br/>' : ''}
              ${relatedNodes.map(n => `${n.label} - ${n.relationship}`).join('<br/>')}
            `;
          }
          
          tooltip.html(tooltipContent)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        }
      }
    }

    function handleNodeClick(event, node) {
      try {
        if (!node) {
          console.log('No node provided to handleNodeClick');
          return;
        }

        // Handle relationship adding mode separately
        if (isAddingRelationship) {
          if (selectedNodes.length === 0 || selectedNodes.length === 1) {
            setSelectedNodes(prev => [...prev, node]);
            if (selectedNodes.length === 1) {
              setRelationshipForm({ show: true, relationship: '' });
            }
          }
          return;
        }

        // Wrap raw nodes in community structure if needed
        const wrappedNode = node.nodes ? node : {
          id: node.id,
          nodes: [{ ...node }],
          parent: null,
          children: [],
          level: 0,
          x: node.x || width/2,
          y: node.y || height/2,
          label: node.label,
          description: node.description,
          wikiUrl: node.wikiUrl,
          color: '#4a90e2'
        };

        // Regular node selection toggle
        if (selectedNodeIds.current.has(wrappedNode.id)) {
          selectedNodeIds.current.delete(wrappedNode.id);
          if (selectedNodeId.current === wrappedNode.id) {
            selectedNodeId.current = null;
          }
        } else {
          selectedNodeId.current = wrappedNode.id;
          selectedNodeIds.current.add(wrappedNode.id);
        }

        updateHighlighting();

        // Only show tooltip if the node is selected
        const tooltip = d3.select('.tooltip');
        
        if (!selectedNodeIds.current.has(wrappedNode.id)) {
          tooltip.transition()
            .duration(200)
            .style('opacity', 0);
          return;
        }

        tooltip.transition()
          .duration(200)
          .style('opacity', .9);

        // Build tooltip content based on node type
        let tooltipContent;
        if (node.nodes && node.nodes.length > 1) {
          // For community nodes
          tooltipContent = `
            <strong>${node.label || 'Group'}</strong><br/>
            ${node.description || `Contains ${node.nodes.length} nodes`}<br/>
          `;
        } else {
          // For single nodes
          const nodeToShow = node.nodes ? node.nodes[0] : node;
          tooltipContent = `
            <strong>${nodeToShow.label || 'Unnamed Node'}</strong><br/>
            ${nodeToShow.description ? `${nodeToShow.description}<br/>` : ''}
            ${nodeToShow.wikiUrl ? `<a href="${nodeToShow.wikiUrl}" target="_blank">Learn more</a><br/>` : ''}
          `;

          // Find connected links for single nodes
          const connectedLinks = data.links ? data.links.filter(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            return sourceId === nodeToShow.id || targetId === nodeToShow.id;
          }) : [];

          // Add related nodes section if there are any
          if (connectedLinks && connectedLinks.length > 0) {
            tooltipContent += '<br/><strong>Related Concepts:</strong><br/>';
            const relatedNodes = connectedLinks
              .map(link => {
                try {
                  const otherNodeId = typeof link.source === 'object' 
                    ? (link.source.id === nodeToShow.id ? link.target.id : link.source.id)
                    : (link.source === nodeToShow.id ? link.target : link.source);
                  
                  const otherNode = data.nodes.find(n => n.id === otherNodeId);
                  return otherNode 
                    ? `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'}`
                    : '';
                } catch (e) {
                  return '';
                }
              })
              .filter(Boolean)
              .join('<br/>');
            tooltipContent += relatedNodes;
          }
        }

        tooltip.html(tooltipContent)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');

      } catch (error) {
        console.error('Error in handleNodeClick:', error);
        console.log('Node data causing error:', node);
        console.log('Current data state:', { 
          nodes: data.nodes, 
          links: data.links,
          selectedNodeIds: selectedNodeIds.current,
          selectedNodeId: selectedNodeId.current
        });
      }
    }

    function updateHighlighting() {
      // Highlight selected nodes
      g.selectAll('.node circle')
        .style('fill', d => selectedNodeIds.current.has(d.id) ? '#e74c3c' : d.color)
        .style('stroke', d => selectedNodeIds.current.has(d.id) ?  '#f1c40f' : '#fff')
        .style('stroke-width', d => selectedNodeIds.current.has(d.id) ?  4 : 2)
        .style('r', d => selectedNodeIds.current.has(d.id) ?  25 : (d && d.nodes && d.nodes.length > 1) ? Math.min(40, Math.max(30, 20 + 3 * d.nodes.length)) : 20);

      linkGroups.selectAll('.link-line')
        .style('stroke-opacity', l => selectedNodeIds.current.has(l.source.id) || selectedNodeIds.current.has(l.target.id) ? 1 : 0.6)
        .style('stroke',  l => selectedNodeIds.current.has(l.source.id) || selectedNodeIds.current.has(l.target.id) ? '#e74c3c' : '#999')
        .style('stroke-width', l => selectedNodeIds.current.has(l.source.id) || selectedNodeIds.current.has(l.target.id)?  3 : 1);

      // Reset all nodes and links to default state
      if (selectedNodeIds.current.size === 0) {
        g.selectAll('.node circle')
          .style('fill', d => d.color)
          .style('stroke', '#fff')
          .style('stroke-width', 2)
          .style('r', d => (d && d.nodes && d.nodes.length > 1) ? Math.min(200, Math.max(40, 20 + 3 * d.nodes.length)) : 20);
      
        linkGroups.selectAll('.link-line')
          .style('stroke-opacity', 0.6) 
          .style('stroke', '#999')
          .style('stroke-width', 1);

      }
      
    }

    // Add click handler to svg to deselect
    svg.on('click', () => {
      if (selectedNodeId.current) {
        selectedNodeId.current = null;
        selectedNodeIds.current.clear();
        updateHighlighting();
        tooltip.transition().duration(200).style('opacity', 0);
      }
    });

    // Drag event handlers
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Update positions on each tick
    simulation.on('tick', () => {
      // Update link positions
      linkGroups.selectAll('line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      // Update link label positions
      linkLabels
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      // Update node positions
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Update the visualization function to handle all node cases properly
    const updateVisualization = () => {
      // Get visible communities
      const visibleCommunities = communitiesRef.current;
      const visibleElements = Array.from(visibleCommunities.values());

      // Stop the current simulation
      if (simulation) {
        simulation.stop();
      }

      // Clear ALL existing elements before processing new ones
      g.selectAll('*').remove();

      // Process links between communities
      const processedLinks = data.links.map(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        const sourceCommunity = visibleElements.find(c => c.nodes.some(n => n.id === sourceId));
        const targetCommunity = visibleElements.find(c => c.nodes.some(n => n.id === targetId));
        
        if (!sourceCommunity || !targetCommunity) return null;
        
        return {
          source: sourceCommunity,
          target: targetCommunity,
          sourceCommunity,
          targetCommunity,
          relationship: link.relationship,
          originalLink: link
        };
      }).filter(link => 
        link && 
        link.source.id !== link.target.id && 
        link.source && 
        link.target
      );

      // Draw new links
      const links = g.selectAll('.link')
        .data(processedLinks)
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', '#999')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.6);

      // Draw nodes using visible elements but preserve original node data
      const nodes = g.selectAll('.node')
        .data(visibleElements, d => d.id)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(drag)
        .on('click', (event, d) => {
          event.stopPropagation();
          
          // Handle both community structure and raw node data
          if (!d) {
            console.log('No data provided');
            return;
          }

          // If it's a raw node (not a community), wrap it in the community structure
          if (!d.nodes) {
            d = {
              id: d.id,
              nodes: [d],
              label: d.label,
              description: d.description,
              wikiUrl: d.wikiUrl,
              color: '#4a90e2' // All initial nodes should be blue
            };
          }

          // Now proceed with the existing logic
          if (d.nodes.length === 1) {
            try {
              const node = d.nodes[0];
              if (!node) {
                console.log('Invalid node in single node community:', d);
                return;
              }
              handleNodeClick(event, node);
            } catch (error) {
              console.error('Error handling node click:', error);
            }
            return;
          }

          // Handle community clicks
          if (isAddingRelationship) {
            const selectedNode = d.nodes[0];
            if (selectedNode && (selectedNodes.length === 0 || selectedNodes.length === 1)) {
              setSelectedNodes(prev => [...prev, selectedNode]);
              if (selectedNodes.length === 1) {
                setRelationshipForm({ show: true, relationship: '' });
              }
            }
            return;
          }

          if (isDeleteMode && d.nodes[0]) {
            handleDeleteNode(d.nodes[0]);
            return;
          }

          // Clear previous selection
          selectedNodeIds.current.clear();
          
          // For communities
          const selectedNode = d.nodes[0];
          if (!selectedNode) {
            console.log('No valid node found in:', d);
            return;
          }

          selectedNodeIds.current.add(selectedNode.id);
          selectedNodeId.current = selectedNode.id;

          // Find all directly connected nodes
          const connectedLinks = data.links.filter(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            return sourceId === selectedNode.id || targetId === selectedNode.id;
          });

          updateHighlighting();

          // Show tooltip with node details
          const tooltip = d3.select('.tooltip');
          tooltip.transition()
            .duration(200)
            .style('opacity', .9);

          let tooltipContent = '';
          try {
            if (d.nodes.length > 1) {
              // For community nodes
              const communityLabel = d.label || 'Group';
              const communityDescription = d.description || `Contains ${d.nodes.length} nodes`;
              const validNodes = d.nodes.filter(node => node && typeof node === 'object');
              const nodeLabels = validNodes
                .map(node => node.label || 'Unnamed Node')
                .join(', ');

              tooltipContent = `
                <strong>${communityLabel}</strong><br/>
                <br/>
                ${communityDescription}<br/>
                <br/>
                Nodes: ${nodeLabels}
              `;
            } else if (selectedNode) {
              // For single nodes - verify all properties exist
              const nodeLabel = selectedNode.label || 'Unnamed Node';
              const nodeDescription = selectedNode.description || '';
              const nodeWikiUrl = selectedNode.wikiUrl || '';
              
              tooltipContent = `
                <strong>${nodeLabel}</strong><br/>
                ${nodeDescription ? `${nodeDescription}<br/>` : ''}
                ${nodeWikiUrl ? `<a href="${nodeWikiUrl}" target="_blank">Learn more</a><br/>` : ''}
              `;

              // Add related nodes section if there are any
              if (connectedLinks.length > 0) {
                tooltipContent += '<br/><strong>Related Concepts:</strong><br/>';
                const relatedNodesContent = connectedLinks
                  .map(link => {
                    try {
                      const otherNodeId = typeof link.source === 'object' 
                        ? (link.source.id === selectedNode.id ? link.target.id : link.source.id)
                        : (link.source === selectedNode.id ? link.target : link.source);
                        
                      const otherNode = data.nodes.find(n => n.id === otherNodeId);
                      if (!otherNode) return '';
                      
                      return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'}`;
                    } catch (e) {
                      console.error('Error processing related node:', e);
                      return '';
                    }
                  })
                  .filter(Boolean)
                  .join('<br/>');
                tooltipContent += relatedNodesContent;
              }
            } else {
              tooltipContent = '<strong>Node information unavailable</strong>';
            }
          } catch (e) {
            console.error('Error generating tooltip:', e);
            console.log('Node data:', d);
            tooltipContent = '<strong>Error displaying node information</strong>';
          }
          
          tooltip.html(tooltipContent)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        });

      // Add circles with proper sizing and coloring using colorScale
      nodes.append('circle')
        .attr('r', d => {
          if (!d || !d.nodes) return 20;
          return d.nodes.length > 1 
            ? Math.min(100, Math.max(30, 20 * Math.sqrt(d.nodes.length)))
            : 20;
        })
        .attr('fill', d => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);

      // Add labels with proper text
      nodes.append('text')
        .attr('dy', d => {
          if (!d || !d.nodes) return 25;
          return d.nodes.length > 1 
            ? Math.min(100, Math.max(30, 20 * Math.sqrt(d.nodes.length))) + 15
            : 25;
        })
        .attr('text-anchor', 'middle')
        .text(d => {
          if (!d || !d.nodes) return 'Unknown';
          if (d.nodes.length > 1) {
            return d.label || `Group (${d.nodes.length})`;
          }
          return d.nodes[0]?.label || 'Unknown';
        });

      // Update simulation with proper handling of both single nodes and communities
      simulation
        .nodes(visibleElements)
        .force('link', d3.forceLink(processedLinks)
          .id(d => d.id))
        .on('tick', () => {
          links
            .attr('x1', d => d.source.x || 0)
            .attr('y1', d => d.source.y || 0)
            .attr('x2', d => d.target.x || 0)
            .attr('y2', d => d.target.y || 0);

          nodes
            .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
        });

      simulation.alpha(0.3).restart();
    };

    // Cleanup
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [data, selectedNodes, isAddingRelationship, isDeleteMode, width, height]);

  const handleGenerate = async (event) => {
    event.preventDefault();
    setIsGenerating(true);

    try {
      const selectedNodes = Array.from(selectedNodeIds.current).map(id => 
        data.nodes.find(node => node.id === id)
      );

      console.log('Selected nodes for generation:', selectedNodes.map(n => `${n.label} (${n.id})`));

      const response = await fetch(`${getBaseUrl()}/api/generate-node`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedNodes,
          numNodes: numNodesToAdd
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate nodes');
      }

      // Create a map of all existing nodes with string IDs
      const nodeMap = new Map();
      
      // Add existing nodes to the map with string IDs
      data.nodes.forEach(node => {
        // Convert all IDs to strings
        const stringId = String(node.id);
        const nodeWithStringId = {
          ...node,
          id: stringId
        };
        nodeMap.set(stringId, nodeWithStringId);
        console.log(`Mapped existing node: ${node.label} (${stringId})`);
      });
      
      // Add new nodes to the map (these already have string IDs)
      result.data.nodes.forEach(node => {
        const baseX = data.nodes[0].x || width / 2;
        const baseY = data.nodes[0].y || height / 2;
        
        const processedNode = {
          ...node,
          x: baseX + (Math.random() - 0.5) * 200,
          y: baseY + (Math.random() - 0.5) * 200,
          vx: 0,
          vy: 0
        };
        nodeMap.set(node.id, processedNode);
        console.log(`Added new node: ${node.label} (${node.id})`);
      });

      // Process links with string IDs
      const processedLinks = data.links.map(link => {
        // Convert existing link IDs to strings
        const sourceId = typeof link.source === 'object' ? String(link.source.id) : String(link.source);
        const targetId = typeof link.target === 'object' ? String(link.target.id) : String(link.target);
        
        return {
          ...link,
          source: nodeMap.get(sourceId),
          target: nodeMap.get(targetId)
        };
      });
      
      // Process new links
      result.data.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? String(link.source.id) : String(link.source);
        const targetId = typeof link.target === 'object' ? String(link.target.id) : String(link.target);
        
        const sourceNode = nodeMap.get(sourceId);
        const targetNode = nodeMap.get(targetId);
        
        console.log('Processing link:', {
          sourceId,
          targetId,
          sourceNode: sourceNode ? `${sourceNode.label} (${sourceNode.id})` : 'not found',
          targetNode: targetNode ? `${targetNode.label} (${targetNode.id})` : 'not found'
        });

        if (sourceNode && targetNode) {
          const newLink = {
            source: sourceNode,
            target: targetNode,
            relationship: link.relationship
          };
          processedLinks.push(newLink);
          console.log('Added link:', {
            source: `${sourceNode.label} (${sourceNode.id})`,
            target: `${targetNode.label} (${targetNode.id})`,
            relationship: link.relationship
          });
        } else {
          console.warn('Failed to create link:', {
            sourceId,
            targetId,
            sourceExists: !!sourceNode,
            targetExists: !!targetNode,
            availableNodes: Array.from(nodeMap.entries()).map(([id, node]) => `${node.label} (${id})`)
          });
        }
      });

      // Create new data object with consistent string IDs
      const newData = {
        nodes: Array.from(nodeMap.values()),
        links: processedLinks
      };

      // Validate the final data
      console.log('Final data validation:', {
        totalNodes: newData.nodes.length,
        totalLinks: newData.links.length,
        allNodes: newData.nodes.map(n => `${n.label} (${n.id})`),
        allLinks: newData.links.map(l => ({
          source: typeof l.source === 'object' ? `${l.source.label} (${l.source.id})` : l.source,
          target: typeof l.target === 'object' ? `${l.target.label} (${l.target.id})` : l.target,
          relationship: l.relationship
        }))
      });

      if (onDataUpdate) {
        onDataUpdate(newData);
      }

      selectedNodeIds.current.clear();
      selectedNodeId.current = null;
      setShowGenerateForm(false);

    } catch (error) {
      console.error('Error generating nodes:', error);
      alert('Error generating nodes: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddNodeSubmit = (e) => {
    e.preventDefault();
    
    const newNode = {
      id: `node_${Date.now()}`,
      label: newNodeData.label,
      description: newNodeData.description,
      wikiUrl: newNodeData.wikiUrl,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0
    };

    const newData = {
      nodes: [...data.nodes, newNode],
      links: [...data.links]
    };

    onDataUpdate(newData);
    setShowAddForm(false);
    setNewNodeData({ label: '', description: '', wikiUrl: '' });
  };

  const handleAddRelationship = (e) => {
    e.preventDefault();
    
    const newLink = {
      source: selectedNodes[0],
      target: selectedNodes[1],
      relationship: relationshipForm.relationship
    };

    const newData = {
      nodes: [...data.nodes],
      links: [...data.links, newLink]
    };

    onDataUpdate(newData);
    
    // Reset states
    setRelationshipForm({ show: false, relationship: '' });
    setSelectedNodes([]);
    setIsAddingRelationship(false);
  };

  const handleDeleteNode = (node) => {
    // Find all connected relationships
    const connectedLinks = data.links.filter(l => 
      l.source.id === node.id || l.target.id === node.id
    );

    const confirmMessage = `Are you sure you want to delete the node "${node.label}"?\n\n` + 
      (connectedLinks.length > 0 
        ? `This will also delete ${connectedLinks.length} connected relationship${connectedLinks.length === 1 ? '' : 's'}`
        : 'This node has no connected relationships.');

    if (window.confirm(confirmMessage)) {
      // Remove the node
      const newNodes = data.nodes.filter(n => n.id !== node.id);
      
      // Remove all connected relationships
      const newLinks = data.links.filter(l => 
        l.source.id !== node.id && l.target.id !== node.id
      );
      
      onDataUpdate({
        nodes: newNodes,
        links: newLinks
      });
      
      // Clear any selections
      selectedNodeIds.current.clear();
      selectedNodeId.current = null;
    }
  };

  const handleDeleteLink = (link) => {
    if (window.confirm(`Are you sure you want to delete the relationship "${link.relationship}" between "${link.source.label}" and "${link.target.label}"?`)) {
      const newLinks = data.links.filter(l => 
        !(l.source.id === link.source.id && l.target.id === link.target.id)
      );
      
      onDataUpdate({
        nodes: [...data.nodes],
        links: newLinks
      });
    }
  };

  return (
    <div className="graph-visualization-container">
      <div className={`controls-panel ${dimensions.width <= 768 ? 'mobile' : ''} ${showSidebar ? 'visible' : 'hidden'}`}>
        <div 
          className="controls-header"
          onClick={() => dimensions.width <= 768 && setShowSidebar(!showSidebar)}
        >
          <h3>Graph Controls</h3>
          {dimensions.width <= 768 && (
            <button 
              className="controls-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setShowSidebar(!showSidebar);
              }}
            >
              {showSidebar ? '×' : '☰'}
            </button>
          )}
        </div>
        
        <div className="controls-content">
          <div className="edit-controls">
            <button
              className="generate-button"
              onClick={() => setShowGenerateForm(true)}
            >
              Generate Nodes
            </button>
            <button
              className={`add-node-button ${showAddForm ? 'active' : ''}`}
              onClick={() => setShowAddForm(true)}
            >
              Add Node
            </button>
            <button
              className={`add-relationship-button ${isAddingRelationship ? 'active' : ''}`}
              onClick={() => setIsAddingRelationship(!isAddingRelationship)}
            >
              Add Relationship
            </button>
            <button
              className={`delete-button ${isDeleteMode ? 'active' : ''}`}
              onClick={() => setIsDeleteMode(!isDeleteMode)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {isDeleteMode && (
        <div className="delete-helper">
          Click on a node or relationship to delete it
        </div>
      )}

      {relationshipForm.show && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Define Relationship</h2>
            <form onSubmit={handleAddRelationship}>
              <div className="form-group">
                <label>Relationship:</label>
                <input
                  type="text"
                  value={relationshipForm.relationship}
                  onChange={(e) => setRelationshipForm({
                    ...relationshipForm,
                    relationship: e.target.value
                  })}
                  placeholder="e.g., 'is part of', 'relates to'"
                  required
                  autoFocus
                />
              </div>
              <div className="relationship-preview">
                {selectedNodes[0]?.label} → {selectedNodes[1]?.label}
              </div>
              <div className="modal-buttons">
                <button type="submit">Add Relationship</button>
                <button 
                  type="button" 
                  onClick={() => {
                    setRelationshipForm({ show: false, relationship: '' });
                    setSelectedNodes([]);
                    setIsAddingRelationship(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Add New Concept</h2>
            <form onSubmit={handleAddNodeSubmit}>
              <div className="form-group">
                <label>Label:</label>
                <input
                  type="text"
                  value={newNodeData.label}
                  onChange={(e) => setNewNodeData({...newNodeData, label: e.target.value})}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={newNodeData.description}
                  onChange={(e) => setNewNodeData({...newNodeData, description: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>URL:</label>
                <input
                  type="url"
                  value={newNodeData.wikiUrl}
                  onChange={(e) => setNewNodeData({...newNodeData, wikiUrl: e.target.value})}
                  placeholder="https://"
                />
              </div>
              <div className="modal-buttons">
                <button type="submit">Add Concept</button>
                <button type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGenerateForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <form onSubmit={handleGenerate}>
              <label>
                Number of nodes to generate:
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={numNodesToAdd}
                  onChange={(e) => setNumNodesToAdd(parseInt(e.target.value))}
                />
              </label>
              <div className="form-buttons">
                <button type="submit" disabled={isGenerating}>
                  {isGenerating ? 'Generating...' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setShowGenerateForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <svg ref={svgRef} className="graph-visualization"></svg>
    </div>
  );
}

GraphVisualization.propTypes = {
  data: PropTypes.shape({
    nodes: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        description: PropTypes.string,
        wikiUrl: PropTypes.string,
        x: PropTypes.number,
        y: PropTypes.number,
        vx: PropTypes.number,
        vy: PropTypes.number,
        index: PropTypes.number
      })
    ).isRequired,
    links: PropTypes.arrayOf(
      PropTypes.shape({
        source: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.object
        ]).isRequired,
        target: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.object
        ]).isRequired,
        relationship: PropTypes.string
      })
    ).isRequired
  }),
  onDataUpdate: PropTypes.func
};

export default GraphVisualization; 