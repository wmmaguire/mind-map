import React, {
  createContext,
  useContext,
  useMemo,
} from 'react';
import PropTypes from 'prop-types';

/** Browser session only; no long-term account (GitHub #31). */
export const IDENTITY_KIND_GUEST = 'guest';

/** Reserved for sign-in / registration flows (not implemented yet). */
export const IDENTITY_KIND_REGISTERED = 'registered';

const IdentityContext = createContext(null);

/**
 * Application identity: today only {@link IDENTITY_KIND_GUEST}. Registered users,
 * profiles, and BYO keys will extend this context in later #31 / #33 work.
 */
export function IdentityProvider({ children }) {
  const value = useMemo(
    () => ({
      identityKind: IDENTITY_KIND_GUEST,
      /** When true, guest-only UI (e.g. banner) can be hidden. */
      isRegistered: false,
    }),
    []
  );

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}

IdentityProvider.propTypes = {
  children: PropTypes.node,
};

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (ctx == null) {
    throw new Error('useIdentity must be used within IdentityProvider');
  }
  return ctx;
}
