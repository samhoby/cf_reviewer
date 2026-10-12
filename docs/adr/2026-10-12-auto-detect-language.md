# ADR: Auto-detect language, drop the `language` field

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
The API accepted an optional `language` hint, first loosely validated by regex and then by a 16-entry allowlist. The developer wants the app to review as many programming languages as possible without any list limiting it. The UI already removed its language dropdown and always auto-detects.

## Options considered
1. **Keep an allowlist and grow it** — always incomplete; every new language needs a code change.
2. **Accept any string as a hint** — no limit, but an unvalidated field that the UI never sends.
3. **Remove the field** — Llama 3.3 detects the language from the code itself.

## Decision
Option 3. `POST /reviews` takes only `{ code }`; any extra fields are ignored. `language` is removed from `ReviewParams`, `Review`, `ReviewSession.startReview()` and `numberedCodeBlock()`.

## Consequences
- Any language the model knows can be reviewed; nothing in the code limits it.
- No way to force a language when auto-detection guesses wrong (rare for real code).

## Migration plan
SQLite: new sessions create `reviews` without a `language` column. Existing sessions keep the column; it stays NULL and is never read (inserts name their columns explicitly), so no migration is needed.
