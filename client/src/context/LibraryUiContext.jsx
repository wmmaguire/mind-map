import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
import PropTypes from 'prop-types';

const LibraryUiContext = createContext(null);

/**
 * Coordinates Library shell UI that lives outside {@link LibraryVisualize}
 * (banner “Open Library” in {@link GuestIdentityBanner}; ref registered while visualize mounts).
 */
export function LibraryUiProvider({ children }) {
  const openLibraryRef = useRef(() => {});

  const registerMobileLibraryRail = useCallback((active, openFn) => {
    openLibraryRef.current =
      active && typeof openFn === 'function' ? openFn : () => {};
  }, []);

  const openMobileLibrary = useCallback(() => {
    openLibraryRef.current();
  }, []);

  const value = useMemo(
    () => ({
      openMobileLibrary,
      registerMobileLibraryRail,
    }),
    [openMobileLibrary, registerMobileLibraryRail]
  );

  return (
    <LibraryUiContext.Provider value={value}>
      {children}
    </LibraryUiContext.Provider>
  );
}

LibraryUiProvider.propTypes = {
  children: PropTypes.node,
};

export function useLibraryUi() {
  const ctx = useContext(LibraryUiContext);
  if (ctx == null) {
    throw new Error('useLibraryUi must be used within LibraryUiProvider');
  }
  return ctx;
}
