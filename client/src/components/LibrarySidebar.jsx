import React from 'react';
import PropTypes from 'prop-types';
import LibraryAccountChip from './LibraryAccountChip';
import LibrarySourcesPanel from './LibrarySourcesPanel';

/**
 * Library sidebar shell: header, account chip, errors, sources panel (#33).
 */
export default function LibrarySidebar({
  isMobile,
  showSidebar,
  setShowSidebar,
  sidebarWidth,
  error,
  onErrorBannerAction,
  sourcesPanelProps,
}) {
  return (
    <aside
      className={`sidebar ${isMobile ? 'mobile' : 'desktop'} ${showSidebar ? 'visible' : 'hidden'}`}
      style={
        !isMobile
          ? { width: sidebarWidth, flexShrink: 0 }
          : undefined
      }
      aria-hidden={isMobile ? !showSidebar : undefined}
    >
      <div className="sidebar-header">
        <div className="sidebar-header__titles">
          <h2 className="sidebar-title">Library</h2>
          <p className="sidebar-subtitle">Sources and saved graphs</p>
        </div>
        {isMobile && (
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setShowSidebar(false)}
            aria-label="Close library panel"
          >
            ×
          </button>
        )}
      </div>

      <LibraryAccountChip />

      {error && (
        <div className="error sidebar-error" role="alert">
          <span className="error-text">{error}</span>
          <button
            type="button"
            className="retry-button"
            onClick={onErrorBannerAction}
          >
            {error.startsWith('Failed to fetch files') ? 'Retry' : 'Dismiss'}
          </button>
        </div>
      )}

      <div className="sidebar-content">
        <LibrarySourcesPanel {...sourcesPanelProps} />
      </div>
    </aside>
  );
}

LibrarySidebar.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  showSidebar: PropTypes.bool.isRequired,
  setShowSidebar: PropTypes.func.isRequired,
  sidebarWidth: PropTypes.number.isRequired,
  error: PropTypes.string,
  onErrorBannerAction: PropTypes.func.isRequired,
  sourcesPanelProps: PropTypes.object.isRequired,
};

LibrarySidebar.defaultProps = {
  error: null,
};
