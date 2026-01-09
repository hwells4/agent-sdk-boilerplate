import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import {
  SandboxStatus,
  validateTransition,
  getTransitionError,
} from "./lib/stateMachine";
import { getUserMembership, getSandboxRunAccess } from "./lib/authorization";
import { sandboxStatusValidator } from "./lib/validators";

// ============================================================================
// Internal Helper Functions (not exported)
// ============================================================================

/**
 * Update args type for sandbox runs
 */
type SandboxRunUpdateArgs = {
  sandboxId?: string;
  status?: "booting" | "running" | "succeeded" | "failed" | "canceled";
  finishedAt?: number;
  lastActivityAt?: number;
  e2bCost?: number;
  error?: { message: string; code?: string; details?: string };
};

/**
 * Shared helper to perform sandbox run updates
 * Handles: fetching run, validating transition, building update object, patching DB
 * @param ctx - The mutation context
 * @param sandboxRunId - The ID of the sandbox run to update
 * @param sandboxRun - The current sandbox run document
 * @param args - The update arguments
 */
async function performSandboxRunUpdate(
  ctx: MutationCtx,
  sandboxRunId: Id<"sandboxRuns">,
  sandboxRun: Doc<"sandboxRuns">,
  args: SandboxRunUpdateArgs
): Promise<void> {
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

  // Build update object with only provided fields using Object.fromEntries
  const updates = Object.fromEntries(
    Object.entries({
      sandboxId: args.sandboxId,
      status: args.status,
      finishedAt: args.finishedAt,
      lastActivityAt: args.lastActivityAt,
      e2bCost: args.e2bCost,
      error: args.error,
    }).filter(([_, value]) => value !== undefined)
  );

  await ctx.db.patch(sandboxRunId, updates);
}

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
    status: sandboxStatusValidator,
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
    status: v.optional(sandboxStatusValidator),
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
    // Authorization check using shared helper
    const access = await getSandboxRunAccess(ctx, args.sandboxRunId);
    if (access === null) {
      throw new Error("Unauthorized: sandbox run not found or access denied");
    }

    // Use shared helper for update logic
    await performSandboxRunUpdate(ctx, args.sandboxRunId, access.sandboxRun, {
      sandboxId: args.sandboxId,
      status: args.status,
      finishedAt: args.finishedAt,
      lastActivityAt: args.lastActivityAt,
      e2bCost: args.e2bCost,
      error: args.error,
    });
  },
});

/**
 * Get a sandbox run by ID
 * @param sandboxRunId - The ID of the sandbox run
 * @returns The sandbox run or null if not found or access denied
 */
export const get = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns"> | null> => {
    const access = await getSandboxRunAccess(ctx, args.sandboxRunId);
    if (access === null) {
      return null;
    }
    return access.sandboxRun;
  },
});

/**
 * Pagination result type for sandbox runs
 */
type PaginatedSandboxRuns = {
  items: Doc<"sandboxRuns">[];
  cursor: string | null;
};

/**
 * List sandbox runs for a workspace with pagination
 * @param workspaceId - The workspace ID
 * @param cursor - Optional cursor to continue from (document ID from previous page)
 * @param limit - Optional limit (default 50)
 * @returns Paginated result with items and cursor for next page
 */
export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PaginatedSandboxRuns> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return { items: [], cursor: null };
    }

    const limit = args.limit ?? 50;

    // Build query with descending order for consistent pagination
    const query = ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc");

    // Collect all results to enable cursor-based filtering
    // For large datasets, consider adding a composite index with _creationTime
    const allResults = await query.collect();

    // If we have a cursor, find its position and start after it
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = allResults.findIndex((r) => r._id === args.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    // Take limit + 1 to detect if there are more items
    const slice = allResults.slice(startIndex, startIndex + limit + 1);

    // Determine if there are more items
    const hasMore = slice.length > limit;
    const items = hasMore ? slice.slice(0, limit) : slice;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id : null;

    return {
      items,
      cursor: nextCursor,
    };
  },
});

/**
 * List all sandbox runs for a thread
 * @param threadId - The thread ID
 * @returns Array of sandbox runs the user has access to
 */
export const listByThread = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns">[]> => {
    // Check user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return [];
    }

    // Get all sandbox runs for this thread
    const runs = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    // Get user's workspace memberships to filter accessible runs
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const memberWorkspaceIds = new Set(memberships.map((m) => m.workspaceId.toString()));

    // Filter runs to only those in workspaces the user belongs to
    return runs.filter((run) => memberWorkspaceIds.has(run.workspaceId.toString()));
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
    status: v.optional(sandboxStatusValidator),
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

    // Use shared helper for update logic
    await performSandboxRunUpdate(ctx, args.sandboxRunId, sandboxRun, {
      sandboxId: args.sandboxId,
      status: args.status,
      finishedAt: args.finishedAt,
      lastActivityAt: args.lastActivityAt,
      e2bCost: args.e2bCost,
      error: args.error,
    });
  },
});

/**
 * Internal query to find idle running sandboxes (for use by cron job)
 * Returns sandboxes where:
 * - status is 'running'
 * - sandboxId exists (sandbox was actually created)
 * - (now - lastActivityAt) > maxIdleMs
 *
 * @param maxIdleMs - Maximum idle time in milliseconds
 * @returns Array of idle sandbox runs
 */
export const internalFindIdle = internalQuery({
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

/**
 * Internal query to find sandboxes stuck in booting state (for use by cron job)
 * Returns sandboxes where:
 * - status is 'booting'
 * - startedAt < (now - maxBootMs)
 *
 * @param maxBootMs - Maximum boot time in milliseconds
 * @returns Array of stuck booting sandbox runs
 */
export const internalFindStuckBooting = internalQuery({
  args: {
    maxBootMs: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns">[]> => {
    const now = Date.now();
    const cutoffTime = now - args.maxBootMs;

    // Get all booting sandboxes
    const bootingSandboxes = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_status", (q) => q.eq("status", "booting"))
      .collect();

    // Filter to sandboxes that have been booting too long
    return bootingSandboxes.filter((run) => {
      return run.startedAt < cutoffTime;
    });
  },
});
