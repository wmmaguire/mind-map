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
      .on('click', (event, d) => handleNodeClick(event, d))
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
      event.stopPropagation();
      
      if (isDeleteMode) {
        handleDeleteLink(d);
      } else {
        if (selectedNodeIds.current.has(d.source.id) || selectedNodeIds.current.has(d.target.id)) {
          selectedNodeIds.current.clear();
          selectedNodeId.current = null;
          updateHighlighting();
          tooltip.transition().duration(200).style('opacity', 0);
          setSelectedCount(0);
        } else {
          selectedNodeIds.current.add(d.source.id);
          selectedNodeIds.current.add(d.target.id);
          selectedNodeId.current = d.source.id;
          updateHighlighting();
          
          // Show tooltip with Wikipedia link if available
          tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);
          
          let tooltipContent = `
            <strong>${d.source.label} → ${d.target.label}</strong><br/>
            ${d.relationship}<br/>
          `;

          if (d.source.wikiUrl) {
            tooltipContent += `
              <br/>
              <a href="${d.source.wikiUrl}" 
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
    }

    function handleNodeClick(event, node) {
      event.stopPropagation();
      
      if (isDeleteMode) {
        handleDeleteNode(node);
      } else if (isAddingRelationship) {
        if (selectedNodes.length === 0) {
          setSelectedNodes([node]);
        } else if (selectedNodes.length === 1 && node.id !== selectedNodes[0].id) {
          setSelectedNodes([...selectedNodes, node]);
          setRelationshipForm({ show: true, relationship: '' });
        }
      } else {
        if (selectedNodeIds.current.has(node.id)) {
          selectedNodeIds.current.delete(node.id);
          selectedNodeId.current = null;
          updateHighlighting();
          tooltip.transition().duration(200).style('opacity', 0);
        } else {
          selectedNodeIds.current.add(node.id);
          selectedNodeId.current = node.id;
          updateHighlighting();
          
          // Show tooltip with Wikipedia link if available
          tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);
          
          let tooltipContent = `
            <strong>${node.label}</strong><br/>
            ${node.description || 'No description available'}<br/>
          `;

          if (node.wikiUrl) {
            tooltipContent += `
              <br/>
              <a href="${node.wikiUrl}" 
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
    }

    function updateHighlighting() {
      // Update nodes
      node.selectAll('circle')
        .attr('fill', d => selectedNodeIds.current.has(d.id) ? '#e74c3c' : '#4a90e2')
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

        node.selectAll('circle')
          .attr('fill', d => {
            if (selectedNodeIds.current.has(d.id)) return '#e74c3c';
            return connectedNodeIds.has(d.id) ? '#4a90e2' : '#4a90e2';
          })
          .attr('opacity', d => {
            if (selectedNodeIds.current.has(d.id)) return 1;
            return connectedNodeIds.has(d.id) ? 1 : 0.5;
          });
      } else {
        // Reset all nodes when nothing is selected
        node.selectAll('circle')
          .attr('fill', '#4a90e2')
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

    // Cleanup
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [data, selectedNodes, isAddingRelationship, isDeleteMode]);

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
      setSelectedCount(0);
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
      setSelectedCount(0);
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
    <div className="graph-container">
      <div className="edit-controls">
        <button 
          className="add-node-button"
          onClick={() => setShowAddForm(true)}
        >
          Add Node
        </button>
        <button 
          className={`add-relationship-button ${isAddingRelationship ? 'active' : ''}`}
          onClick={() => {
            setIsAddingRelationship(!isAddingRelationship);
            setSelectedNodes([]);
            if (isDeleteMode) setIsDeleteMode(false);
          }}
        >
          {isAddingRelationship ? 'Cancel Relationship' : 'Add Relationship'}
        </button>
        <button 
          className={`delete-button ${isDeleteMode ? 'active' : ''}`}
          onClick={() => {
            setIsDeleteMode(!isDeleteMode);
            if (isAddingRelationship) {
              setIsAddingRelationship(false);
              setSelectedNodes([]);
            }
          }}
        >
          {isDeleteMode ? 'Cancel Delete' : 'Delete'}
        </button>
      </div>

      {isDeleteMode && (
        <div className="delete-helper">
          Click on a node or relationship to delete it
        </div>
      )}

      <div className="generate-controls">
        <button 
          onClick={() => setShowGenerateForm(true)}
          disabled={selectedNodeIds.current.size === 0}
          className="generate-button"
        >
          Generate ({selectedCount} nodes selected)
        </button>
      </div>

      {isAddingRelationship && (
        <div className="relationship-helper">
          {selectedNodes.length === 0 && 'Select first node'}
          {selectedNodes.length === 1 && 'Select second node'}
          {selectedNodes.length === 2 && 'Define relationship'}
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
        <div className="generate-form">
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