import React from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import './GraphVisualization.css';

class GraphVisualization extends React.Component {
  constructor(props) {
    super(props);
    this.svgRef = React.createRef();
  }

  componentDidMount() {
    this.renderGraph();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.data !== this.props.data) {
      this.renderGraph();
    }
  }

  renderGraph() {
    const { data } = this.props;
    if (!data || !data.nodes || !data.links) return;

    // Clear previous graph
    d3.select(this.svgRef.current).selectAll('*').remove();

    const width = 800;
    const height = 600;
    const svg = d3.select(this.svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Create force simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Add links
    const links = svg.append('g')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Add nodes
    const nodes = svg.append('g')
      .selectAll('circle')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', '#69b3a2');

    // Add labels
    const labels = svg.append('g')
      .selectAll('text')
      .data(data.nodes)
      .enter()
      .append('text')
      .text(d => d.label)
      .attr('font-size', '12px')
      .attr('dx', 12)
      .attr('dy', 4);

    // Update positions on each tick
    simulation.on('tick', () => {
      links
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      nodes
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      labels
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    // Add zoom capabilities
    const zoom = d3.zoom()
      .on('zoom', (event) => {
        svg.selectAll('g').attr('transform', event.transform);
      });

    svg.call(zoom);
  }

  render() {
    return (
      <div className="graph-container">
        <svg ref={this.svgRef}></svg>
        {this.props.onSave && (
          <button 
            className="save-button"
            onClick={this.props.onSave}
          >
            Save Graph
          </button>
        )}
      </div>
    );
  }
}

GraphVisualization.propTypes = {
  data: PropTypes.shape({
    nodes: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired
      })
    ).isRequired,
    links: PropTypes.arrayOf(
      PropTypes.shape({
        source: PropTypes.string.isRequired,
        target: PropTypes.string.isRequired
      })
    ).isRequired
  }).isRequired,
  onSave: PropTypes.func
};

export default GraphVisualization; 