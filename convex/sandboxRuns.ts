import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import {
  SandboxStatus,
  validateTransition,
  getTransitionError,
} from "./lib/stateMachine";

/**
 * SandboxRun mutations
 *
 * Manages the lifecycle of E2B sandbox runs with state machine validation.
 * Status transitions are enforced to prevent invalid state changes.
 */

/**
 * Create a new sandbox run
 * @param threadId - The thread this run is associated with
 * @param workspaceId - The workspace this run belongs to
 * @param status - Initial status (typically "booting")
 * @param maxDurationMs - Optional maximum duration in milliseconds
 * @param idleTimeoutMs - Optional idle timeout in milliseconds
 * @returns The ID of the created sandbox run
 */
export const create = mutation({
  args: {
    threadId: v.string(),
    workspaceId: v.id("workspaces"),
    status: v.union(
      v.literal("booting"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("canceled")
    ),
    maxDurationMs: v.optional(v.number()),
    idleTimeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"sandboxRuns">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to create a sandbox run");
    }

    // Verify workspace exists and user has access
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check membership
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (membership === null) {
      throw new Error("Unauthorized: must be a workspace member to create sandbox runs");
    }

    const now = Date.now();
    const sandboxRunId = await ctx.db.insert("sandboxRuns", {
      threadId: args.threadId,
      workspaceId: args.workspaceId,
      createdBy: identity.subject,
      status: args.status,
      startedAt: now,
      lastActivityAt: now,
      maxDurationMs: args.maxDurationMs,
      idleTimeoutMs: args.idleTimeoutMs,
    });

    return sandboxRunId;
  },
});

/**
 * Update a sandbox run
 * @param sandboxRunId - The ID of the sandbox run to update
 * @param sandboxId - Optional E2B sandbox ID
 * @param status - Optional new status (will be validated)
 * @param finishedAt - Optional finished timestamp
 * @param lastActivityAt - Optional last activity timestamp
 * @param e2bCost - Optional E2B cost in dollars
 * @param error - Optional error object
 */
export const update = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    sandboxId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("booting"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("failed"),
        v.literal("canceled")
      )
    ),
    finishedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    e2bCost: v.optional(v.number()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
        details: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to update a sandbox run");
    }

    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (sandboxRun === null) {
      throw new Error("Sandbox run not found");
    }

    // Validate status transition if status is being changed
    if (args.status !== undefined && args.status !== sandboxRun.status) {
      const isValid = validateTransition(
        sandboxRun.status as SandboxStatus,
        args.status as SandboxStatus
      );
      if (!isValid) {
        throw new Error(
          getTransitionError(
            sandboxRun.status as SandboxStatus,
            args.status as SandboxStatus
          )
        );
      }
    }

    // Build update object with only provided fields
    const updates: Partial<{
      sandboxId: string;
      status: typeof args.status;
      finishedAt: number;
      lastActivityAt: number;
      e2bCost: number;
      error: typeof args.error;
    }> = {};

    if (args.sandboxId !== undefined) {
      updates.sandboxId = args.sandboxId;
    }
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.finishedAt !== undefined) {
      updates.finishedAt = args.finishedAt;
    }
    if (args.lastActivityAt !== undefined) {
      updates.lastActivityAt = args.lastActivityAt;
    }
    if (args.e2bCost !== undefined) {
      updates.e2bCost = args.e2bCost;
    }
    if (args.error !== undefined) {
      updates.error = args.error;
    }

    await ctx.db.patch(args.sandboxRunId, updates);
  },
});

/**
 * Get a sandbox run by ID
 * @param sandboxRunId - The ID of the sandbox run
 * @returns The sandbox run or null if not found
 */
export const get = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns"> | null> => {
    return await ctx.db.get(args.sandboxRunId);
  },
});

/**
 * List all sandbox runs for a workspace
 * @param workspaceId - The workspace ID
 * @returns Array of sandbox runs
 */
export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns">[]> => {
    return await ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

/**
 * List all sandbox runs for a thread
 * @param threadId - The thread ID
 * @returns Array of sandbox runs
 */
