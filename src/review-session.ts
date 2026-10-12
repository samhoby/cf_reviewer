import { DurableObject } from "cloudflare:workers";
import { numberedCodeBlock, runModel, type ChatMessage } from "./ai";
import { CHAT_PROMPT } from "./prompts";
import type { Env, Message, Review, ReviewFindings, Role } from "./types";

const HISTORY_LIMIT = 12; // recent chat messages sent as context

type MessageRow = { id: number; role: Role; content: string; created_at: number };
type ReviewRow = {
  id: string; status: Review["status"]; code: string; language: string | null;
  security: string | null; logic: string | null; report: string | null;
  error: string | null; created_at: number; completed_at: number | null;
};

// One instance per review session; state lives in its SQLite DB.
export class ReviewSession extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        role       TEXT    NOT NULL,
        content    TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id           TEXT    PRIMARY KEY,
        status       TEXT    NOT NULL,
        code         TEXT    NOT NULL,
        language     TEXT,
        security     TEXT,
        logic        TEXT,
        report       TEXT,
        error        TEXT,
        created_at   INTEGER NOT NULL,
        completed_at INTEGER
      );
    `);
  }

  // ---- Reviews (written by the Workflow) ----

  startReview(reviewId: string, code: string, language: string | null): void {
    this.sql.exec(
      "INSERT OR IGNORE INTO reviews (id, status, code, language, created_at) VALUES (?, 'running', ?, ?, ?)",
      reviewId, code, language, Date.now(),
    );
  }

  completeReview(reviewId: string, f: ReviewFindings): void {
    this.sql.exec(
      `UPDATE reviews SET status = 'completed', security = ?, logic = ?, report = ?,
       error = NULL, completed_at = ? WHERE id = ?`,
      f.security, f.logic, f.report, Date.now(), reviewId,
    );
  }

  failReview(reviewId: string, error: string): void {
    this.sql.exec(
      "UPDATE reviews SET status = 'failed', error = ?, completed_at = ? WHERE id = ? AND status = 'running'",
      error, Date.now(), reviewId,
    );
  }

  rejectReview(reviewId: string, reason: string): void {
    this.sql.exec(
      "UPDATE reviews SET status = 'rejected', error = ?, completed_at = ? WHERE id = ? AND status = 'running'",
      reason, Date.now(), reviewId,
    );
  }

  getReview(reviewId: string): Review | null {
    const row = this.sql.exec<ReviewRow>("SELECT * FROM reviews WHERE id = ?", reviewId).toArray()[0];
    return row ? toReview(row) : null;
  }

  // ---- Chat ----

  getMessages(): Message[] {
    return this.sql
      .exec<MessageRow>("SELECT * FROM messages ORDER BY id")
      .toArray()
      .map(toMessage);
  }

  // Follow-up chat, grounded in the latest completed review.
  async chat(content: string): Promise<Message> {
    const history = this.sql
      .exec<MessageRow>("SELECT * FROM messages ORDER BY id DESC LIMIT ?", HISTORY_LIMIT)
      .toArray()
      .reverse();

    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt() },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ];
    const reply = await runModel(this.env.AI, messages, 2048);

    // Only persist once the model call succeeded.
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      this.insertMessage("user", content, now);
      return this.insertMessage("assistant", reply, Date.now());
    });
  }

  reset(): void {
    this.sql.exec("DELETE FROM messages; DELETE FROM reviews;");
  }

  private systemPrompt(): string {
    const review = this.sql
      .exec<ReviewRow>("SELECT * FROM reviews WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1")
      .toArray()[0];
    if (!review) return CHAT_PROMPT;
    return `${CHAT_PROMPT}\n\n# Code under review\n${numberedCodeBlock(review.code, review.language)}\n\n# Initial review report\n${review.report}`;
  }

  private insertMessage(role: Role, content: string, createdAt: number): Message {
    const row = this.sql
      .exec<MessageRow>(
        "INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?) RETURNING *",
        role, content, createdAt,
      )
      .one();
    return toMessage(row);
  }
}

function toMessage(r: MessageRow): Message {
  return { id: r.id, role: r.role, content: r.content, createdAt: r.created_at };
}

function toReview(r: ReviewRow): Review {
  return {
    id: r.id, status: r.status, code: r.code, language: r.language,
    security: r.security, logic: r.logic, report: r.report, error: r.error,
    createdAt: r.created_at, completedAt: r.completed_at,
  };
}
