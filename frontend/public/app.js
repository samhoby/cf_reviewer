(function () {
  const MAX_CODE = 15000;
  const POLL_MS = 2000;
  const POLL_TIMEOUT_MS = 5 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const el = {
    sessionLabel: $("sessionLabel"), newSessionBtn: $("newSessionBtn"),
    code: $("code"), charCount: $("charCount"), reviewBtn: $("reviewBtn"),
    status: $("status"), output: $("output"), report: $("report"), messages: $("messages"),
    chatForm: $("chatForm"), chatInput: $("chatInput"), sendBtn: $("sendBtn"),
  };

  // localStorage can throw (private mode etc.), so wrap it.
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  let sessionId = null;
  let polling = false;

  // ---- API ----

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ---- Session ----

  async function startSession(forceNew = false) {
    sessionId = forceNew ? null : store.get("sessionId");
    if (!sessionId) {
      ({ sessionId } = await api("/sessions", { method: "POST" }));
      store.set("sessionId", sessionId);
      store.set("reviewId", null);
    }
    el.sessionLabel.textContent = sessionId.slice(0, 8);
    el.sessionLabel.title = sessionId;
  }

  async function restore() {
    const reviewId = store.get("reviewId");
    if (reviewId) {
      try {
        const { review } = await api(`/sessions/${sessionId}/reviews/${reviewId}`);
        el.code.value = review.code;
        updateCount();
        showReview(review);
        if (review.status === "running") pollReview(reviewId);
      } catch {
        store.set("reviewId", null);
      }
    }
    const { messages } = await api(`/sessions/${sessionId}/messages`);
    messages.forEach((m) => addMessage(m.role, m.content));
  }

  async function newSession() {
    if (polling) return;
    el.messages.innerHTML = "";
    el.code.value = "";
    updateCount();
    resetReport();
    await startSession(true);
  }

  // ---- Review ----

  async function startReview() {
    const code = el.code.value.trimEnd(); // keep first-line indentation
    if (!code.trim() || polling) return;
    if (code.length > MAX_CODE) return setStatus("failed", "Code too long");

    try {
      setBusy(true);
      const { reviewId } = await api(`/sessions/${sessionId}/reviews`, {
        method: "POST",
        body: { code },
      });
      store.set("reviewId", reviewId);
      showReview({ status: "running" });
      await pollReview(reviewId);
    } catch (err) {
      showReview({ status: "failed", error: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function pollReview(reviewId) {
    polling = true;
    setBusy(true);
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const { review } = await api(`/sessions/${sessionId}/reviews/${reviewId}`);
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

  function showReview(review) {
    setStatus(review.status);
    if (review.status === "running") {
      el.report.innerHTML = `<div class="progress"><div class="spinner" role="status" aria-label="Reviewing"></div></div>`;
    } else if (review.status === "completed") {
      el.report.innerHTML = `<article class="md report">${renderMarkdown(review.report || "")}</article>`;
    } else if (review.status === "rejected") {
      el.report.innerHTML = "";
      const box = document.createElement("div");
      box.className = "notice";
      box.textContent = review.error || "This doesn't look like code.";
      el.report.append(box);
    } else {
      el.report.innerHTML = "";
      const box = document.createElement("div");
      box.className = "error";
      box.textContent = `Review failed: ${review.error || "unknown error"}`;
      el.report.append(box);
    }
    scrollToBottom();
  }

  function resetReport() {
    el.report.innerHTML = `<div class="empty"><p>Paste some code and hit <strong>Review code</strong>.</p></div>`;
    el.status.hidden = true;
  }

  // ---- Chat ----

  async function sendMessage(e) {
    e.preventDefault();
    const content = el.chatInput.value.trim();
    if (!content) return;

    el.chatInput.value = "";
    autoGrow();
    addMessage("user", content);
    const pending = addMessage("assistant", "Thinking…", true);
    el.sendBtn.disabled = true;

    try {
      const { message } = await api(`/sessions/${sessionId}/messages`, { method: "POST", body: { content } });
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

  function setStatus(status, label) {
    el.status.hidden = false;
    el.status.className = `badge ${status}`;
    el.status.textContent = label || { running: "Reviewing…", completed: "Done", failed: "Failed", rejected: "Not code" }[status];
  }

  function setBusy(busy) {
    el.reviewBtn.disabled = busy;
    el.newSessionBtn.disabled = busy;
  }

  function updateCount() {
    const n = el.code.value.length;
    el.charCount.textContent = `${n.toLocaleString()} / ${MAX_CODE.toLocaleString()}`;
    el.charCount.classList.toggle("over", n > MAX_CODE);
  }

  function autoGrow() {
    el.chatInput.style.height = "auto";
    el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 160) + "px";
  }

  const scrollToBottom = () => { el.output.scrollTop = el.output.scrollHeight; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- Events ----

  el.reviewBtn.addEventListener("click", startReview);
  el.newSessionBtn.addEventListener("click", () => newSession().catch((e) => setStatus("failed", e.message)));
  el.chatForm.addEventListener("submit", sendMessage);
  el.code.addEventListener("input", updateCount);
  el.chatInput.addEventListener("input", autoGrow);

  el.code.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); startReview(); }
    if (e.key === "Tab" && !e.shiftKey) { // indent instead of leaving the field
      e.preventDefault();
      el.code.setRangeText("  ", el.code.selectionStart, el.code.selectionEnd, "end");
      updateCount();
    }
  });

  el.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.chatForm.requestSubmit(); }
  });

  // ---- Boot ----

  startSession()
    .then(restore)
    .catch((err) => setStatus("failed", err.message));
})();
