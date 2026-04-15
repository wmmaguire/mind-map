import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const STORAGE_PLAYBACK = 'mindmap.chrome.playbackStripVisible';
const STORAGE_SEARCH = 'mindmap.chrome.graphSearchBarVisible';
const STORAGE_FORCE_LAYOUT = 'mindmap.chrome.forceLayoutEnabled';

function readStoredVisible(key, defaultVisible) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return defaultVisible;
    return raw === '1' || raw === 'true';
  } catch {
    return defaultVisible;
  }
}

const GraphChromeUiContext = createContext(null);

/**
 * Library visualize chrome: playback strip + graph search bar (#38) + D3 force layout toggle.
 * Persisted in localStorage; strip/search toggled from {@link GuestIdentityBanner} View menu;
 * force layout from {@link GraphPlaybackBanner}.
 */
export function GraphChromeUiProvider({ children }) {
  const [playbackStripVisible, setPlaybackStripVisibleState] = useState(() =>
    readStoredVisible(STORAGE_PLAYBACK, true)
  );
  const [graphSearchBarVisible, setGraphSearchBarVisibleState] = useState(() =>
    readStoredVisible(STORAGE_SEARCH, true)
  );
  const [forceLayoutEnabled, setForceLayoutEnabledState] = useState(() =>
    readStoredVisible(STORAGE_FORCE_LAYOUT, true)
  );

  const setPlaybackStripVisible = useCallback((visible) => {
    setPlaybackStripVisibleState(Boolean(visible));
    try {
      localStorage.setItem(STORAGE_PLAYBACK, visible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const setGraphSearchBarVisible = useCallback((visible) => {
    setGraphSearchBarVisibleState(Boolean(visible));
    try {
      localStorage.setItem(STORAGE_SEARCH, visible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const togglePlaybackStrip = useCallback(() => {
    setPlaybackStripVisibleState((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_PLAYBACK, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleGraphSearchBar = useCallback(() => {
    setGraphSearchBarVisibleState((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_SEARCH, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setForceLayoutEnabled = useCallback((enabled) => {
    setForceLayoutEnabledState(Boolean(enabled));
    try {
      localStorage.setItem(STORAGE_FORCE_LAYOUT, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleForceLayout = useCallback(() => {
    setForceLayoutEnabledState((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_FORCE_LAYOUT, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      playbackStripVisible,
      graphSearchBarVisible,
      forceLayoutEnabled,
      setPlaybackStripVisible,
      setGraphSearchBarVisible,
      setForceLayoutEnabled,
      togglePlaybackStrip,
      toggleGraphSearchBar,
      toggleForceLayout,
    }),
    [
      playbackStripVisible,
      graphSearchBarVisible,
      forceLayoutEnabled,
      setPlaybackStripVisible,
      setGraphSearchBarVisible,
      setForceLayoutEnabled,
      togglePlaybackStrip,
      toggleGraphSearchBar,
      toggleForceLayout,
    ]
  );

  return (
    <GraphChromeUiContext.Provider value={value}>
      {children}
    </GraphChromeUiContext.Provider>
  );
}

GraphChromeUiProvider.propTypes = {
  children: PropTypes.node,
};

export function useGraphChromeUi() {
  const ctx = useContext(GraphChromeUiContext);
  if (!ctx) {
    return {
      playbackStripVisible: true,
      graphSearchBarVisible: true,
      forceLayoutEnabled: true,
      setPlaybackStripVisible: () => {},
      setGraphSearchBarVisible: () => {},
      setForceLayoutEnabled: () => {},
      togglePlaybackStrip: () => {},
      toggleGraphSearchBar: () => {},
      toggleForceLayout: () => {},
    };
  }
  return ctx;
}
