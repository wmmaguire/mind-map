import React, { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './BannerActionsDrawer.css';

/**
 * Right-edge slide-out drawer used by {@link GuestIdentityBanner} on narrow
 * viewports (#90). It is intentionally generic — the banner passes any items
 * as children so it can render different content for guest / registered /
 * share-viewer states.
 *
 * Interactions:
 * - Backdrop click, × button, or Escape closes.
 * - Touch swipe-right inside the panel closes (horizontal dominance + ≥80px).
 * - Focus moves to the close button on open; returns to `returnFocusRef` on close.
 */
export default function BannerActionsDrawer({
  open,
  onClose,
  title,
  children,
  returnFocusRef,
}) {
  const closeBtnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture the opener at effect-start so cleanup still has the right target
    // even if the consumer re-renders with a different ref between open/close.
    const opener = returnFocusRef ? returnFocusRef.current : null;
    const id = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(id);
      if (opener) {
        try {
          opener.focus({ preventScroll: true });
        } catch (_) {
          /* ignore */
        }
      }
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    let startX = null;
    let startY = null;
    let tracking = false;
    const reset = () => {
      startX = null;
      startY = null;
      tracking = false;
    };
    const onStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };
    const onMove = (e) => {
      if (!tracking || startX == null) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) * 1.6 && dx > 80) {
        reset();
        onClose();
      }
    };
    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: true });
    panel.addEventListener('touchend', reset, { passive: true });
    panel.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', reset);
      panel.removeEventListener('touchcancel', reset);
    };
  }, [open, onClose]);

  const onBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="banner-actions-drawer-overlay"
      role="presentation"
      onClick={onBackdropClick}
    >
      <aside
        className="banner-actions-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Menu'}
        ref={panelRef}
      >
        <header className="banner-actions-drawer-header">
          <span className="banner-actions-drawer-title">{title || 'Menu'}</span>
          <button
            type="button"
            ref={closeBtnRef}
            className="banner-actions-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            ×
          </button>
        </header>
        <div className="banner-actions-drawer-body">{children}</div>
        <p className="banner-actions-drawer-hint" aria-hidden="true">
          Swipe right to close
        </p>
      </aside>
    </div>
  );
}

BannerActionsDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
  returnFocusRef: PropTypes.shape({ current: PropTypes.any }),
};

BannerActionsDrawer.defaultProps = {
  title: 'Menu',
  children: null,
  returnFocusRef: null,
};
