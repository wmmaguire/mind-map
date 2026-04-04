import React, {
  createContext,
  useContext,
  useState,
  useEffect
} from 'react';
import PropTypes from 'prop-types';
import { apiUrl } from '../config';

const SessionContext = createContext(null);

const STORAGE_ID = 'mindmap.sessionId';
const STORAGE_START = 'mindmap.sessionStart';

/** Single-flight bootstrap so React StrictMode does not create duplicate sessions. */
let sessionBootstrapPromise = null;

function getSessionBootstrap() {
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = (async () => {
      try {
        const id = sessionStorage.getItem(STORAGE_ID);
        const startIso = sessionStorage.getItem(STORAGE_START);
        if (id && startIso) {
          const start = new Date(startIso);
          if (!Number.isNaN(start.getTime())) {
            return { sessionId: id, sessionStart: start };
          }
        }
      } catch {
        /* ignore */
      }

      const startTime = new Date();

      const detectBrowser = () => {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('chrome')) return 'chrome';
        if (userAgent.includes('firefox')) return 'firefox';
        if (userAgent.includes('safari')) return 'safari';
        if (userAgent.includes('edge')) return 'edge';
        return 'other';
      };

      const detectOS = () => {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('win')) return 'windows';
        if (platform.includes('mac')) return 'macos';
        if (platform.includes('linux')) return 'linux';
        if (/iphone|ipad|ipod/.test(platform)) return 'ios';
        if (platform.includes('android')) return 'android';
        return 'other';
      };

      const userMetadata = {
        browser: detectBrowser(),
        os: detectOS(),
        screenResolution: {
          width: window.screen.width,
          height: window.screen.height
        },
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      const response = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionStart: startTime.toISOString(),
          userMetadata
        })
      });

      if (!response.ok) {
        throw new Error('Failed to initialize session');
      }

      const data = await response.json();
      try {
        sessionStorage.setItem(STORAGE_ID, data.sessionId);
        sessionStorage.setItem(STORAGE_START, startTime.toISOString());
      } catch {
        /* ignore */
      }

      return { sessionId: data.sessionId, sessionStart: startTime };
    })();
  }
  return sessionBootstrapPromise;
}

export function SessionProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [sessionStart, setSessionStart] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSessionBootstrap()
      .then((result) => {
        if (!cancelled && result) {
          setSessionId(result.sessionId);
          setSessionStart(result.sessionStart);
        }
      })
      .catch((err) => {
        console.error('Session bootstrap failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionId && sessionStart) {
        const endTime = new Date();
        const duration = Math.floor((endTime - sessionStart) / 1000);
        const blob = new Blob(
          [JSON.stringify({
            sessionEnd: endTime.toISOString(),
            sessionDuration: duration
          })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(apiUrl(`/api/sessions/${sessionId}`), blob);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionId, sessionStart]);

  const value = { sessionId, sessionStart };
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (ctx == null) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}

SessionProvider.propTypes = {
  children: PropTypes.node
};
