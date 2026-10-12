# ADR: "Is this code?" gate before reviewing

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
Submitting non-code such as `hello` ran the full pipeline and produced a confident "no issues found" report.

## Options considered
1. **Client-side heuristics** (length, symbols) — brittle; short snippets like `x = 1` are valid code.
2. **Prompt-only fix** in each review step — still spends three LLM calls on junk input.
3. **LLM classifier as the first Workflow step** — one short call that stops the pipeline early.

## Decision
Option 3. Step `check-input` asks the model for one word, `CODE` or `NOT_CODE`, on the first 2,000 chars. On `NOT_CODE`, step `reject-input` sets the review to the new status `rejected` with a friendly message, and the Workflow ends without error. Any unclear answer counts as code, so real code is never blocked.

## Consequences
- One extra short LLM call per review, but junk input no longer pays for three full calls.
- New status `rejected`, shown in the UI as a "Not code" notice rather than an error.

## Migration plan
SQLite: `reviews.status` gains the value `rejected` (no schema change, TEXT column). New Durable Object method `rejectReview()`.
