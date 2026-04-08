import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const LibraryUiContext = createContext(null);

/**
 * Coordinates Library shell UI that lives outside {@link LibraryVisualize}
 * (e.g. mobile “open library” control in {@link GuestIdentityBanner}).
 */
export function LibraryUiProvider({ children }) {
  const openLibraryRef = useRef(() => {});
  const [mobileRailVisible, setMobileRailVisible] = useState(false);

  const registerMobileLibraryRail = useCallback((visible, openFn) => {
    setMobileRailVisible(Boolean(visible));
    openLibraryRef.current =
      typeof openFn === 'function' ? openFn : () => {};
  }, []);

  const openMobileLibrary = useCallback(() => {
    openLibraryRef.current();
  }, []);

  const value = useMemo(
    () => ({
      mobileRailVisible,
      openMobileLibrary,
      registerMobileLibraryRail,
    }),
    [mobileRailVisible, openMobileLibrary, registerMobileLibraryRail]
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
