import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

/**
 * Landing page onboarding for `/` (#76).
 *
 * Restores the value-prop cards + hero that were removed in **#40** when the
 * shell moved Home / Visualize rails into `GuestIdentityBanner`. Navigation
 * intentionally stays in the banner — this page only ships a primary
 * product CTA (Get Started → `/visualize`) and product-focused context.
 *
 * Content is aligned with `ValueProposition.md` and the actual features
 * shipped across the analyze / canvas / insights / assess surfaces.
 */

const FEATURE_CARDS = [
  {
    id: 'ingest',
    title: 'Ingest your sources',
    body:
      'Drop in text, markdown, or recorded audio. Audio is transcribed automatically, with optional segment timestamps preserved.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'analyze',
    title: 'Analyze into a graph',
    body:
      'An LLM distills each source into a concept graph. Merge multiple sources in a single session to see how they relate.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <circle cx="5" cy="6" r="2" fill="currentColor" />
        <circle cx="19" cy="6" r="2" fill="currentColor" />
        <circle cx="12" cy="13" r="2" fill="currentColor" />
        <circle cx="6" cy="19" r="2" fill="currentColor" />
        <circle cx="18" cy="19" r="2" fill="currentColor" />
        <path
          d="M5 6l7 7m0 0l7-7M12 13l-6 6m6-6l6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'explore',
    title: 'Explore the canvas',
    body:
      'Pan, zoom, search, focus, and use the minimap. Time-travel playback replays how the graph grew from your first source.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <circle
          cx="11"
          cy="11"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M20 20l-4.35-4.35"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'develop',
    title: 'Edit, generate, explode',
    body:
      'Tune node labels by hand, or ask the model to generate and explode subgraphs from any node to develop an idea further.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M4 20l4-1 10-10-3-3L5 16l-1 4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'insights',
    title: 'See the shape',
    body:
      'Insights surface global network metrics and Notable by centrality (degree, betweenness, closeness, eigenvector).',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M4 20V10m6 10V4m6 16v-7m-14 7h18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'assess',
    title: 'Gleam insights',
    body:
      'Assess produces a two-phase reading — claims grounded in the graph, with clearly marked speculative extensions.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M4 5h12a3 3 0 013 3v11H7a3 3 0 01-3-3V5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M8 9h7M8 13h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  const goToVisualize = () => navigate('/visualize');

  return (
    <div className="landing-container">
      <div className="content landing-content">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <h1 id="landing-hero-title" className="landing-hero-title">
            MindMap
          </h1>
          <p className="landing-hero-tagline">
            Turn your writing and recorded conversations into an
            interactive concept graph.  Explore it, expand it and reveal the shape of your thinking.
          </p>
          <div className="landing-cta landing-cta--hero">
            <button
              type="button"
              className="landing-cta-primary landing-cta-primary--dynamic"
              onClick={goToVisualize}
            >
              Get Started
            </button>
            <span className="landing-cta-hint">
              No account needed to try — guest mode works out of the box.
            </span>
          </div>
        </section>

        <section
          className="landing-value-loop"
          aria-labelledby="landing-how-heading"
        >
          <h2 id="landing-how-heading" className="landing-value-loop-heading">
            How it works
          </h2>
          <ol className="landing-steps">
            <li className="landing-step">
              <span className="landing-step-num" aria-hidden>
                1
              </span>
              <div className="landing-step-body">
                <span className="landing-step-title">Add sources</span>
                <span className="landing-step-text">
                  Upload files or pick a saved graph from the library sidebar.
                </span>
              </div>
            </li>
            <li className="landing-step">
              <span className="landing-step-num" aria-hidden>
                2
              </span>
              <div className="landing-step-body">
                <span className="landing-step-title">Analyze</span>
                <span className="landing-step-text">
                  Run analyze on your files to build an interactive concept
                  map.
                </span>
              </div>
            </li>
            <li className="landing-step">
              <span className="landing-step-num" aria-hidden>
                3
              </span>
              <div className="landing-step-body">
                <span className="landing-step-title">Explore</span>
                <span className="landing-step-text">
                  Pan, zoom, search, and edit nodes on the graph canvas.
                </span>
              </div>
            </li>
          </ol>
        </section>

        <section
          className="landing-features"
          aria-labelledby="landing-features-heading"
        >
          <h2
            id="landing-features-heading"
            className="landing-section-heading"
          >
            What you can do
          </h2>
          <ul className="landing-feature-grid">
            {FEATURE_CARDS.map((card) => (
              <li key={card.id} className="landing-feature-card">
                <span className="landing-feature-icon" aria-hidden>
                  {card.icon}
                </span>
                <div className="landing-feature-body">
                  <h3 className="landing-feature-title">{card.title}</h3>
                  <p className="landing-feature-text">{card.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="landing-reflection"
          aria-labelledby="landing-reflection-heading"
        >
          <h2
            id="landing-reflection-heading"
            className="landing-section-heading"
          >
            Why it matters
          </h2>
          <p className="landing-reflection-body">
            Have you ever caught yourself lost in a conversation, asking yourself:
          </p><br />
          <p className="landing-reflection-questions">
            <span>“What were we talking about again? How did we get here?”</span>
            <span>“Where did that thought come from? And where was it going?”</span>
          </p><br />
          <p className="landing-reflection-body">
            Unstructured, free-flowing thought encourages us to explore a network of ideas that
            takes on a life of their own: self-organizing and self-emergent.
            Reflecting on the loose associations that push and pull these
            concepts is how to surface the inspirations that power novel ideas and creative discovery.
          </p>
        </section>

        <div className="landing-cta landing-cta--post-steps">
          <button
            type="button"
            className="landing-cta-primary landing-cta-primary--dynamic"
            onClick={goToVisualize}
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
