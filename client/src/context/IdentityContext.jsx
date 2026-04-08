import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';

/** Browser session only; no long-term account (GitHub #31). */
export const IDENTITY_KIND_GUEST = 'guest';

/** Signed-in / registered user (GitHub #33; real auth wiring is future work). */
export const IDENTITY_KIND_REGISTERED = 'registered';

const IdentityContext = createContext(null);

const envRegisteredUserId =
  typeof process !== 'undefined' && process.env.REACT_APP_MINDMAP_USER_ID
    ? String(process.env.REACT_APP_MINDMAP_USER_ID).trim()
    : null;

/**
 * Application identity: guest by default; optional stable `userId` for API headers
 * when registered (env `REACT_APP_MINDMAP_USER_ID`, tests, or dev preview).
 */
export function IdentityProvider({ children, initialRegisteredUserId }) {
  const [devOverride, setDevOverride] = useState(undefined);

  const userId = useMemo(() => {
    if (devOverride !== undefined) return devOverride;
    if (initialRegisteredUserId != null && initialRegisteredUserId !== '') {
      return String(initialRegisteredUserId).trim();
    }
    return envRegisteredUserId;
  }, [devOverride, initialRegisteredUserId]);

  const isRegistered = Boolean(userId);
  const identityKind = isRegistered
    ? IDENTITY_KIND_REGISTERED
    : IDENTITY_KIND_GUEST;

  const value = useMemo(() => {
    const base = {
      identityKind,
      isRegistered,
      userId,
    };
    if (process.env.NODE_ENV !== 'development') {
      return base;
    }
    return {
      ...base,
      /**
       * Dev-only: `undefined` = follow env/props; `null` = force guest; string = preview user id.
       */
      setDevRegisteredUserId: (next) => {
        if (next === undefined) setDevOverride(undefined);
        else if (next === null) setDevOverride(null);
        else setDevOverride(String(next).trim());
      },
    };
  }, [identityKind, isRegistered, userId]);

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}

IdentityProvider.propTypes = {
  children: PropTypes.node,
  initialRegisteredUserId: PropTypes.string,
};

IdentityProvider.defaultProps = {
  initialRegisteredUserId: undefined,
};

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (ctx == null) {
    throw new Error('useIdentity must be used within IdentityProvider');
  }
  return ctx;
}
