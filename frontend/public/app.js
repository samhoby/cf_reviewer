// UI and session state. Network calls live in api.js, Markdown in markdown.js.
import { api } from "./api.js";
import { renderMarkdown } from "./markdown.js";

const MAX_CODE = 15_000;
const POLL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_LABELS = {
  running: "Reviewing…",
  completed: "Done",
  failed: "Failed",
  rejected: "Not code",
};

const $ = (id) => document.getElementById(id);
const el = {
  newSessionBtn: $("newSessionBtn"),
  code: $("code"),
  charCount: $("charCount"),
  reviewBtn: $("reviewBtn"),
  status: $("status"),
  output: $("output"),
  report: $("report"),
  messages: $("messages"),
  chatForm: $("chatForm"),
  chatInput: $("chatInput"),
  sendBtn: $("sendBtn"),
};

/** localStorage wrapper; storage can throw (private mode), so failures are ignored. */
const store = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      value == null
        ? localStorage.removeItem(key)
        : localStorage.setItem(key, value);
    } catch {}
  },
};

let sessionId = null;
let polling = false;

// ---- Session ----

/** Reuses the stored session, or creates a new one when `forceNew` is set or none exists. */
async function startSession(forceNew = false) {
  sessionId = forceNew ? null : store.get("sessionId");
  if (!sessionId) {
    ({ sessionId } = await api.createSession());
    store.set("sessionId", sessionId);
    store.set("reviewId", null);
  }
}

/** Restores the last review and chat history after a page reload. */
async function restoreSession() {
  const reviewId = store.get("reviewId");
  if (reviewId) {
    try {
      const { review } = await api.getReview(sessionId, reviewId);
      el.code.value = review.code;
      updateCharCount();
      showReview(review);
      if (review.status === "running") pollReview(reviewId);
    } catch {
      store.set("reviewId", null); // review no longer exists
    }
  }
  const { messages } = await api.getMessages(sessionId);
  messages.forEach((m) => addMessage(m.role, m.content));
}

/** Deletes the current session's data, clears the UI and starts a fresh session. */
async function newSession() {
  if (polling) return;
  const oldSessionId = sessionId;
  // Best effort: the old session is unreachable after this, so free its storage.
  api.resetSession(oldSessionId).catch(() => {});
  el.messages.replaceChildren();
  el.code.value = "";
  updateCharCount();
  resetReport();
  await startSession(true);
}

// ---- Review ----

/** Submits the code and waits for the review Workflow to finish. */
async function startReview() {
  const code = el.code.value.trimEnd(); // keep first-line indentation
  if (!code.trim() || polling) return;
  if (code.length > MAX_CODE) return setStatus("failed", "Code too long");

  try {
    setBusy(true);
    const { reviewId } = await api.startReview(sessionId, code);
    store.set("reviewId", reviewId);
    showReview({ status: "running" });
    await pollReview(reviewId);
  } catch (err) {
    showReview({ status: "failed", error: err.message });
  } finally {
    setBusy(false);
  }
}

/** Polls a review until it leaves "running" or the timeout is reached. */
async function pollReview(reviewId) {
  polling = true;
  setBusy(true);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const { review } = await api.getReview(sessionId, reviewId);
      if (review.status !== "running") return showReview(review);
    }
    showReview({ status: "failed", error: "Timed out waiting for the review." });
  } catch (err) {
    showReview({ status: "failed", error: err.message });
  } finally {
    polling = false;
    setBusy(false);
  }
}

/** Renders the review panel for the given review status. */
function showReview(review) {
  setStatus(review.status);
  switch (review.status) {
    case "running":
      el.report.innerHTML = `<div class="progress"><div class="spinner" role="status" aria-label="Reviewing"></div></div>`;
      break;
    case "completed":
      el.report.innerHTML = `<article class="md report">${renderMarkdown(review.report || "")}</article>`;
      break;
    case "rejected":
      showBox("notice", review.error || "This doesn't look like code.");
      break;
    default:
      showBox("error", `Review failed: ${review.error || "unknown error"}`);
  }
  scrollToBottom();
}

