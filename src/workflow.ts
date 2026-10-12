import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { numberedCodeBlock, runModel } from "./ai";
import { COMBINE_PROMPT, IS_CODE_PROMPT, LOGIC_PROMPT, SECURITY_PROMPT } from "./prompts";
import type { Env, ReviewParams } from "./types";

// Retry flaky LLM calls; each step result is persisted by Workflows.
const LLM_STEP = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes",
} as const;

export class ReviewWorkflow extends WorkflowEntrypoint<Env, ReviewParams> {
  async run(event: Readonly<WorkflowEvent<ReviewParams>>, step: WorkflowStep) {
    const { sessionId, reviewId, code, language } = event.payload;
    const session = this.env.REVIEW_SESSION.get(
      this.env.REVIEW_SESSION.idFromName(sessionId),
    );
    const snippet = numberedCodeBlock(code, language);
    const ask = (system: string, user: string, maxTokens?: number) =>
      runModel(
        this.env.AI,
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens,
      );

    try {
      // Step 0: skip the full review if the input isn't code (e.g. "hello").
      const isCode = await step.do("check-input", LLM_STEP, async () => {
        const answer = await ask(IS_CODE_PROMPT, code.slice(0, 2000), 5);
        return !/NOT_CODE/i.test(answer); // anything unclear counts as code
      });
      if (!isCode) {
        await step.do("reject-input", async () => {
          await session.rejectReview(reviewId, "This doesn't look like code. Paste a code snippet to review.");
        });
        return { reviewId, status: "rejected" };
      }

      // Steps 1 + 2 don't depend on each other, so run them in parallel.
      const [security, logic] = await Promise.all([
        step.do("security-check", LLM_STEP, () => ask(SECURITY_PROMPT, snippet)),
        step.do("logic-check", LLM_STEP, () => ask(LOGIC_PROMPT, snippet)),
      ]);

      // Step 3a: merge findings into one report.
      const report = await step.do("combine-report", LLM_STEP, () =>
        ask(
          COMBINE_PROMPT,
          `## Code\n${snippet}\n\n## Security findings\n${security}\n\n## Bug & performance findings\n${logic}`,
          2048,
        ),
      );

      // Step 3b: save to the session's SQLite DB (idempotent, safe to retry).
      await step.do("save-report", async () => {
        await session.completeReview(reviewId, { security, logic, report });
      });

      return { reviewId, status: "completed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await step.do("mark-failed", async () => {
        await session.failReview(reviewId, message);
      });
      throw err; // keep the instance marked as errored
    }
  }
}
