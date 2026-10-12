# Constitution

Rules for every human or AI contributor to this repository. Read this before changing code.

## 1. Core Philosophy & Stack

- **Clarity over cleverness.** Optimize for readable diffs and easy debugging.
- **Spec-driven:** every non-trivial change starts with a short plan and acceptance criteria.
- **Web UI:** Vanilla HTML, CSS, and JS in `frontend/public`, served by the Worker via Workers Static Assets.
- **Routing:** one Worker, one origin — static files are served as assets, `/api/*` falls through to the Worker's router (no CORS, no proxy).
- **Backend:** TypeScript on Cloudflare Workers, Workflows, and SQLite-backed Durable Objects.
- **AI:** Cloudflare Workers AI running `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- **Dependencies:** keep the runtime zero-dependency; prefer native Web and Cloudflare APIs over npm packages.
- **Documentation comments** are mandatory for public APIs and non-obvious logic.

## 2. Architectural Patterns for New Code

- Backend stays modular: HTTP router (`index.ts`) → Durable Object (`review-session.ts`) & Workflow (`workflow.ts`) → AI (`ai.ts`).
- SQLite queries live strictly inside `ReviewSession`; HTTP handlers and Workflows only orchestrate.
- Validate all inputs at the Worker edge (UUIDs, JSON shape, body size, and character limits).
- Frontend uses native ES modules (no build step) and splits UI/session state (`app.js`), API calls (`api.js`, one function per endpoint), the fetch wrapper and `HttpError` (`http-client.js`), safe Markdown rendering (`markdown.js`), and styles (`styles.css`).
- Never call `fetch()` outside `http-client.js`; add new endpoints to `api.js`.
- Data flow is one-way and observable via polling and explicit status updates.
- Preserve core invariants: session isolation, idempotent Workflow steps with retries, atomic chat persistence, and HTML-escaped Markdown.

## 3. Strict Prohibitions — The Never List

- Never add frontend frameworks or external Markdown libraries without explicit approval.
- Never bypass boundaries (no SQL outside `review-session.ts`; no `AI.run` calls outside `ai.ts`).
- Never run LLM calls or side effects in `ReviewWorkflow` outside of a `step.do` block.
- Never inject unescaped HTML into the DOM without passing through `renderMarkdown`.
- Never persist user chat messages to SQLite unless the AI reply succeeds.
- Never leave public functions, Durable Object methods, or Workflow steps without documentation comments.
- Never commit `.wrangler/` state, local SQLite files, or `node_modules/`.

## 4. Mandatory Requirements — The Always List

- Always document TypeScript functions, classes, Durable Object methods, and Workflow steps with simple, short, and explanatory comments in English.
- Always document frontend JavaScript functions with simple, short, and explanatory comments in English.

## 5. Definition of Done

- TypeScript build (`tsc --noEmit`) passes and the web UI is responsive on desktop and mobile.
- `wrangler dev` serves the UI and API and binds cleanly without Durable Object or Workflow errors.
- End-to-end requests succeed across session creation, review workflows, polling, and follow-up chat.
- SQLite state transitions (`running` → `completed` / `failed`) are idempotent and isolated per session.
- Docs and comments are updated where behavior changed.

### Pre-change checklist (spec-driven)

Apply this checklist before any major or non-trivial change:

1. Confirm the change scope and review the diff before implementation.
2. Write a short plan with acceptance criteria.
3. Determine if an ADR trigger applies; if so, collect justification first.

### Automated ADR protocol

- **Trigger on:** new dependency, new Cloudflare binding, SQLite schema change, model/prompt shift, or latency/consistency trade-offs.
- **An ADR must record:** context, options, decision, consequences, migration plan, owner, date.
- **Major decisions include:** stack changes, core review/chat invariants, API route shifts, Durable Object SQLite schema changes, Workflow step changes, deployment shifts, and token/timeout trade-offs.
- Major decisions must be captured in `docs/adr/YYYY-MM-DD-short-title.md`; agents must not revert them without explicit permission.
- AI tools must ask the developer for justification of triggered changes before drafting and linking the ADR.

### ADR justification prompt

Ask the developer:

1. **Problem statement:** what issue or goal prompted the change?
2. **Options considered:** what alternatives were evaluated?
3. **Decision rationale:** why was this option chosen?
4. **Impact and risks:** expected effects and trade-offs.
5. **Migration/rollout:** any steps, SQLite updates, or binding notes.
