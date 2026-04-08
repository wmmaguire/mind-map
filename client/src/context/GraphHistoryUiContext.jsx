import React, {
  createContext,
  useContext,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const noop = () => {};

/**
 * Bridges Library graph history controls into {@link GuestIdentityBanner} (#36).
 * Without {@link GraphHistoryUiProvider}, `setPayload` is a no-op and `payload` stays null.
 *
 * @typedef {object} GraphHistoryUiPayload
 * @property {number} entryCount
 * @property {number} index
 * @property {() => void} goEarlier
 * @property {() => void} goLater
 * @property {(i: number) => void} goToIndex
 */

const GraphHistoryUiContext = createContext({
  payload: null,
  setPayload: noop,
});

export function GraphHistoryUiProvider({ children }) {
  const [payload, setPayload] = useState(null);
  return (
    <GraphHistoryUiContext.Provider value={{ payload, setPayload }}>
      {children}
    </GraphHistoryUiContext.Provider>
  );
}

GraphHistoryUiProvider.propTypes = {
  children: PropTypes.node,
};

export function useGraphHistoryUi() {
  return useContext(GraphHistoryUiContext);
}
