import { httpClient } from "./http-client.js";

/** Encodes an id for safe use in a URL path segment. */
const id = (value) => encodeURIComponent(value);

/** Typed wrappers for every Worker endpoint. See README → API. */
export const api = {
  /** Creates a new review session. → `{ sessionId }` */
  createSession: () =>
    httpClient.post("/sessions"),

  /** Clears a session's reviews and chat history. */
  resetSession: (sessionId) =>
    httpClient.delete(`/sessions/${id(sessionId)}`),

  /** Starts the review Workflow for a code snippet. → `{ reviewId, status }` */
  startReview: (sessionId, code) =>
    httpClient.post(`/sessions/${id(sessionId)}/reviews`, { code }),

  /** Gets a review's status and report. → `{ review }` */
  getReview: (sessionId, reviewId) =>
    httpClient.get(`/sessions/${id(sessionId)}/reviews/${id(reviewId)}`),

  /** Gets the session's chat history. → `{ messages }` */
  getMessages: (sessionId) =>
    httpClient.get(`/sessions/${id(sessionId)}/messages`),

  /** Sends a follow-up question and returns the AI reply. → `{ message }` */
  sendMessage: (sessionId, content) =>
    httpClient.post(`/sessions/${id(sessionId)}/messages`, { content }),
};
