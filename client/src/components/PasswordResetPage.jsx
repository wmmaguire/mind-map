import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './PasswordResetPage.css';

export default function PasswordResetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completePasswordReset } = useAuth();
  const token = (searchParams.get('token') || '').trim();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await completePasswordReset({ token, password });
      navigate('/visualize', { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not reset password');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="password-reset-page">
        <div className="password-reset-page__card">
          <h1 className="password-reset-page__title">Invalid link</h1>
          <p className="password-reset-page__text">
            This reset link is missing a token. Request a new link from the sign-in screen.
          </p>
          <Link className="password-reset-page__link" to="/">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="password-reset-page">
      <div className="password-reset-page__card">
        <h1 className="password-reset-page__title">Choose a new password</h1>
        <p className="password-reset-page__text">
          Your reset link is valid for one hour. After you save, you will be signed in.
        </p>
        <form className="password-reset-page__form" onSubmit={onSubmit}>
          <label className="password-reset-page__field">
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <label className="password-reset-page__field">
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          {error ? (
            <div className="password-reset-page__error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="password-reset-page__actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
