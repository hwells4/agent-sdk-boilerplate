import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
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
    status: v.union(
      v.literal("booting"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("canceled")
    ),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    maxDurationMs: v.optional(v.number()),
    idleTimeoutMs: v.optional(v.number()),
    e2bCost: v.optional(v.number()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
        details: v.optional(v.string()),
      })
    ),
  })
    .index("by_thread", ["threadId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"])
    .index("by_status_activity", ["status", "lastActivityAt"]),

  // Artifacts produced by sandbox runs
  artifacts: defineTable({
    sandboxRunId: v.id("sandboxRuns"),
    threadId: v.string(),
    type: v.union(
      v.literal("file"),
      v.literal("image"),
      v.literal("code"),
      v.literal("log"),
      v.literal("other")
    ),
    title: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sandboxPath: v.optional(v.string()),
    previewText: v.optional(v.string()),
    reviewState: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run", ["sandboxRunId"])
    .index("by_thread", ["threadId"])
    .index("by_review_state", ["reviewState"]),
});
