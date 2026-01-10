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
    e2bCost: v.optional(v.number()), // TODO: Implement E2B cost tracking
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
    .index("by_status_activity", ["status", "lastActivityAt"])
    .index("by_status_startedAt", ["status", "startedAt"])
    .index("by_createdBy_startedAt", ["createdBy", "startedAt"]),

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
    previewText: v.optional(v.string()), // TODO: Implement artifact preview generation
    reviewState: reviewStateValidator,
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run", ["sandboxRunId"])
    .index("by_thread", ["threadId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_review", ["workspaceId", "reviewState"]),
});
