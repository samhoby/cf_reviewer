# AI Code Reviewer on Cloudflare

**Live:** https://cf-reviewer.samhoby.workers.dev

Paste a code snippet and get a security, bug and performance review from Llama 3.3, then ask questions in a chat that remembers the review.

Built for the Cloudflare AI-powered application assignment:

| Requirement             | Implementation                            |
| ----------------------- | ----------------------------------------- |
| LLM                     | Llama 3.3 on Workers AI                   |
| Workflow / coordination | Cloudflare Workflows and Durable Objects  |
| User input              | Chat UI served with Workers Static Assets |
| Memory / state          | SQLite-backed Durable Object per session  |

## Architecture

- **Worker** (`src/index.ts`): serves the frontend from `frontend/public` and handles the `/api/*` routes.
- **Durable Object** (`src/review-session.ts`): one per session, keyed by its UUID, so sessions are isolated. Stores reviews and chat in SQLite and answers follow-up questions.
- **Workflow** (`src/workflow.ts`): runs each review in four steps:
  1. Check that the input is code. If not, the review is marked `rejected`.
  2. Run the security check and the logic check in parallel.
  3. Combine both into one report.
  4. Save the report and mark the review `completed`. If any step fails, it is marked `failed`.

- **Workflow steps are durable:** each step's result is persisted, so retries never repeat a completed LLM call. AI steps retry 3× (exponential backoff, 2-minute timeout); database steps use the Workflows default retries.
- **Follow-up chat** includes the reviewed code (with line numbers) and the report in the system prompt, plus the last 12 messages. A chat turn is saved only if the model replies.
- **The frontend polls** `GET /reviews/:id` every 2 s (5-minute timeout) until the status leaves `running`. Markdown is rendered by a small HTML-escaping renderer (`markdown.js`), with no external libraries.
- **Sessions live in the browser:** the session ID is kept in `localStorage`, so a reload restores the review and chat. **New session** deletes the old session's data and starts fresh.

Design decisions are recorded in [`docs/adr/`](docs/adr/); contribution rules are in [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md).

## Run locally

Requires Node.js 22+ and a Cloudflare account (Workers AI runs on your account even in local dev).

```bash
npm install
npx wrangler login
npm run typecheck
npm run dev          # http://localhost:8787
```

Open http://localhost:8787, paste some code and click **Review code** (or press Ctrl+Enter).

## Deploy

Every push to `main` is built and deployed automatically by [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). The build runs `npm run typecheck` first and stops on errors (see the [ADR](docs/adr/2026-10-12-continuous-deploy-workers-builds.md)).

To deploy manually:

```bash
npm run deploy
```

The app is served at https://cf-reviewer.samhoby.workers.dev. Each review shows up in the dashboard under **Workers & Pages > Workflows > code-review-workflow**.

## Inspect stored data

Open **Durable Objects > ReviewSession > Data Studio** in the Cloudflare dashboard and enter a session ID (DevTools > Application > Local Storage > `sessionId`) to browse its `reviews` and `messages` tables. Queries hit the deployed app and are billed as normal requests.

## API

| Method | Path                                  | Body          | Description                                                       |
| ------ | ------------------------------------- | ------------- | ----------------------------------------------------------------- |
| POST   | `/api/sessions`                       | —             | Create a session, returns `{ sessionId }`                         |
| DELETE | `/api/sessions/:id`                   | —             | Clear a session's reviews and chat                                |
| POST   | `/api/sessions/:id/reviews`           | `{ code }`    | Start a review, returns `202 { reviewId }`                        |
| GET    | `/api/sessions/:id/reviews/:reviewId` | —             | Status (`running` / `completed` / `failed` / `rejected`) + report |
| GET    | `/api/sessions/:id/messages`          | —             | Chat history                                                      |
| POST   | `/api/sessions/:id/messages`          | `{ content }` | Ask a question                                                    |

Limits: code ≤ 15,000 chars, chat messages ≤ 8,000 chars, request body ≤ 128 KB. Errors are returned as `{ "error": "…" }` with 400 / 404 / 405 / 413 / 500.

## Project structure

```
src/
  index.ts           Worker: routing + input validation
  http.ts            Router, HttpError, JSON + size-limited body parsing
  review-session.ts  Durable Object: SQLite state + follow-up chat
  workflow.ts        Workflow: multi-step review
  ai.ts              Workers AI calls + numbered code blocks
  prompts.ts         System prompts
  types.ts           Shared types and Env bindings
frontend/public/
  index.html         Page layout
  app.js             UI and session state
  api.js             One function per API endpoint
  http-client.js     fetch wrapper + HttpError
  markdown.js        Safe Markdown renderer
  styles.css         Dark theme, responsive layout
docs/                CONSTITUTION.md, adr/
AGENTS.md            Entry point for AI coding agents
CLAUDE.md            Imports AGENTS.md for Claude Code
```