/** Replaces the report with a plain-text message box (notice or error). */
function showBox(className, text) {
  const box = document.createElement("div");
  box.className = className;
  box.textContent = text;
  el.report.replaceChildren(box);
}

/** Shows the empty state and hides the status badge. */
function resetReport() {
  el.report.innerHTML = `<div class="empty"><p>Paste some code and hit <strong>Review code</strong>.</p></div>`;
  el.status.hidden = true;
}

// ---- Chat ----

/** Sends a question; restores the input if the request fails. */
async function sendMessage(event) {
  event.preventDefault();
  const content = el.chatInput.value.trim();
  if (!content) return;

  el.chatInput.value = "";
  autoGrow();
  addMessage("user", content);
  const pending = addMessage("assistant", "Thinking…", true);
  el.sendBtn.disabled = true;

  try {
    const { message } = await api.sendMessage(sessionId, content);
    pending.classList.replace("pending", "md");
    pending.innerHTML = renderMarkdown(message.content);
  } catch (err) {
    pending.classList.replace("pending", "error");
    pending.textContent = err.message;
    el.chatInput.value = content;
  } finally {
    el.sendBtn.disabled = false;
    scrollToBottom();
  }
}

/** Appends a chat bubble; assistant replies are rendered as Markdown. */
function addMessage(role, content, pending = false) {
  const div = document.createElement("div");
  div.className = `msg ${role}${pending ? " pending" : ""}`;
  if (role === "assistant" && !pending) {
    div.classList.add("md");
    div.innerHTML = renderMarkdown(content);
  } else {
    div.textContent = content;
  }
  el.messages.append(div);
  scrollToBottom();
  return div;
}

// ---- UI helpers ----

/** Updates the status badge; `label` overrides the default text. */
function setStatus(status, label) {
  el.status.hidden = false;
  el.status.className = `badge ${status}`;
  el.status.textContent = label || STATUS_LABELS[status];
}

/** Disables the review and new-session buttons while a review runs. */
function setBusy(busy) {
  el.reviewBtn.disabled = busy;
  el.newSessionBtn.disabled = busy;
}

/** Updates the "n / 15,000" counter and flags it when over the limit. */
function updateCharCount() {
  const n = el.code.value.length;
  el.charCount.textContent = `${n.toLocaleString()} / ${MAX_CODE.toLocaleString()}`;
  el.charCount.classList.toggle("over", n > MAX_CODE);
}

/** Grows the chat input with its content, up to 160px. */
function autoGrow() {
  el.chatInput.style.height = "auto";
  el.chatInput.style.height = `${Math.min(el.chatInput.scrollHeight, 160)}px`;
}

/** Scrolls the output panel to the newest content. */
function scrollToBottom() {
  el.output.scrollTop = el.output.scrollHeight;
}

/** Resolves after `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Events ----

el.reviewBtn.addEventListener("click", startReview);
el.newSessionBtn.addEventListener("click", () =>
  newSession().catch((err) => setStatus("failed", err.message)),
);
el.chatForm.addEventListener("submit", sendMessage);
el.code.addEventListener("input", updateCharCount);
el.chatInput.addEventListener("input", autoGrow);

// Ctrl/Cmd+Enter reviews; Tab indents instead of leaving the field.
el.code.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    startReview();
  }
  if (event.key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    el.code.setRangeText(
      "  ",
      el.code.selectionStart,
      el.code.selectionEnd,
      "end",
    );
    updateCharCount();
  }
});

// Enter sends; Shift+Enter adds a new line.
el.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.chatForm.requestSubmit();
  }
});

// ---- Boot ----

startSession()
  .then(restoreSession)
  .catch((err) => setStatus("failed", err.message));
