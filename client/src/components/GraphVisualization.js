import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import './GraphVisualization.css';

function GraphVisualization({ data }) {
  const svgRef = useRef();

  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    // Clear any existing SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    // Set up the SVG dimensions
    const width = 800;
    const height = 600;
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

    // Create the force simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink()
        .links(data.links)
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
      .data(data.links)
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

    // Add state for selected node
    let selectedNodeId = null;

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
      event.stopPropagation(); // Prevent event bubbling

      // Toggle selection
      if (selectedNodeId === d.id) {
        // Deselect if already selected
        selectedNodeId = null;
        updateHighlighting();
        tooltip.transition().duration(200).style('opacity', 0);
      } else {
        // Select new node
        selectedNodeId = d.id;
        updateHighlighting();
        
        // Show tooltip with Wikipedia link if available
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9);
        
        let tooltipContent = `
          <strong>${d.label}</strong><br/>
          ${d.description || 'No description available'}<br/>
        `;

        // Add Wikipedia link if available
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
    }

    function updateHighlighting() {
      // Update nodes
      nodes.selectAll('circle')
        .attr('fill', d => d.id === selectedNodeId ? '#e74c3c' : '#69b3a2')
        .attr('stroke', d => d.id === selectedNodeId ? '#f1c40f' : '#fff')
        .attr('stroke-width', d => d.id === selectedNodeId ? 4 : 2)
        .attr('r', d => d.id === selectedNodeId ? 25 : 20);

      // Update links
      linkGroups.selectAll('.link-line')
        .attr('stroke', l => {
          if (!selectedNodeId) return '#999';
          return (l.source.id === selectedNodeId || l.target.id === selectedNodeId) 
            ? '#e74c3c' 
            : '#999';
        })
        .attr('stroke-width', l => {
          if (!selectedNodeId) return 2;
          return (l.source.id === selectedNodeId || l.target.id === selectedNodeId) 
            ? 3 
            : 1;
        })
        .attr('stroke-opacity', l => {
          if (!selectedNodeId) return 0.6;
          return (l.source.id === selectedNodeId || l.target.id === selectedNodeId) 
            ? 1 
            : 0.3;
        });

      // Update connected nodes
      if (selectedNodeId) {
        const connectedNodeIds = new Set();
        data.links.forEach(link => {
          if (link.source.id === selectedNodeId) connectedNodeIds.add(link.target.id);
          if (link.target.id === selectedNodeId) connectedNodeIds.add(link.source.id);
        });

        nodes.selectAll('circle')
          .attr('fill', d => {
            if (d.id === selectedNodeId) return '#e74c3c';
            return connectedNodeIds.has(d.id) ? '#4a90e2' : '#69b3a2';
          })
          .attr('opacity', d => {
            if (d.id === selectedNodeId) return 1;
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
      if (selectedNodeId) {
        selectedNodeId = null;
        updateHighlighting();
        tooltip.transition().duration(200).style('opacity', 0);
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

  return <svg ref={svgRef} className="graph-visualization"></svg>;
}

GraphVisualization.propTypes = {
  data: PropTypes.shape({
    nodes: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        description: PropTypes.string
      })
    ).isRequired,
    links: PropTypes.arrayOf(
      PropTypes.shape({
        source: PropTypes.string.isRequired,
        target: PropTypes.string.isRequired,
        relationship: PropTypes.string
      })
    ).isRequired
  })
};

export default GraphVisualization; 