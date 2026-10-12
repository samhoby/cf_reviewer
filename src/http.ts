// Small HTTP toolkit for the Worker: errors, JSON responses, body parsing
// and a minimal router. No dependencies.

/** Path params captured from `:name` segments, e.g. `{ sessionId: "…" }`. */
export type Params = Record<string, string>;

/** Everything a route handler receives. */
export interface RouteContext<E> {
  req: Request;
  env: E;
  params: Params;
}

export type Handler<E> = (ctx: RouteContext<E>) => Promise<Response>;

/** An error with an HTTP status; its message is safe to show to clients. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: HeadersInit = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** JSON response helper. */
export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(data, { status, headers });
}

/** Empty 204 response. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Reads and parses a JSON body, rejecting bodies over `maxBytes`
 * before they are fully buffered (413) and invalid JSON (400).
 */
export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw tooLarge();

  const text = await readTextWithLimit(req, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Streams the body as text and aborts once it exceeds `maxBytes`. */
async function readTextWithLimit(
  req: Request,
  maxBytes: number,
): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function tooLarge(): HttpError {
  return new HttpError(413, "Request body too large");
}

/** Maps any thrown value to a response; unknown errors are logged and hidden. */
function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message }, err.status, err.headers);
  }
  console.error(err);
  return json({ error: "Internal error" }, 500);
}

interface Route<E> {
  method: string;
  segments: string[];
  handler: Handler<E>;
}

/**
 * Minimal router: exact segment matching with `:param` placeholders.
 * Returns 405 (with an `Allow` header) when only the method is wrong,
 * and 404 when no path matches.
 */
export class Router<E> {
  private readonly routes: Route<E>[] = [];

  /** Registers a handler for `method` + `pattern` (e.g. "/api/items/:id"). */
  on(method: string, pattern: string, handler: Handler<E>): this {
    this.routes.push({ method, segments: split(pattern), handler });
    return this;
  }

  /** Dispatches a request; every error becomes a JSON error response. */
  async handle(req: Request, env: E): Promise<Response> {
    try {
      const path = split(new URL(req.url).pathname);
      const allowed: string[] = [];

      for (const route of this.routes) {
        const params = matchSegments(route.segments, path);
        if (!params) continue;
        if (route.method !== req.method) {
          allowed.push(route.method);
          continue;
        }
        return await route.handler({ req, env, params });
      }

      if (allowed.length > 0) {
        throw new HttpError(405, "Method not allowed", {
          Allow: allowed.join(", "),
        });
      }
      throw new HttpError(404, "Not found");
    } catch (err) {
      return toErrorResponse(err);
    }
  }
}

function split(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Matches path segments against a pattern; returns params or null. */
function matchSegments(pattern: string[], path: string[]): Params | null {
  if (pattern.length !== path.length) return null;
  const params: Params = {};
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(":")) params[pattern[i].slice(1)] = path[i];
    else if (pattern[i] !== path[i]) return null;
  }
  return params;
}