export const listByThread = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns">[]> => {
    return await ctx.db
      .query("sandboxRuns")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

/**
 * Find idle running sandboxes that should be cleaned up
 * Returns sandboxes where:
 * - status is 'running'
 * - sandboxId exists (sandbox was actually created)
 * - (now - lastActivityAt) > maxIdleMs
 *
 * @param maxIdleMs - Maximum idle time in milliseconds
 * @returns Array of idle sandbox runs
 */
export const findIdle = query({
  args: {
    maxIdleMs: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns">[]> => {
    const now = Date.now();
    const cutoffTime = now - args.maxIdleMs;

    // Get all running sandboxes
    const runningSandboxes = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    // Filter to idle sandboxes with a valid sandboxId
    return runningSandboxes.filter((run) => {
      // Must have a sandboxId (sandbox was actually created)
      if (run.sandboxId === undefined) {
        return false;
      }
      // Must be idle longer than maxIdleMs
      return run.lastActivityAt < cutoffTime;
    });
  },
});

// ============================================================================
// Internal mutations (for use by actions)
// ============================================================================

/**
 * Internal mutation to create a sandbox run (bypasses auth for action use)
 * @param threadId - The thread this run is associated with
 * @param workspaceId - The workspace this run belongs to
 * @param createdBy - The user ID who created this run
 * @param maxDurationMs - Optional maximum duration in milliseconds
 * @param idleTimeoutMs - Optional idle timeout in milliseconds
 * @returns The ID of the created sandbox run
 */
export const internalCreate = internalMutation({
  args: {
    threadId: v.string(),
    workspaceId: v.id("workspaces"),
    createdBy: v.string(),
    maxDurationMs: v.optional(v.number()),
    idleTimeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"sandboxRuns">> => {
    const now = Date.now();
    const sandboxRunId = await ctx.db.insert("sandboxRuns", {
      threadId: args.threadId,
      workspaceId: args.workspaceId,
      createdBy: args.createdBy,
      status: "booting",
      startedAt: now,
      lastActivityAt: now,
      maxDurationMs: args.maxDurationMs,
      idleTimeoutMs: args.idleTimeoutMs,
    });

    return sandboxRunId;
  },
});

/**
 * Internal mutation to update a sandbox run (bypasses auth for action use)
 * @param sandboxRunId - The ID of the sandbox run to update
 * @param sandboxId - Optional E2B sandbox ID
 * @param status - Optional new status (will be validated)
 * @param finishedAt - Optional finished timestamp
 * @param lastActivityAt - Optional last activity timestamp
 * @param e2bCost - Optional E2B cost in dollars
 * @param error - Optional error object
 */
export const internalUpdate = internalMutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    sandboxId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("booting"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("failed"),
        v.literal("canceled")
      )
    ),
    finishedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    e2bCost: v.optional(v.number()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
        details: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (sandboxRun === null) {
      throw new Error("Sandbox run not found");
    }

    // Validate status transition if status is being changed
    if (args.status !== undefined && args.status !== sandboxRun.status) {
      const isValid = validateTransition(
        sandboxRun.status as SandboxStatus,
        args.status as SandboxStatus
      );
      if (!isValid) {
        throw new Error(
          getTransitionError(
            sandboxRun.status as SandboxStatus,
            args.status as SandboxStatus
          )
        );
      }
    }

    // Build update object with only provided fields
    const updates: Partial<{
      sandboxId: string;
      status: typeof args.status;
      finishedAt: number;
      lastActivityAt: number;
      e2bCost: number;
      error: typeof args.error;
    }> = {};

    if (args.sandboxId !== undefined) {
      updates.sandboxId = args.sandboxId;
    }
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.finishedAt !== undefined) {
      updates.finishedAt = args.finishedAt;
    }
    if (args.lastActivityAt !== undefined) {
      updates.lastActivityAt = args.lastActivityAt;
    }
    if (args.e2bCost !== undefined) {
      updates.e2bCost = args.e2bCost;
    }
    if (args.error !== undefined) {
      updates.error = args.error;
    }

    await ctx.db.patch(args.sandboxRunId, updates);
  },
});
