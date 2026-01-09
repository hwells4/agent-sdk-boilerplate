import { v } from "convex/values";
import { paginationOptsValidator, PaginationResult } from "convex/server";
import { mutation, query, internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import {
  SandboxStatus,
  VALID_TRANSITIONS,
  validateTransition,
  getTransitionError,
} from "./lib/stateMachine";
import { getUserMembership, getSandboxRunAccess } from "./lib/authorization";
import {
  sandboxStatusValidator,
  validateThreadId,
  validateError,
} from "./lib/validators";
import { emptyPaginationResult } from "./lib/pagination";

// ============================================================================
// Internal Helper Functions (not exported)
// ============================================================================

/**
 * Update args type for sandbox runs
 */
type SandboxRunUpdateArgs = {
  sandboxId?: string;
  status?: SandboxStatus;
  finishedAt?: number;
  lastActivityAt?: number;
  e2bCost?: number;
  error?: { message: string; code?: string; details?: string };
};

/**
 * Result of a sandbox run update operation
 */
type UpdateResult = {
  updated: boolean;
  skipped: boolean;
  reason?: string;
};

/**
 * Shared helper to perform sandbox run updates
 * Handles: re-fetching current state, validating transition, building update object, patching DB
 *
 * IMPORTANT: Re-fetches the current document state to prevent race conditions.
 * Between the initial authorization check and the actual update, another concurrent
 * update could change the status. By re-fetching, we validate against the actual
 * current database state.
 *
 * @param ctx - The mutation context
 * @param sandboxRunId - The ID of the sandbox run to update
 * @param args - The update arguments
 * @param options - Optional behavior configuration
 * @param options.skipTerminalStates - If true, silently skip updates when sandbox is already in terminal state
 * @returns UpdateResult indicating whether the update was applied
 */
async function performSandboxRunUpdate(
  ctx: MutationCtx,
  sandboxRunId: Id<"sandboxRuns">,
  args: SandboxRunUpdateArgs,
  options: { skipTerminalStates?: boolean } = {}
): Promise<UpdateResult> {
  // Re-fetch current state to prevent race conditions
  // Between initial fetch and now, another update could have changed the status
  const currentRun = await ctx.db.get(sandboxRunId);
  if (currentRun === null) {
    throw new Error("Sandbox run not found");
  }

  // Validate status transition if status is being changed
  if (args.status !== undefined && args.status !== currentRun.status) {
    const isValid = validateTransition(currentRun.status, args.status);
    if (!isValid) {
      // Check if we should silently skip for terminal states
      const isTerminal = VALID_TRANSITIONS[currentRun.status].length === 0;
      if (options.skipTerminalStates && isTerminal) {
        return {
          updated: false,
          skipped: true,
          reason: `Sandbox already in terminal state '${currentRun.status}'`,
        };
      }
      throw new Error(getTransitionError(currentRun.status, args.status));
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
  return { updated: true, skipped: false };
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

    // Validate input lengths first (fail fast before DB queries)
    validateThreadId(args.threadId);

    // Verify workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check membership using shared helper with by_workspace_user composite index for O(1) lookup
    const membership = await getUserMembership(ctx, args.workspaceId);
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
    // Validate input lengths first (fail fast before DB queries)
    if (args.error !== undefined) {
      validateError(args.error);
    }

    // Authorization check using shared helper
    // Note: performSandboxRunUpdate will re-fetch the document to prevent race conditions
    const access = await getSandboxRunAccess(ctx, args.sandboxRunId);
    if (access === null) {
      throw new Error("Unauthorized: sandbox run not found or access denied");
    }

    // Use shared helper for update logic (re-fetches current state internally)
    await performSandboxRunUpdate(ctx, args.sandboxRunId, {
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
 * List sandbox runs for a workspace with pagination
 * Uses Convex's built-in .paginate() for O(page_size) memory usage
 * @param workspaceId - The workspace ID
 * @param paginationOpts - Pagination options (numItems, cursor)
 * @returns PaginationResult with page, continueCursor, and isDone
 */
export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<Doc<"sandboxRuns">>> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return emptyPaginationResult<Doc<"sandboxRuns">>();
    }

    // Use built-in pagination - only loads requested page size
    return await ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(args.paginationOpts);
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

    // Get all sandbox runs for this thread and user's workspace memberships in parallel
    const [runs, memberships] = await Promise.all([
      ctx.db
        .query("sandboxRuns")
        .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
        .collect(),
      ctx.db
        .query("workspaceMembers")
        .withIndex("by_user", (q) => q.eq("userId", identity.subject))
        .collect(),
    ]);

    const memberWorkspaceIds = new Set(memberships.map((m) => m.workspaceId.toString()));

    // Filter runs to only those in workspaces the user belongs to
    return runs.filter((run) => memberWorkspaceIds.has(run.workspaceId.toString()));
  },
});

// ============================================================================
// Internal mutations (for use by actions)
// ============================================================================

/**
 * Internal mutation - SECURITY CONTRACT:
 * Caller MUST verify user has workspace membership before calling.
 * Authorization is NOT checked within this function.
 * @internal Only use from actions that have validated auth via internalGetMembership
 *
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
    // Validate input lengths first (fail fast before DB queries)
    validateThreadId(args.threadId);

    // Validate workspace exists (FK check)
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error(`Workspace not found: ${args.workspaceId}`);
    }

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
 * Internal mutation - SECURITY CONTRACT:
 * Caller MUST verify user has workspace membership before calling.
 * Authorization is NOT checked within this function.
 * @internal Only use from actions that have validated auth via internalGetMembership
 *
 * @param sandboxRunId - The ID of the sandbox run to update
 * @param sandboxId - Optional E2B sandbox ID
 * @param status - Optional new status (will be validated)
 * @param finishedAt - Optional finished timestamp
 * @param lastActivityAt - Optional last activity timestamp
 * @param e2bCost - Optional E2B cost in dollars
 * @param error - Optional error object
 * @param skipTerminalStates - If true, silently skip when sandbox already in terminal state (for cron job)
 * @returns Object with updated/skipped flags and optional reason
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
    skipTerminalStates: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ updated: boolean; skipped: boolean; reason?: string }> => {
    // Validate input lengths first (fail fast before DB queries)
    if (args.error !== undefined) {
      validateError(args.error);
    }

    // Use shared helper for update logic (handles existence check and re-fetches current state)
    return await performSandboxRunUpdate(
      ctx,
      args.sandboxRunId,
      {
        sandboxId: args.sandboxId,
        status: args.status,
        finishedAt: args.finishedAt,
        lastActivityAt: args.lastActivityAt,
        e2bCost: args.e2bCost,
        error: args.error,
      },
      { skipTerminalStates: args.skipTerminalStates ?? false }
    );
  },
});

/**
 * Internal query to find idle running sandboxes (for use by cron job)
 * Returns sandboxes where:
 * - status is 'running'
 * - sandboxId exists (sandbox was actually created)
 * - (now - lastActivityAt) > maxIdleMs
 *
 * Uses by_status_activity composite index to filter at index level:
 * - First field: status = "running"
 * - Second field: lastActivityAt < cutoffTime (using .lt() range query)
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

    // Use composite index to filter at index level instead of in memory
    // by_status_activity: ["status", "lastActivityAt"]
    // - eq("status", "running") filters to running sandboxes
    // - lt("lastActivityAt", cutoffTime) filters to those idle too long
    const idleSandboxes = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_status_activity", (q) =>
        q.eq("status", "running").lt("lastActivityAt", cutoffTime)
      )
      .collect();

    // Only filter to sandboxes with a valid sandboxId (sandbox was actually created)
    // This is the only in-memory filter needed now
    return idleSandboxes.filter((run) => run.sandboxId !== undefined);
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

    // Use composite index to efficiently find stuck booting sandboxes
    // (mirrors pattern used in internalFindIdle with by_status_activity)
    return await ctx.db
      .query("sandboxRuns")
      .withIndex("by_status_startedAt", (q) =>
        q.eq("status", "booting").lt("startedAt", cutoffTime)
      )
      .collect();
  },
});

/**
 * Internal query to get a sandbox run by ID (for use by actions)
 * @param sandboxRunId - The ID of the sandbox run
 * @returns The sandbox run or null if not found
 */
export const internalGet = internalQuery({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns"> | null> => {
    return await ctx.db.get(args.sandboxRunId);
  },
});

/**
 * Internal query to count recent sandbox runs by user for rate limiting
 * Counts runs started within the given time window by a specific user
 *
 * @param userId - The user ID to count runs for
 * @param sinceMs - Time window in milliseconds (e.g., 60000 for last minute)
 * @returns Count of sandbox runs started by user within the time window
 */
export const internalCountRecentByUser = internalQuery({
  args: {
    userId: v.string(),
    sinceMs: v.number(),
  },
  handler: async (ctx, args): Promise<number> => {
    const cutoff = Date.now() - args.sinceMs;
    const recentRuns = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    return recentRuns.filter(r => r.createdBy === args.userId && r.startedAt > cutoff).length;
  },
});
