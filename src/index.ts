// Worker entry point: routes /api/* requests and validates all input at the
// edge. Storage lives in ReviewSession, the review pipeline in ReviewWorkflow.
import {
  HttpError,
  json,
  noContent,
  readJsonBody,
  Router,
  type RouteContext,
} from "./http";
import type { Env } from "./types";

export { ReviewSession } from "./review-session";
export { ReviewWorkflow } from "./workflow";

/** Max code length; keeps code + report inside the model's context window. */
const MAX_CODE_CHARS = 15_000;
/** Max follow-up question length. */
const MAX_MESSAGE_CHARS = 8_000;
/** Max request body; headroom over the char limits for UTF-8 and JSON escaping. */
const MAX_BODY_BYTES = 128 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = RouteContext<Env>;

const router = new Router<Env>()
  .on("POST", "/api/sessions", createSession)
  .on("DELETE", "/api/sessions/:sessionId", resetSession)
  .on("POST", "/api/sessions/:sessionId/reviews", startReview)
  .on("GET", "/api/sessions/:sessionId/reviews/:reviewId", getReview)
  .on("GET", "/api/sessions/:sessionId/messages", getMessages)
  .on("POST", "/api/sessions/:sessionId/messages", sendMessage);

export default {
  fetch: (req, env) => router.handle(req, env),
} satisfies ExportedHandler<Env>;

// ---- Handlers ----

/** POST /api/sessions — new session id; its Durable Object is created on first use. */
async function createSession(): Promise<Response> {
  return json({ sessionId: crypto.randomUUID() }, 201);
}

/** DELETE /api/sessions/:sessionId — clears the session's reviews and chat. */
async function resetSession({ env, params }: Context): Promise<Response> {
  await sessionStub(env, params.sessionId).reset();
  return noContent();
}

/** POST /api/sessions/:sessionId/reviews — records a review and starts the Workflow. */
async function startReview({ req, env, params }: Context): Promise<Response> {
  const sessionId = requireUuid(params.sessionId, "session id");
  const code = parseReviewInput(await readJsonBody(req, MAX_BODY_BYTES));
  const session = sessionStub(env, sessionId);
  const reviewId = crypto.randomUUID();

  // Record the review first so the Workflow always has a row to update.
  await session.startReview(reviewId, code);
  try {
    await env.REVIEW_WORKFLOW.create({
      id: reviewId,
      params: { sessionId, reviewId, code },
    });
  } catch (err) {
    await session.failReview(reviewId, "Failed to start workflow");
    throw err;
  }
  return json({ reviewId, status: "running" }, 202);
}

/** GET /api/sessions/:sessionId/reviews/:reviewId — review status and report. */
async function getReview({ env, params }: Context): Promise<Response> {
  const reviewId = requireUuid(params.reviewId, "review id");
  const review = await sessionStub(env, params.sessionId).getReview(reviewId);
  if (!review) throw new HttpError(404, "Review not found");
  return json({ review });
}

/** GET /api/sessions/:sessionId/messages — chat history. */
async function getMessages({ env, params }: Context): Promise<Response> {
  const messages = await sessionStub(env, params.sessionId).getMessages();
  return json({ messages });
}

/** POST /api/sessions/:sessionId/messages — follow-up question → AI reply. */
async function sendMessage({ req, env, params }: Context): Promise<Response> {
  const session = sessionStub(env, params.sessionId);
  const content = parseMessageInput(await readJsonBody(req, MAX_BODY_BYTES));
  return json({ message: await session.chat(content) });
}

// ---- Validation ----

/** Returns the session's Durable Object stub after validating its id. */
function sessionStub(env: Env, sessionId: string | undefined) {
  const id = requireUuid(sessionId, "session id");
  return env.REVIEW_SESSION.get(env.REVIEW_SESSION.idFromName(id));
}

/** Throws 400 unless `value` is a UUID. */
function requireUuid(value: string | undefined, name: string): string {
  if (!value || !UUID_RE.test(value)) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value;
}

/** Throws 400 unless the body is a JSON object. */
function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

/** Validates `{ code }` (any language; the model auto-detects it). Keeps first-line indentation. */
function parseReviewInput(body: unknown): string {
  const { code } = requireObject(body);
  if (typeof code !== "string" || !code.trim()) {
    throw new HttpError(400, "code is required");
  }
  const trimmed = code.trimEnd();
  if (trimmed.length > MAX_CODE_CHARS) {
    throw new HttpError(413, `code exceeds ${MAX_CODE_CHARS} chars`);
  }
  return trimmed;
}

/** Validates `{ content }` for a follow-up question. */
function parseMessageInput(body: unknown): string {
  const { content } = requireObject(body);
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw new HttpError(400, "content is required");
  if (text.length > MAX_MESSAGE_CHARS) {
    throw new HttpError(413, `content exceeds ${MAX_MESSAGE_CHARS} chars`);
  }
  return text;
}
