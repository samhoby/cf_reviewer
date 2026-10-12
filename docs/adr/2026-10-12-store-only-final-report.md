# ADR: Store only the final report

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** SamHoby

## Context
Each review saved three texts in SQLite: the security step output, the logic step output, and the combined report. The UI only shows the combined report, and the combined report already contains both step outputs. The raw step outputs are also kept by Cloudflare Workflows (visible per step in the dashboard).

## Options considered
1. **Keep all three** — duplicate data that nothing reads.
2. **Store only the combined report** — less data and code; raw outputs stay available in the Workflow instance history for debugging.

## Decision
Option 2. `completeReview(reviewId, report)` stores only the report. `security` and `logic` are removed from the `reviews` table, `Review`, and the API response; `ReviewFindings` is deleted. The Workflow still runs both checks and passes them to `combine-report`.

## Consequences
- Smaller rows and API responses; the UI is unchanged.
- Raw step outputs are only in Workflow history (subject to its retention), not in SQLite.

## Migration plan
New sessions create `reviews` without `security` / `logic`. Existing sessions keep the columns with old values; nothing reads or writes them anymore, so no migration is needed.
