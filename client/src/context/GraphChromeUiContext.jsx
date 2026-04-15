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
 * Visibility of Library visualize chrome: playback strip + graph search bar (#38).
 * Persisted in localStorage; toggled from {@link GuestIdentityBanner} View menu.
 */
export function GraphChromeUiProvider({ children }) {
  const [playbackStripVisible, setPlaybackStripVisibleState] = useState(() =>
    readStoredVisible(STORAGE_PLAYBACK, true)
  );
  const [graphSearchBarVisible, setGraphSearchBarVisibleState] = useState(() =>
    readStoredVisible(STORAGE_SEARCH, true)
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

  const value = useMemo(
    () => ({
      playbackStripVisible,
      graphSearchBarVisible,
      setPlaybackStripVisible,
      setGraphSearchBarVisible,
      togglePlaybackStrip,
      toggleGraphSearchBar,
    }),
    [
      playbackStripVisible,
      graphSearchBarVisible,
      setPlaybackStripVisible,
      setGraphSearchBarVisible,
      togglePlaybackStrip,
      toggleGraphSearchBar,
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
      setPlaybackStripVisible: () => {},
      setGraphSearchBarVisible: () => {},
      togglePlaybackStrip: () => {},
      toggleGraphSearchBar: () => {},
    };
  }
  return ctx;
}
