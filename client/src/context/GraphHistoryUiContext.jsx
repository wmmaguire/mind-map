import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const noop = () => {};

/**
 * Bridges Library graph history + optional share/save into the shell (#36 / #39).
 * {@link GuestIdentityBanner} reads `sharePayload` (read-only link) on `/visualize`;
 * {@link GraphPlaybackBanner} reads history + save. Without {@link GraphHistoryUiProvider},
 * `setPayload` / `setSharePayload` / `setSavePayload` are no-ops.
 *
 * @typedef {object} GraphHistoryUiPayload
 * @property {number} entryCount
 * @property {number} index
 * @property {() => void} goEarlier
 * @property {() => void} goLater
 * @property {(i: number) => void} goToIndex
 *
 * @typedef {object} GraphHistorySharePayload
 * @property {() => void} onShareClick
 *
 * @typedef {object} GraphHistorySavePayload
 * @property {() => void} onSaveClick
 * @property {boolean} saving
 */

const GraphHistoryUiContext = createContext({
  payload: null,
  setPayload: noop,
  sharePayload: null,
  setSharePayload: noop,
  savePayload: null,
  setSavePayload: noop,
});

export function GraphHistoryUiProvider({ children }) {
  const [payload, setPayload] = useState(null);
  const [sharePayload, setSharePayload] = useState(null);
  const [savePayload, setSavePayload] = useState(null);
  const value = useMemo(
    () => ({
      payload,
      setPayload,
      sharePayload,
      setSharePayload,
      savePayload,
      setSavePayload,
    }),
    [payload, sharePayload, savePayload]
  );
  return (
    <GraphHistoryUiContext.Provider value={value}>
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
