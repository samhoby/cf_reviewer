import type { Env } from "./types";
export { ReviewSession } from "./review-session";
export { ReviewWorkflow } from "./workflow";

const MAX_CODE_CHARS = 15_000; // keeps code + report inside the model's context window
const MAX_MESSAGE_CHARS = 8_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANG_RE = /^[\w+#.-]{1,30}$/;

// Routes:
//   POST   /api/sessions                          -> new session id
//   DELETE /api/sessions/:id                      -> clear session
//   POST   /api/sessions/:id/reviews              -> start review Workflow
//   GET    /api/sessions/:id/reviews/:reviewId    -> review status + report
//   GET    /api/sessions/:id/messages             -> chat history
//   POST   /api/sessions/:id/messages             -> follow-up question
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== "sessions") return json({ error: "Not found" }, 404);

    try {
      if (parts.length === 2 && req.method === "POST") {
        return json({ sessionId: crypto.randomUUID() }, 201);
      }

      const [, , sessionId, resource, resourceId] = parts;
      if (!sessionId || !UUID_RE.test(sessionId)) return json({ error: "Invalid session id" }, 400);
      const session = env.REVIEW_SESSION.get(env.REVIEW_SESSION.idFromName(sessionId));

      if (parts.length === 3 && req.method === "DELETE") {
        await session.reset();
        return new Response(null, { status: 204 });
      }

      if (resource === "reviews") {
        if (parts.length === 4 && req.method === "POST") {
          const body = await readJson<{ code?: unknown; language?: unknown }>(req);
          const raw = typeof body?.code === "string" ? body.code : "";
          const code = raw.trimEnd(); // keep leading indentation
          const language = typeof body?.language === "string" && LANG_RE.test(body.language) ? body.language : null;
          if (!raw.trim()) return json({ error: "code is required" }, 400);
          if (code.length > MAX_CODE_CHARS) return json({ error: `code exceeds ${MAX_CODE_CHARS} chars` }, 413);

          // Record the review first so the Workflow always has a row to update.
          const reviewId = crypto.randomUUID();
          await session.startReview(reviewId, code, language);
          try {
            await env.REVIEW_WORKFLOW.create({ id: reviewId, params: { sessionId, reviewId, code, language } });
          } catch (err) {
            await session.failReview(reviewId, "Failed to start workflow");
            throw err;
          }
          return json({ reviewId, status: "running" }, 202);
        }

        if (parts.length === 5 && req.method === "GET") {
          if (!UUID_RE.test(resourceId)) return json({ error: "Invalid review id" }, 400);
          const review = await session.getReview(resourceId);
          return review ? json({ review }) : json({ error: "Review not found" }, 404);
        }
      }

      if (resource === "messages" && parts.length === 4) {
        if (req.method === "GET") return json({ messages: await session.getMessages() });
        if (req.method === "POST") {
          const body = await readJson<{ content?: unknown }>(req);
          const content = typeof body?.content === "string" ? body.content.trim() : "";
          if (!content) return json({ error: "content is required" }, 400);
          if (content.length > MAX_MESSAGE_CHARS) {
            return json({ error: `content exceeds ${MAX_MESSAGE_CHARS} chars` }, 413);
          }
          return json({ message: await session.chat(content) });
        }
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function readJson<T>(req: Request): Promise<T | null> {
  return req.json<T>().catch(() => null);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
