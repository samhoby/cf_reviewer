# ADR: Line-numbered code and temperature 0.2

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
The prompts ask the model to reference line numbers, but the code was sent without them, so line references were guesses. Output also varied between runs.

## Options considered
1. **Leave as is** — inconsistent and unreliable line references.
2. **Prefix each line with `N | ` and lower temperature** — accurate references and more consistent output.

## Decision
Option 2. `numberedCodeBlock()` in `ai.ts` prefixes lines for every review step and for the follow-up chat context, so the report's line numbers match what the chat model sees. Prompts state that the prefixes are not part of the code. `runModel()` uses `temperature: 0.2`.

## Consequences
- Slightly more input tokens per call.
- Less creative variation in reviews, which is the intent.

## Migration plan
None. Prompt and `ai.ts` change only.
