# ADR: Core stack — Workers, SQLite Durable Objects, Workers AI

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
The app is an AI code reviewer for the Cloudflare AI app assignment. It needs an LLM, coordination, user input via chat, and memory/state, and it should keep the setup clean and modular.

## Options considered
1. **Worker + SQLite-backed Durable Object + Workers AI** — everything on Cloudflare, one Durable Object per review session holds that session's state.
2. **Agents SDK starter template** — faster start, but pulls in more dependencies and hides the moving parts.
3. **External LLM API** — needs API keys and egress; adds a vendor outside Cloudflare.

## Decision
Option 1. A main Worker routes requests to a `ReviewSession` Durable Object (one per session, keyed by session UUID) that stores messages and reviews in SQLite. Workers AI runs `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. All model calls go through `ai.ts`; all SQL lives in `review-session.ts`.

## Consequences
- Sessions are isolated by design: each has its own Durable Object and database.
- No runtime npm dependencies.
- The model's context window limits input size: code is capped at 15,000 chars, chat messages at 8,000, and chat context at the last 12 messages.

## Migration plan
None (initial decision). Bindings: `AI`, `REVIEW_SESSION` (migration `v1`, `new_sqlite_classes`).
