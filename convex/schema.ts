import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  sandboxStatusValidator,
  artifactTypeValidator,
  reviewStateValidator,
  memberRoleValidator,
} from "./lib/validators";

/**
 * Schema for Claude Agent SDK Experiments with Convex backend
 *
 * Tables:
 * - workspaces: Multi-tenant workspace containers
 * - workspaceMembers: User membership and roles within workspaces
 * - sandboxRuns: E2B sandbox execution tracking with state machine
 * - artifacts: Files and outputs produced by sandbox runs
 */
export default defineSchema({
  // Workspace table - multi-tenant container
  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // Workspace membership with role-based access
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: memberRoleValidator,
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  // E2B sandbox execution tracking
  sandboxRuns: defineTable({
    threadId: v.string(),
    workspaceId: v.id("workspaces"),
    createdBy: v.string(),
    sandboxId: v.optional(v.string()),
    status: sandboxStatusValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    maxDurationMs: v.optional(v.number()),
    idleTimeoutMs: v.optional(v.number()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
        details: v.optional(v.string()),
      })
    ),
    // Cost tracking fields (added for SDK integration)
    cost: v.optional(
      v.object({
        claudeCost: v.number(),
        e2bCost: v.number(),
        totalCost: v.number(),
      })
    ),
    tokenUsage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
        cachedTokens: v.optional(v.number()),
      })
    ),
    durationMs: v.optional(v.number()),
    // Observability link
    braintrustTraceId: v.optional(v.string()),
    // Result storage (truncated)
    result: v.optional(v.string()),
    // Prompt for reference
    prompt: v.optional(v.string()),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_workspace", ["threadId", "workspaceId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"])
    .index("by_status_activity", ["status", "lastActivityAt"])
    .index("by_status_startedAt", ["status", "startedAt"])
    .index("by_createdBy_startedAt", ["createdBy", "startedAt"])
    .index("by_braintrustTraceId", ["braintrustTraceId"])
    .index("by_workspace_startedAt", ["workspaceId", "startedAt"]),

  // Artifacts produced by sandbox runs
  artifacts: defineTable({
    sandboxRunId: v.id("sandboxRuns"),
    workspaceId: v.id("workspaces"), // Denormalized for efficient workspace+review queries
    threadId: v.string(),
    type: artifactTypeValidator,
    title: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sandboxPath: v.optional(v.string()),
    reviewState: reviewStateValidator,
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run", ["sandboxRunId"])
    .index("by_thread", ["threadId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_review", ["workspaceId", "reviewState"])
    .index("by_storageId", ["storageId"]),
});
