import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const GraphTitleContext = createContext(null);

/**
 * Shell graph title shown in {@link GuestIdentityBanner} while Library is active.
 */
export function GraphTitleProvider({ children }) {
  const [graphTitle, setGraphTitleState] = useState(null);

  const setGraphTitle = useCallback((title) => {
    if (title == null || title === '') {
      setGraphTitleState(null);
    } else {
      setGraphTitleState(String(title));
    }
  }, []);

  const value = useMemo(
    () => ({ graphTitle, setGraphTitle }),
    [graphTitle, setGraphTitle]
  );

  return (
    <GraphTitleContext.Provider value={value}>
      {children}
    </GraphTitleContext.Provider>
  );
}

GraphTitleProvider.propTypes = {
  children: PropTypes.node,
};

export function useGraphTitle() {
  const ctx = useContext(GraphTitleContext);
  if (ctx == null) {
    throw new Error('useGraphTitle must be used within GraphTitleProvider');
  }
  return ctx;
}
