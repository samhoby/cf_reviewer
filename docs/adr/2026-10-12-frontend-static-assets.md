# ADR: Serve the frontend with Workers Static Assets

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
The frontend (vanilla HTML/CSS/JS) was served two ways at once: a Pages project with a Pages Function proxy to the Worker, and a Worker `assets` block pointing at `frontend/public`. Two deploy paths for the same files cause drift.

## Options considered
1. **Cloudflare Pages + Pages Function proxy** — the assignment recommends Pages, but it means a second project, a service binding, a proxy function, and two deploys.
2. **Workers Static Assets** — the Worker serves `frontend/public` and the API from one origin; one deploy, one URL. Cloudflare now recommends it for new projects.

## Decision
Option 2. `wrangler.jsonc` has `"assets": { "directory": "./frontend/public" }`. Requests that match a file get the asset; everything else, including `/api/*`, falls through to the Worker's router. The Pages config, the Pages Function proxy and the `dev:ui` / `deploy:ui` scripts are removed.

## Consequences
- One `npm run dev` for local work and one `npm run deploy` for production.
- Same origin for UI and API, so no CORS and no proxy hop.
- Deviates from the assignment's "recommend Pages" wording; Workers Static Assets is Cloudflare's successor for this use case.

## Migration plan
Delete `frontend/wrangler.jsonc`, `frontend/package.json`, `frontend/functions/`. If a Pages project `cf-ai-code-reviewer-ui` was already deployed, delete it in the dashboard.
