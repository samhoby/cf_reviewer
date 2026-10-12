import type { ReviewSession } from "./review-session";

export interface Env {
  AI: Ai;
  REVIEW_SESSION: DurableObjectNamespace<ReviewSession>;
  REVIEW_WORKFLOW: Workflow<ReviewParams>;
}

export type Role = "user" | "assistant";

export interface Message {
  id: number;
  role: Role;
  content: string;
  createdAt: number;
}

// Input passed to the review Workflow
export interface ReviewParams {
  sessionId: string;
  reviewId: string;
  code: string;
}

export type ReviewStatus = "running" | "completed" | "failed" | "rejected";

export interface Review {
  id: string;
  status: ReviewStatus;
  code: string;
  report: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}
