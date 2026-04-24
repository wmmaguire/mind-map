# Google Sign-In (GIS) — integrator's guide (#102)

MindMap supports **[Google Identity Services](https://developers.google.com/identity/gsi/web)** (GIS) for one-tap sign-in, automatic return-visit sign-in, and a branded "Continue with Google" button inside the sign-in modal. Email + password is still the fallback for environments that haven't configured Google Sign-In.

This guide walks through the one-time Google Cloud console setup, the runtime env vars, and the moving parts so you know where to look when something misbehaves.

## 1. Google Cloud console setup (one-time, per environment)

1. Sign in to [https://console.cloud.google.com/](https://console.cloud.google.com/).
2. Pick an existing project or create a new one (e.g. `mindmap-prod`, `mindmap-dev`).
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless you're restricting to a single Workspace domain).
   - App name: *MindMap*
   - Support email + developer contact: a mailbox you own.
   - Add `profile`, `email`, `openid` scopes (these are the default GIS scopes; nothing beyond them is needed today).
   - Publish the app to **Testing** for dev; **In production** for public launches (Google will require brand-verification for production).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins — add every origin that embeds the button (schemes + hosts + ports must match exactly):
     - `http://localhost:3000` (CRA dev server)
     - `http://localhost:5001` (if you ever hit the server directly)
     - `https://talk-graph.onrender.com` (current staging)
     - *your prod hostname*
   - Authorized redirect URIs — **leave blank**. MindMap uses the GIS ID-token flow in `ux_mode: 'popup'` with a JS callback, which does not require redirect URIs. You'd only add one if we ever move to the OAuth 2.0 code flow for API access.
5. Copy the **Client ID** string; it looks like `123456789012-abcdef…apps.googleusercontent.com`.

## 2. Environment variables

Set the following in whichever env file your stack uses (`.env`, Render / Fly / Vercel secrets, etc.):

### Server (`server/.env`)

| Var | Required? | Notes |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | yes (to enable Google) | Same value as client; used by `google-auth-library` to verify ID tokens. If unset, the Google endpoints return `503 GOOGLE_SIGN_IN_DISABLED` and the client hides the button. |
| `GOOGLE_OAUTH_ALLOWED_HD` | optional | Comma-separated Google Workspace domain allow-list. Leave unset for consumer Google accounts. Example: `example.com,subsidiary.com`. |
| `AUTH_JWT_SECRET` | yes in production | Used for both the session cookie and the 5-min link-confirmation JWT. |

### Client (`client/.env`)

| Var | Required? | Notes |
| --- | --- | --- |
| `REACT_APP_GOOGLE_OAUTH_CLIENT_ID` | yes (to enable Google) | Mirror of the server value; baked into the CRA bundle at build time. If unset, `<GoogleSignInButton>` + `<GoogleOneTap>` render nothing, and the sign-in modal falls back to email / password. |

Note: CRA's `process.env.REACT_APP_*` values are baked in at **build time**, not runtime, so you must rebuild the client after changing them.

## 3. Local dev quick start (with a real Google client id)

```bash
# Put the client id in both env files. Dev uses http://localhost:3000.
echo "GOOGLE_OAUTH_CLIENT_ID=123…apps.googleusercontent.com" >> server/.env
echo "REACT_APP_GOOGLE_OAUTH_CLIENT_ID=123…apps.googleusercontent.com" >> client/.env

# Start both servers from the repo root.
npm run dev
```

Open `http://localhost:3000`. You should see:

1. Google One Tap appears as a small prompt in the top-right on first load. Dismiss it; it stays silent for 24h.
2. Click the account chip → **Sign in** → the modal opens with a **Continue with Google** button as the primary CTA and an "Or sign in with email" disclosure.
3. Complete the Google flow → you return to the same page, authenticated. Subsequent reloads within the 24h silence window do not show One Tap but still auto-restore your session (cookie + server `/api/auth/me`).

### Local dev without a Google client id

If `REACT_APP_GOOGLE_OAUTH_CLIENT_ID` is unset:

- The `<script>` for GIS still loads (harmless; GIS is idle without a client id).
- `<GoogleOneTap>` short-circuits and renders nothing.
- `<GoogleSignInButton>` renders nothing.
- The sign-in modal falls back to email / password, collapsed form shown by default.
- Server `POST /api/auth/google` returns `503 GOOGLE_SIGN_IN_DISABLED` if anyone calls it directly.

Use this when hacking on anything that isn't auth-related.

## 4. Runtime architecture

```
+-------------------+    user click / silent     +-------------------+
| GIS (Google JS)   |--------------------------->| GoogleSignInButton |
| google.accounts.id|    credential (id_token)   |      / OneTap     |
+-------------------+                            +---------+---------+
                                                           |
                                                           | POST /api/auth/google
                                                           |   { credential, nonce }
                                                           v
+-----------+                               +---------------------------+
|  Mongo    |<------ upsert User row ------ | server/routes/auth.js     |
| users     |                               |  + resolveGoogleUserWith  |
+-----------+                               |    Store()                |
                                            |  + google-auth-library    |
                                            |    verifyIdToken()        |
                                            +---------+-----------------+
                                                      |
                                                      | res.cookie('mindmap_auth', …)
                                                      v
                                               browser session
```

- **Nonce round-trip** — `/api/auth/google/nonce` mints a 32-byte token, sets the httpOnly `mindmap_google_nonce` cookie for 5 min, and returns the value. Client passes it into `google.accounts.id.initialize({nonce})`. On exchange, the server verifies the ID token's `nonce` claim equals the cookie value, preventing replay.
- **Session cookie** — `mindmap_auth` (existing; 14-day JWT, `httpOnly`, `sameSite=lax`). Issued identically for password + Google users.
- **Link token** — when a Google email matches an existing password row, the server returns `409 LINK_REQUIRED` + a short-lived signed JWT (`purpose: 'link-google'`, 5-min TTL). The client shows a confirm dialog, then calls `/api/auth/google/link` with the token; only on explicit confirm does the server write `googleId` onto the existing row. This prevents silent account takeover via email squatting.
- **Disable auto-select on logout** — `AuthContext.logout()` calls `google.accounts.id.disableAutoSelect()` so the next reload doesn't silently re-sign the user.

## 5. Endpoint reference

| Endpoint | Purpose | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/auth/google/nonce` | Mint + cookie the per-sign-in nonce. | none | `{success:true, nonce}` | none |
| `POST /api/auth/google` | Exchange credential for session. | `{credential, nonce?}` | `{success:true, outcome:'existing-google'|'new', user}` | 401 `INVALID_GOOGLE_CREDENTIAL` / `INVALID_GOOGLE_AUDIENCE` / `GOOGLE_NONCE_MISMATCH`; 403 `GOOGLE_HD_NOT_ALLOWED`; 409 `LINK_REQUIRED` with `{linkToken, email}`; 503 `GOOGLE_SIGN_IN_DISABLED` when unconfigured |
| `POST /api/auth/google/link` | Finalize link after confirm. | `{linkToken}` | `{success:true, user}` | 400 `INVALID_LINK_TOKEN`; 404 `UNKNOWN_USER`; 409 `GOOGLE_ID_CONFLICT` |
| `POST /api/auth/google/revoke` | Clear our cookies. | none | `{success:true}` | none |
| `POST /api/auth/login` (existing) | Email + password sign-in. | `{email, password}` | `{success:true, user}` | 400 `USE_GOOGLE_SIGN_IN` when the row was created via Google with no password set |

## 6. Security notes

- **Audience + issuer + expiry** — enforced by `google-auth-library` + our wrapper in `server/lib/googleAuthClient.js`.
- **Nonce** — round-tripped through an httpOnly cookie; server rejects `GOOGLE_NONCE_MISMATCH` when the client-submitted nonce and the cookie disagree.
- **No auto-merge** — an existing password row with the same email never gets a `googleId` silently. The client must call `/api/auth/google/link` with the server's 5-min signed confirmation token.
- **Session rotation** — every successful sign-in calls `signAuthToken` + `res.cookie`, overwriting any prior session cookie. A stolen pre-auth cookie can't survive a sign-in event.
- **Logging** — never log the full `credential` JWT. The verify wrapper extracts only what we need (`sub`, `email`, `name`, `picture`) and returns it to the route layer.
- **CSRF** — GIS's `g_csrf_token` double-submit pattern only applies in `mode: 'redirect'` form POSTs. MindMap uses JS callbacks + same-origin `fetch` with `credentials: 'include'`, so protection is: audience + nonce + `SameSite=Lax` on the nonce cookie.

## 7. Operational follow-ups

Tracked separately so the main #102 scope stays shippable:

- **Disconnect Google button in settings** — add a "Disconnect Google" action under the Settings menu that calls `/api/auth/google/revoke` and clears `googleId` from the row. Gate on a fallback password being set so the account doesn't become unreachable. Filed as a follow-up (see `docs/github-backlog-issues.md`).
- **UserActivity auditing for Google sign-ins** — current auth routes don't write `UserActivity` rows, so Google routes inherit the same behavior for parity. A future pass should fold Google + password auth into the audit log (`AUTH_GOOGLE_LOGIN`, `AUTH_GOOGLE_LINK`, `AUTH_GOOGLE_REGISTER`).
- **Rate limiting** — #78 covers auth-wide rate limiting; the Google endpoints want the same umbrella (`/api/auth/google`, `/api/auth/google/link`, `/api/auth/google/nonce`).
- **FedCM migration** — `use_fedcm_for_prompt: true` is already on; classic iframe fallback stays in place for older browsers. Revisit if Google removes the fallback.

## 8. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| "Continue with Google" button never appears | `REACT_APP_GOOGLE_OAUTH_CLIENT_ID` unset in the client build; rebuild after editing `client/.env`. |
| `403 invalid_client` in console | Your localhost origin isn't in the OAuth client's **Authorized JavaScript origins** list. Scheme + port must match. |
| `401 INVALID_GOOGLE_AUDIENCE` | Server and client are using different client ids. Confirm both env vars are the exact same string. |
| One Tap doesn't appear on a browser you expect | Browser privacy settings (third-party cookies off), previous dismissal within 24h, or you're already authenticated. Clear `localStorage['mindmap.auth.onetap.dismissedAt']` to re-prompt. |
| `409 LINK_REQUIRED` loop | The user keeps cancelling the link dialog — working as intended. They can sign in via email + password to the existing row and then link Google from Settings once the Disconnect/Connect UI ships. |
| `503 GOOGLE_SIGN_IN_DISABLED` | Server-side `GOOGLE_OAUTH_CLIENT_ID` is unset. Either configure it or expect email / password as the only auth path. |

## 9. Test surface

Run from the repo root:

```bash
cd server && npm test      # 123 passing; Google-specific: googleAuthClient.test.mjs + authService.test.mjs
cd ../client && npm run test:ci
  # 170 passing; Google-specific:
  #   lib/googleIdentity.test.js
  #   components/auth/GoogleSignInButton.test.jsx
  #   components/auth/GoogleOneTap.test.jsx
```
