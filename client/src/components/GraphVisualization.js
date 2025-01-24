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
  const [selectedCount, setSelectedCount] = useState(0);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [numNodesToAdd, setNumNodesToAdd] = useState(2);

  // Add width and height constants
  const width = 800;
  const height = 600;

  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    // Clear any existing SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    // Set up the SVG dimensions
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Add zoom functionality
    const g = svg.append('g');
    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
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

    // Draw the nodes
    const nodes = g.append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add circles for nodes
    nodes.append('circle')
      .attr('r', 20)
      .attr('fill', '#69b3a2')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .on('click', handleNodeClick);

    // Add labels
    nodes.append('text')
      .text(d => d.label)
      .attr('x', 0)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333');

    // Interaction handlers
    function handleLinkMouseover(event, d) {
      d3.select(this.parentNode).select('.link-line')
        .attr('stroke', '#4a90e2')
        .attr('stroke-width', 3);

      d3.select(this.parentNode).select('.link-label')
        .attr('opacity', 1);

      tooltip.transition()
        .duration(200)
        .style('opacity', 0.9);
      
      tooltip.html(d.relationship)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    }

    function handleLinkMouseout(event, d) {
      d3.select(this.parentNode).select('.link-line')
        .attr('stroke', '#999')
        .attr('stroke-width', 2);

      d3.select(this.parentNode).select('.link-label')
        .attr('opacity', 0);

      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    }

    function handleLinkClick(event, d) {
      // Reset all links
      linkGroups.selectAll('.link-line')
        .attr('stroke', '#999')
        .attr('stroke-width', 2);

      // Highlight selected link
      d3.select(this.parentNode).select('.link-line')
        .attr('stroke', '#e74c3c')
        .attr('stroke-width', 4);

      // Show tooltip with relationship description
      tooltip.transition()
        .duration(200)
        .style('opacity', 0.9);
      
      tooltip.html(`
        <strong>Relationship:</strong><br/>
        ${d.relationship}<br/>
        <br/>
        <strong>Between:</strong><br/>
        ${d.source.label} → ${d.target.label}
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
    }

    function handleNodeClick(event, d) {
      event.stopPropagation();
      
      if (selectedNodeIds.current.has(d.id)) {
        // Deselect if already selected
        selectedNodeIds.current.delete(d.id);
        selectedNodeId.current = null;
        updateHighlighting();
        tooltip.transition().duration(200).style('opacity', 0);
      } else {
        // Select new node
        selectedNodeIds.current.add(d.id);
        selectedNodeId.current = d.id;
        updateHighlighting();
        
        // Show tooltip with Wikipedia link if available
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9);
        
        let tooltipContent = `
          <strong>${d.label}</strong><br/>
          ${d.description || 'No description available'}<br/>
        `;

        if (d.wikiUrl) {
          tooltipContent += `
            <br/>
            <a href="${d.wikiUrl}" 
               target="_blank" 
               rel="noopener noreferrer" 
               style="color: #4a90e2; text-decoration: underline;">
              Learn more on Wikipedia →
            </a>
          `;
        }
        
        tooltip.html(tooltipContent)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      }
      
      setSelectedCount(selectedNodeIds.current.size);
    }

    function updateHighlighting() {
      // Update nodes
      nodes.selectAll('circle')
        .attr('fill', d => selectedNodeIds.current.has(d.id) ? '#e74c3c' : '#69b3a2')
        .attr('stroke', d => selectedNodeIds.current.has(d.id) ? '#f1c40f' : '#fff')
        .attr('stroke-width', d => selectedNodeIds.current.has(d.id) ? 4 : 2)
        .attr('r', d => selectedNodeIds.current.has(d.id) ? 25 : 20);

      // Update links
      linkGroups.selectAll('.link-line')
        .attr('stroke', l => {
          if (selectedNodeIds.current.size === 0) return '#999';
          return (selectedNodeIds.current.has(l.source.id) || selectedNodeIds.current.has(l.target.id)) 
            ? '#e74c3c' 
            : '#999';
        })
        .attr('stroke-width', l => {
          if (selectedNodeIds.current.size === 0) return 2;
          return (selectedNodeIds.current.has(l.source.id) || selectedNodeIds.current.has(l.target.id)) 
            ? 3 
            : 1;
        })
        .attr('stroke-opacity', l => {
          if (selectedNodeIds.current.size === 0) return 0.6;
          return (selectedNodeIds.current.has(l.source.id) || selectedNodeIds.current.has(l.target.id)) 
            ? 1 
            : 0.3;
        });

      // Update connected nodes
      if (selectedNodeIds.current.size > 0) {
        const connectedNodeIds = new Set();
        data.links.forEach(link => {
          if (selectedNodeIds.current.has(link.source.id)) connectedNodeIds.add(link.target.id);
          if (selectedNodeIds.current.has(link.target.id)) connectedNodeIds.add(link.source.id);
        });

        nodes.selectAll('circle')
          .attr('fill', d => {
            if (selectedNodeIds.current.has(d.id)) return '#e74c3c';
            return connectedNodeIds.has(d.id) ? '#4a90e2' : '#69b3a2';
          })
          .attr('opacity', d => {
            if (selectedNodeIds.current.has(d.id)) return 1;
            return connectedNodeIds.has(d.id) ? 1 : 0.5;
          });
      } else {
        // Reset all nodes when nothing is selected
        nodes.selectAll('circle')
          .attr('fill', '#69b3a2')
          .attr('opacity', 1);
      }
    }

    // Add click handler to svg to deselect
    svg.on('click', () => {
      if (selectedNodeId.current) {
        selectedNodeId.current = null;
        selectedNodeIds.current.clear();
        updateHighlighting();
        tooltip.transition().duration(200).style('opacity', 0);
        setSelectedCount(0);
      }
    });

    // Drag handlers
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
      nodes.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [data]);

  const handleExtend = async (event) => {
    event.preventDefault();
    setIsExtending(true);

    try {
      const selectedNodes = Array.from(selectedNodeIds.current).map(id => 
        data.nodes.find(node => node.id === id)
      );

      console.log('Selected nodes for extension:', selectedNodes.map(n => `${n.label} (${n.id})`));

      const response = await fetch(`${getBaseUrl()}/api/extend-node`, {
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
        throw new Error(result.error || 'Failed to extend nodes');
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
      setSelectedCount(0);
      setShowExtendForm(false);

    } catch (error) {
      console.error('Error extending nodes:', error);
      alert('Error extending nodes: ' + error.message);
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <div className="graph-container">
      <div className="controls">
        <button 
          onClick={() => setShowExtendForm(true)}
          disabled={selectedNodeIds.current.size === 0}
          className="extend-button"
        >
          Extend ({selectedCount} nodes selected)
        </button>

        {showExtendForm && (
          <div className="extend-form">
            <form onSubmit={handleExtend}>
              <label>
                Number of nodes to add:
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={numNodesToAdd}
                  onChange={(e) => setNumNodesToAdd(parseInt(e.target.value))}
                />
              </label>
              <div className="form-buttons">
                <button type="submit" disabled={isExtending}>
                  {isExtending ? 'Extending...' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setShowExtendForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
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