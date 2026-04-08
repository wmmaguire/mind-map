import React, { useEffect, useState } from 'react';
import { useGraphHistoryUi } from '../context/GraphHistoryUiContext';
import './GuestIdentityBanner.css';

/** Interval at 1× speed (ms between steps while Play is active). */
const GRAPH_HISTORY_BASE_MS = 1800;

const GRAPH_HISTORY_SPEED_OPTIONS = [
  { value: 0.5, label: '0.5×' },
  { value: 0.75, label: '0.75×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
  { value: 3, label: '3×' },
];

const GRAPH_HISTORY_SPEED_STORAGE_KEY = 'mindmap.graphHistoryPlaySpeed';

function readStoredGraphHistoryPlaySpeed() {
  try {
    const raw = localStorage.getItem(GRAPH_HISTORY_SPEED_STORAGE_KEY);
    if (raw == null || raw === '') return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    const match = GRAPH_HISTORY_SPEED_OPTIONS.find((o) => o.value === n);
    return match ? match.value : 1;
  } catch {
    return 1;
  }
}

export function GraphHistoryBannerControls() {
  const { payload, sharePayload, savePayload } = useGraphHistoryUi();
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(readStoredGraphHistoryPlaySpeed);

  useEffect(() => {
    if (!payload) setPlaying(false);
  }, [payload]);

  useEffect(() => {
    try {
      localStorage.setItem(GRAPH_HISTORY_SPEED_STORAGE_KEY, String(playSpeed));
    } catch {
      /* ignore */
    }
  }, [playSpeed]);

  const intervalMs = GRAPH_HISTORY_BASE_MS / playSpeed;

  useEffect(() => {
    if (!playing || !payload || payload.entryCount < 2) {
      return undefined;
    }
    const id = window.setInterval(() => {
      if (payload.index >= payload.entryCount - 1) {
        payload.goToIndex(0);
      } else {
        payload.goLater();
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, payload, intervalMs]);

  const showHistory = Boolean(payload && payload.entryCount >= 2);

  if (!showHistory && !sharePayload && !savePayload) return null;

  const atStart = showHistory ? payload.index <= 0 : true;
  const atEnd = showHistory ? payload.index >= payload.entryCount - 1 : true;

  return (
    <div className="guest-identity-banner__graph-toolbar">
      {(showHistory || savePayload) && (
        <div
          className="guest-identity-banner__graph-history"
          role="group"
          aria-label={showHistory ? 'Graph history replay' : 'Graph actions'}
        >
          {savePayload && (
            <button
              type="button"
              className="guest-identity-banner__save-graph-btn"
              onClick={savePayload.onSaveClick}
              disabled={savePayload.saving}
              aria-busy={savePayload.saving}
              aria-label="Save current graph"
            >
              {savePayload.saving ? 'Saving…' : 'save'}
            </button>
          )}
          {showHistory && (
            <>
              <button
                type="button"
                className={`guest-identity-banner__graph-history-play${playing ? ' is-playing' : ''}`}
                onClick={() => setPlaying((p) => !p)}
                aria-pressed={playing}
                aria-label={playing ? 'Pause history replay' : 'Play history replay'}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                className="guest-identity-banner__graph-history-btn"
                onClick={payload.goEarlier}
                disabled={atStart}
                aria-label="Earlier graph state"
              >
                ◀
              </button>
              <input
                type="range"
                className="guest-identity-banner__graph-history-range"
                min={0}
                max={payload.entryCount - 1}
                step={1}
                value={payload.index}
                onChange={(e) => payload.goToIndex(Number(e.target.value))}
                aria-label="History replay step"
                aria-valuetext={`State ${payload.index + 1} of ${payload.entryCount}`}
              />
              <span className="guest-identity-banner__graph-history-pos" aria-hidden>
                {payload.index + 1}/{payload.entryCount}
              </span>
              <div className="guest-identity-banner__graph-history-forward-group">
                <button
                  type="button"
                  className="guest-identity-banner__graph-history-btn"
                  onClick={payload.goLater}
                  disabled={atEnd}
                  aria-label="Later graph state"
                >
                  ▶
                </button>
                <div className="guest-identity-banner__graph-history-speed">
                  <select
                    id="guest-graph-history-play-speed"
                    className="guest-identity-banner__graph-history-speed-select"
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(Number(e.target.value))}
                    aria-label="Playback speed"
                  >
                    {GRAPH_HISTORY_SPEED_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {sharePayload && (
                  <button
                    type="button"
                    className="guest-identity-banner__library-share-btn"
                    onClick={sharePayload.onShareClick}
                    aria-label="Copy read-only link to clipboard"
                  >
                    share
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {sharePayload && !showHistory && (
        <button
          type="button"
          className="guest-identity-banner__library-share-btn"
          onClick={sharePayload.onShareClick}
          aria-label="Copy read-only link to clipboard"
        >
          share
        </button>
      )}
    </div>
  );
}

function playbackToolbarVisible(payload, sharePayload, savePayload) {
  return (
    Boolean(payload && payload.entryCount >= 2) ||
    Boolean(sharePayload) ||
    Boolean(savePayload)
  );
}

/**
 * Second shell strip below {@link GuestIdentityBanner}: share + history playback only (#36 / #39).
 */
export default function GraphPlaybackBanner() {
  const { payload, sharePayload, savePayload } = useGraphHistoryUi();
  if (!playbackToolbarVisible(payload, sharePayload, savePayload)) {
    return null;
  }

  return (
    <aside
      className="guest-identity-banner guest-identity-banner--registered guest-identity-banner--playback-strip"
      role="region"
      aria-label="Graph save, playback, and share"
    >
      <div className="guest-identity-banner__playback-inner">
        <GraphHistoryBannerControls />
      </div>
    </aside>
  );
}
