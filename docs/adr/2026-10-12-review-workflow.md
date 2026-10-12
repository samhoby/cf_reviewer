# ADR: Multi-step review in Cloudflare Workflows

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
A single LLM call on submission produced shallow reviews. We want a multi-step check — security, then performance/logic bugs, then a combined report saved to the session — with follow-up chat afterwards.

## Options considered
1. **Single LLM call in the Durable Object** — simplest, but shallow and no per-step retries.
2. **Chain calls inside the Durable Object** — no durability; a failure mid-chain loses all work.
3. **Cloudflare Workflows** — durable steps, per-step retries, results persisted between steps, visible in the dashboard.

## Decision
Option 3. `POST /api/sessions/:id/reviews` records a `running` review row in the Durable Object, then starts a `ReviewWorkflow` instance (instance id = review id). Steps:

1. `security-check` and 2. `logic-check` — **run in parallel** with `Promise.all`. They first ran sequentially; the developer switched to parallel because the two checks don't depend on each other and it roughly halves review time.
3. `combine-report` — merges both findings into one report.
4. `save-report` — writes the result to SQLite via `completeReview` (idempotent `UPDATE`).

On any error, `mark-failed` sets the review to `failed` and the instance stays errored. LLM steps retry 3 times with exponential backoff and a 2-minute timeout. Follow-up chat injects the latest completed review (code + report) into the system prompt.

## Consequences
- Retries don't repeat completed LLM calls; each step result is persisted.
- The frontend polls `GET /reviews/:reviewId` until the status leaves `running`.
- The review row is created before the Workflow starts, so the Workflow always has a row to update.

## Migration plan
New binding `REVIEW_WORKFLOW` (class `ReviewWorkflow`). New SQLite table `reviews` (created with `CREATE TABLE IF NOT EXISTS`).
