const API_BASE = "/api";

/** Error thrown for any non-2xx API response; carries the HTTP status. */
export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Error message from the API (`{ error }`) or a fallback
   */
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Thin JSON wrapper around fetch() for the Worker API. */
class HttpClient {
  /**
   * Sends a request to `/api{path}` and returns the parsed JSON body.
   * Resolves to `null` for empty responses (e.g. 204). Throws HttpError on failure.
   * @template T
   * @param {string} path
   * @param {RequestInit} [options]
   * @returns {Promise<T>}
   */
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await parseJson(response);

    if (!response.ok) {
      const message = data?.error || response.statusText || `Request failed (${response.status})`;
      throw new HttpError(response.status, message);
    }
    return data;
  }

  /** GET request. */
  get(path) {
    return this.request(path);
  }

  /** POST request; `body` is sent as JSON when provided. */
  post(path, body) {
    return this.request(path, { method: "POST", body: toJson(body) });
  }

  /** DELETE request. */
  delete(path) {
    return this.request(path, { method: "DELETE" });
  }
}

/** Parses a JSON body; returns null for empty or non-JSON bodies. */
async function parseJson(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    console.warn("Non-JSON response:", text.slice(0, 200));
    return null;
  }
}

/** Serializes a request body, or returns undefined when there is none. */
function toJson(body) {
  return body === undefined ? undefined : JSON.stringify(body);
}

export const httpClient = new HttpClient();
