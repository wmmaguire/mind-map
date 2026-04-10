import React, { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import LibrarySourcesPanel from './LibrarySourcesPanel';

/**
 * Library sidebar shell: header, errors, sources panel.
 */
export default function LibrarySidebar({
  isMobile,
  showSidebar,
  setShowSidebar,
  sidebarWidth,
  mobileLibraryDrawerWidth,
  onMobileLibraryDrawerWidthChange,
  mobileLibraryDrawerMinWidth,
  mobileLibraryDrawerMaxWidth,
  onMobileLibraryDrawerDragEnd,
  mobileLibraryDrawerMaximized,
  onToggleMobileLibraryDrawerMaximized,
  error,
  onErrorBannerAction,
  sourcesPanelProps,
}) {
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const dragRef = useRef({ startX: 0, startW: 0 });
  const widthDuringDragRef = useRef(mobileLibraryDrawerWidth ?? 0);
  const draggingActiveRef = useRef(false);

  const showMobilePull =
    isMobile &&
    showSidebar &&
    typeof mobileLibraryDrawerWidth === 'number' &&
    typeof onMobileLibraryDrawerWidthChange === 'function' &&
    typeof mobileLibraryDrawerMinWidth === 'number' &&
    typeof mobileLibraryDrawerMaxWidth === 'number';

  const asideStyle = !isMobile
    ? showSidebar
      ? { width: sidebarWidth, flexShrink: 0 }
      : {
        width: 0,
        minWidth: 0,
        maxWidth: 0,
        flexShrink: 0,
        overflow: 'hidden',
        borderRightWidth: 0,
        padding: 0,
        margin: 0,
        visibility: 'hidden',
      }
    : showSidebar && typeof mobileLibraryDrawerWidth === 'number'
      ? { width: mobileLibraryDrawerWidth, flexShrink: 0 }
      : undefined;

  const onEdgePointerDown = useCallback(
    (e) => {
      if (!showMobilePull) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startW: mobileLibraryDrawerWidth,
      };
      widthDuringDragRef.current = mobileLibraryDrawerWidth;
      draggingActiveRef.current = true;
      setIsDraggingDrawer(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [showMobilePull, mobileLibraryDrawerWidth]
  );

  const onEdgePointerMove = useCallback(
    (e) => {
      if (
        !draggingActiveRef.current ||
        !e.currentTarget.hasPointerCapture(e.pointerId)
      ) {
        return;
      }
      const dx = e.clientX - dragRef.current.startX;
      const next = Math.min(
        mobileLibraryDrawerMaxWidth,
        Math.max(mobileLibraryDrawerMinWidth, dragRef.current.startW + dx)
      );
      widthDuringDragRef.current = next;
      onMobileLibraryDrawerWidthChange(next);
    },
    [
      mobileLibraryDrawerMaxWidth,
      mobileLibraryDrawerMinWidth,
      onMobileLibraryDrawerWidthChange,
    ]
  );

  const onEdgePointerUp = useCallback(
    (e) => {
      if (!draggingActiveRef.current) return;
      draggingActiveRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      setIsDraggingDrawer(false);
      if (onMobileLibraryDrawerDragEnd) {
        onMobileLibraryDrawerDragEnd(widthDuringDragRef.current);
      }
    },
    [onMobileLibraryDrawerDragEnd]
  );

  const onEdgeKeyDown = useCallback(
    (e) => {
      if (!showMobilePull) return;
      const step = e.shiftKey ? 40 : 16;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onMobileLibraryDrawerWidthChange((w) =>
          Math.min(mobileLibraryDrawerMaxWidth, w + step)
        );
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onMobileLibraryDrawerWidthChange((w) =>
          Math.max(mobileLibraryDrawerMinWidth, w - step)
        );
      } else if (e.key === 'Home') {
        e.preventDefault();
        onMobileLibraryDrawerWidthChange(mobileLibraryDrawerMaxWidth);
      } else if (e.key === 'End') {
        e.preventDefault();
        onMobileLibraryDrawerWidthChange(mobileLibraryDrawerMinWidth);
      }
    },
    [
      showMobilePull,
      mobileLibraryDrawerMaxWidth,
      mobileLibraryDrawerMinWidth,
      onMobileLibraryDrawerWidthChange,
    ]
  );

  return (
    <aside
      className={`sidebar ${isMobile ? 'mobile' : 'desktop'} ${showSidebar ? 'visible' : 'hidden'}${
        isDraggingDrawer ? ' sidebar-mobile--dragging' : ''
      }${isMobile && mobileLibraryDrawerMaximized ? ' sidebar-mobile--maximized' : ''}`}
      style={asideStyle}
      aria-hidden={!showSidebar}
    >
      <div className="sidebar-header">
        <div className="sidebar-header__titles">
          <h2 className="sidebar-title">Library</h2>
        </div>
        {showSidebar ? (
          <div className="sidebar-header__actions">
            {isMobile && onToggleMobileLibraryDrawerMaximized ? (
              <button
                type="button"
                className="sidebar-maximize"
                onClick={onToggleMobileLibraryDrawerMaximized}
                aria-pressed={Boolean(mobileLibraryDrawerMaximized)}
                aria-label={
                  mobileLibraryDrawerMaximized
                    ? 'Restore library panel width'
                    : 'Expand library to cover canvas'
                }
              >
                {mobileLibraryDrawerMaximized ? '⤡' : '⤢'}
              </button>
            ) : null}
            <button
              type="button"
              className="sidebar-close"
              onClick={() => setShowSidebar(false)}
              aria-label="Close library panel"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

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

      {showMobilePull ? (
        <div
          className="sidebar-mobile-edge-pull"
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag right to widen library, left to narrow. Release when very narrow to close."
          tabIndex={0}
          onPointerDown={onEdgePointerDown}
          onPointerMove={onEdgePointerMove}
          onPointerUp={onEdgePointerUp}
          onPointerCancel={onEdgePointerUp}
          onKeyDown={onEdgeKeyDown}
        />
      ) : null}
    </aside>
  );
}

LibrarySidebar.propTypes = {
  isMobile: PropTypes.bool.isRequired,
  showSidebar: PropTypes.bool.isRequired,
  setShowSidebar: PropTypes.func.isRequired,
  sidebarWidth: PropTypes.number.isRequired,
  mobileLibraryDrawerWidth: PropTypes.number,
  onMobileLibraryDrawerWidthChange: PropTypes.func,
  mobileLibraryDrawerMinWidth: PropTypes.number,
  mobileLibraryDrawerMaxWidth: PropTypes.number,
  onMobileLibraryDrawerDragEnd: PropTypes.func,
  mobileLibraryDrawerMaximized: PropTypes.bool,
  onToggleMobileLibraryDrawerMaximized: PropTypes.func,
  error: PropTypes.string,
  onErrorBannerAction: PropTypes.func.isRequired,
  sourcesPanelProps: PropTypes.object.isRequired,
};

LibrarySidebar.defaultProps = {
  error: null,
  mobileLibraryDrawerWidth: undefined,
  onMobileLibraryDrawerWidthChange: undefined,
  mobileLibraryDrawerMinWidth: undefined,
  mobileLibraryDrawerMaxWidth: undefined,
  onMobileLibraryDrawerDragEnd: undefined,
  mobileLibraryDrawerMaximized: false,
  onToggleMobileLibraryDrawerMaximized: undefined,
};
