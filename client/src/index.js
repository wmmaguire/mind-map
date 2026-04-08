import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import PropTypes from 'prop-types';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { SessionProvider } from './context/SessionContext';
import { IdentityProvider } from './context/IdentityContext';
import { GraphTitleProvider } from './context/GraphTitleContext';
import { LibraryUiProvider } from './context/LibraryUiContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function AuthIdentityBridge({ children }) {
  const { user } = useAuth();
  return (
    <IdentityProvider
      initialRegisteredUserId={user?.id || process.env.REACT_APP_MINDMAP_USER_ID}
    >
      {children}
    </IdentityProvider>
  );
}

AuthIdentityBridge.propTypes = {
  children: PropTypes.node,
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <AuthProvider>
          <AuthIdentityBridge>
            <GraphTitleProvider>
              <LibraryUiProvider>
                <App />
              </LibraryUiProvider>
            </GraphTitleProvider>
          </AuthIdentityBridge>
        </AuthProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
