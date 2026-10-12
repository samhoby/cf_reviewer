# AI Code Reviewer on Cloudflare

Paste a code snippet and get a security, bug and performance review from Llama 3.3, then ask follow-up questions in a chat that remembers the review.

Built for the Cloudflare AI-powered application assignment:

| Requirement             | Implementation                                                    |
| ----------------------- | ----------------------------------------------------------------- |
| LLM                     | Workers AI — `@cf/meta/llama-3.3-70b-instruct-fp8-fast`           |
| Workflow / coordination | Cloudflare Workflows (multi-step review) + Durable Objects        |
| User input              | Chat UI (vanilla HTML/CSS/JS) served with Workers Static Assets   |
| Memory / state          | SQLite-backed Durable Object per session (reviews + chat history) |

## Architecture

```
Browser ──► Worker (src/index.ts)
             ├─ static files  ← frontend/public  (Workers Static Assets)
             └─ /api/*  router + input validation
                  ├─► ReviewSession Durable Object (src/review-session.ts)
                  │     SQLite: reviews, messages  ·  follow-up chat
                  └─► ReviewWorkflow (src/workflow.ts)
                        0. check-input     is it code? → else "rejected"
                        1. security-check  ┐ parallel
                        2. logic-check     ┘
                        3. combine-report
                        4. save-report     → ReviewSession.completeReview()
```

- **One Durable Object per session**, keyed by session UUID, so sessions are isolated.
- **Every Workflow step is durable and retried** (3×, exponential backoff); completed LLM calls are never repeated.
- **Follow-up chat** includes the reviewed code (with line numbers) and the report in the system prompt, plus the last 12 messages. A chat turn is saved only if the model replies.
- **The frontend polls** `GET /reviews/:id` until the status leaves `running`. Markdown is rendered by a small HTML-escaping renderer (`markdown.js`), with no external libraries.

Design decisions are recorded in [`docs/adr/`](docs/adr/); contribution rules are in [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md).

## Run locally

Requires Node.js 18+ and a Cloudflare account (Workers AI runs on your account even in local dev).

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

Wrangler prints the `*.workers.dev` URL. Each review shows up in the dashboard under **Workers & Pages → Workflows → code-review-workflow**.

## API

| Method | Path                                  | Body          | Description                                                       |
| ------ | ------------------------------------- | ------------- | ----------------------------------------------------------------- |
| POST   | `/api/sessions`                       | —             | Create a session → `{ sessionId }`                                |
| DELETE | `/api/sessions/:id`                   | —             | Clear a session's reviews and chat                                |
| POST   | `/api/sessions/:id/reviews`           | `{ code }`    | Start a review → `202 { reviewId }`                               |
| GET    | `/api/sessions/:id/reviews/:reviewId` | —             | Status (`running` / `completed` / `failed` / `rejected`) + report |
| GET    | `/api/sessions/:id/messages`          | —             | Chat history                                                      |
| POST   | `/api/sessions/:id/messages`          | `{ content }` | Ask a follow-up question                                          |

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
```
