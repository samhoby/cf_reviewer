# Instructions for AI agents

Before making any change in this repository:

1. Read [`docs/CONSTITUTION.md`](docs/CONSTITUTION.md). Its rules are binding.
2. Read the Architecture Decision Records in [`docs/adr/`](docs/adr/). Do not revert an accepted ADR without explicit permission from the developer.
3. If your change hits an ADR trigger (new dependency or binding, SQLite schema change, model/prompt shift, Workflow step change, deployment shift, latency/consistency trade-off), ask the developer the ADR justification questions first, then add a new ADR using [`docs/adr/TEMPLATE.md`](docs/adr/TEMPLATE.md).
4. Before finishing, run `npm run typecheck` and update docs/comments where behavior changed.
