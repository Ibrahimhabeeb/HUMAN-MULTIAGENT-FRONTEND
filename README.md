# Secure Coding Room: frontend

The React study interface for comparing an agent team with a single assistant during secure coding tasks.
It provides the study screens, Monaco editor, chat, approvals and shared security state.

## Study Sessions

`src/api/client.ts` creates a random backend session and keeps its token under
`secure-coding-room.session` in `sessionStorage`, not cookies or localStorage. Every study/workspace/chat/approval
request sends `X-Session-Token`. The backend resolves the participant from that token.

Refresh reuses the tab's token. An expired token returns to a fresh Start screen; mutating requests are not
automatically replayed. Finish and Restart replace the revoked token with a fresh one, without deleting saved
participant data. Pending setup remains memory-only until consent. The questionnaire's unsubmitted answers
remain component state and are not autosaved.

Open a fresh study tab for a new participant. Browsers can copy sessionStorage when duplicating existing tabs.

## Local development

Use Node.js 24 and the sibling `../backend` project:

```sh
npm ci
npm run dev
```

Vite listens on port 5001 and proxies `/api` to `http://127.0.0.1:8000`.
Set `API_URL` in the Vite process environment to change that development proxy target.
Backend setup is documented in `../backend/README.md`.

## Linux VPS hosting

Follow [the backend deployment guide](../backend/DEPLOYMENT.md) for Compose, PostgreSQL, backend configuration,
backups and runner isolation. The deployment layout keeps `backend/` and `human-agent-frontend/` side by side.
The backend Compose project builds this image with context `../human-agent-frontend` and provides the API
on the internal service name `api`, port 8000.

`Dockerfile` builds the locked dependencies with Node.js 24 (`npm ci`) and serves only the resulting `dist/`
using Caddy 2. Vite's development and preview servers are not used in production. `.dockerignore` allows only
the build inputs; local secrets, Git metadata, dependency folders, tests and staging backups stay out of the context.

Configure these environment variables on the Caddy service at runtime:

| Variable | Example | Purpose |
| --- | --- | --- |
| `DOMAIN` | `study.example.org` | Public hostname only, without a scheme or path |
| `TLS_EMAIL` | `researcher@example.org` | Email used for automatic HTTPS certificate management |

Point the hostname's DNS records at the VPS and allow inbound TCP ports 80 and 443 for HTTPS and certificate
issuance. Persist Caddy's `/data` and `/config` with Compose volumes. Publish only the proxy's ports 80 and 443;
the API and database remain on the internal Compose network. Caddy's admin endpoint is disabled.

The browser always calls same-origin `/api`; no frontend API hostname, `VITE_*` secret or model key is needed.
Caddy strips `/api`, forwards the session request and response headers, and flushes streamed chat responses
immediately. Request bodies are limited to 2 MB. API responses, the index and other static entry files use
`Cache-Control: no-store`; fingerprinted `/assets/*` files use a one-year immutable cache policy. Missing assets
return an error rather than the application's HTML. Other paths fall back to `index.html`.

Responses include `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Access logging is not enabled.
Operational HTTP error logs omit the request object, and client IP forwarding headers are removed before requests
reach the API. The backend deployment must also keep API access logging disabled; configure infrastructure logging
separately if it is needed. Caddy's persistent volumes hold certificate/configuration state, not an access log.

## Checks

```sh
npm test
npm run lint
npm run build
```

The unit checks replace API/model interactions with fixtures. Building the frontend does not start or contact the
backend. Browser checks create temporary files and their own servers; run them separately from the active study:

```sh
npx playwright install --with-deps chromium
npm run test:study-browser
```

The study browser harness uses `../backend/.venv/bin/python` on Linux and `.venv/Scripts/python.exe` on Windows.
Override it with `STUDY_TEST_PYTHON` when needed. Linux uses Playwright's bundled Chromium; Windows defaults to Edge.
`PLAYWRIGHT_CHANNEL` overrides the browser channel. The harness uses a temporary SQLite database, workspaces and
snapshots, replaces its expected chat response and blocks unexpected chat POST requests, so it never calls real AI.
