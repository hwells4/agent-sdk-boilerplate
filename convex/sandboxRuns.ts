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
import { RATE_LIMIT_MAX_RUNS_PER_MINUTE } from "./lib/constants";

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
  error?: { message: string; code?: string; details?: string };
  // Cost tracking fields
  cost?: { claudeCost: number; e2bCost: number; totalCost: number };
  tokenUsage?: { inputTokens: number; outputTokens: number; cachedTokens?: number };
  durationMs?: number;
  braintrustTraceId?: string;
  result?: string;
  prompt?: string;
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
      error: args.error,
      // Cost tracking fields
      cost: args.cost,
      tokenUsage: args.tokenUsage,
      durationMs: args.durationMs,
      braintrustTraceId: args.braintrustTraceId,
      result: args.result,
      prompt: args.prompt,
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
 * @param error - Optional error object
 */
export const update = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    sandboxId: v.optional(v.string()),
    status: v.optional(sandboxStatusValidator),
    finishedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
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
 * Uses by_thread_workspace composite index for efficient queries that scale
 * with the user's workspace count, not total runs for the thread.
 *
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

    // Get user's workspace memberships
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const memberWorkspaceIds = memberships.map((m) => m.workspaceId);

    // Query per workspace using composite index (parallel)
    // This scales with user's workspace count, not total runs for thread
    const runsByWorkspace = await Promise.all(
      memberWorkspaceIds.map((workspaceId) =>
        ctx.db
          .query("sandboxRuns")
          .withIndex("by_thread_workspace", (q) =>
            q.eq("threadId", args.threadId).eq("workspaceId", workspaceId)
          )
          .collect()
      )
    );

    return runsByWorkspace.flat();
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
    prompt: v.optional(v.string()),
    braintrustTraceId: v.optional(v.string()),
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
      prompt: args.prompt,
      braintrustTraceId: args.braintrustTraceId,
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
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
        details: v.optional(v.string()),
      })
    ),
    // Cost tracking fields
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
    braintrustTraceId: v.optional(v.string()),
    result: v.optional(v.string()),
    prompt: v.optional(v.string()),
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
        error: args.error,
        cost: args.cost,
        tokenUsage: args.tokenUsage,
        durationMs: args.durationMs,
        braintrustTraceId: args.braintrustTraceId,
        result: args.result,
        prompt: args.prompt,
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
 * Counts ALL runs started within the given time window by a specific user
 * (includes booting, running, succeeded, failed, canceled)
 *
 * Uses composite index by_createdBy_startedAt for efficient O(k) queries
 * where k = number of matching runs, instead of O(n) where n = all runs.
 *
 * Performance: Uses .take(RATE_LIMIT + 1) instead of .collect() to ensure
 * constant memory usage O(1) regardless of how many runs a power user has.
 * For rate limiting, we only need to know if count >= limit, not the exact count.
 *
 * @param userId - The user ID to count runs for
 * @param sinceMs - Time window in milliseconds (e.g., 60000 for last minute)
 * @returns Count of sandbox runs started by user within the time window (capped at RATE_LIMIT + 1)
 */
export const internalCountRecentByUser = internalQuery({
  args: {
    userId: v.string(),
    sinceMs: v.number(),
  },
  handler: async (ctx, args): Promise<number> => {
    const cutoff = Date.now() - args.sinceMs;

    // Use composite index to efficiently query by user and filter by time
    // by_createdBy_startedAt: ["createdBy", "startedAt"]
    // - eq("createdBy", userId) filters to this user's runs
    // - gt("startedAt", cutoff) filters to recent runs only
    //
    // Use .take(limit + 1) instead of .collect() for constant memory usage.
    // For rate limiting we only need to know if count >= limit, not exact count.
    const recentRuns = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_createdBy_startedAt", (q) =>
        q.eq("createdBy", args.userId).gt("startedAt", cutoff)
      )
      .take(RATE_LIMIT_MAX_RUNS_PER_MINUTE + 1);

    return recentRuns.length;
  },
});

// ============================================================================
// Analytics Queries
// ============================================================================

/**
 * Find a sandbox run by its Braintrust trace ID.
 * Enables correlation between Braintrust traces and Convex execution records.
 *
 * @param traceId - The Braintrust trace ID
 * @returns The sandbox run or null if not found/unauthorized
 */
export const getByTraceId = query({
  args: {
    traceId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"sandboxRuns"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    // Find sandbox run by trace ID using index for O(1) lookup
    const run = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_braintrustTraceId", (q) => q.eq("braintrustTraceId", args.traceId))
      .first();

    if (run === null) {
      return null;
    }

    // Check user has access to the workspace
    const membership = await getUserMembership(ctx, run.workspaceId);
    if (membership === null) {
      return null;
    }

    return run;
  },
});

/**
 * Cost analytics aggregate type
 */
type CostAnalytics = {
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  totalClaudeCost: number;
  totalE2bCost: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  avgDurationMs: number;
  periodStart: number;
  periodEnd: number;
};

/**
 * Get cost analytics for a workspace within a time period.
 * Aggregates cost, token usage, and execution metrics.
 *
 * @param workspaceId - The workspace to get analytics for
 * @param startTime - Start of the time period (timestamp)
 * @param endTime - End of the time period (timestamp)
 * @returns Aggregated cost and execution analytics
 */
export const getCostAnalytics = query({
  args: {
    workspaceId: v.id("workspaces"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args): Promise<CostAnalytics | null> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return null;
    }

    // Query sandbox runs for the workspace within time period
    // Uses composite index for O(k) query where k = runs in time range
    const runs = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace_startedAt", (q) =>
        q.eq("workspaceId", args.workspaceId)
          .gte("startedAt", args.startTime)
          .lte("startedAt", args.endTime)
      )
      .collect();

    // Aggregate metrics
    let totalClaudeCost = 0;
    let totalE2bCost = 0;
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    let totalDurationMs = 0;
    let runsWithDuration = 0;
    let succeededRuns = 0;
    let failedRuns = 0;

    for (const run of runs) {
      if (run.status === "succeeded") succeededRuns++;
      if (run.status === "failed") failedRuns++;

      if (run.cost) {
        totalClaudeCost += run.cost.claudeCost;
        totalE2bCost += run.cost.e2bCost;
        totalCost += run.cost.totalCost;
      }

      if (run.tokenUsage) {
        totalInputTokens += run.tokenUsage.inputTokens;
        totalOutputTokens += run.tokenUsage.outputTokens;
        totalCachedTokens += run.tokenUsage.cachedTokens ?? 0;
      }

      if (run.durationMs !== undefined) {
        totalDurationMs += run.durationMs;
        runsWithDuration++;
      }
    }

    return {
      totalRuns: runs.length,
      succeededRuns,
      failedRuns,
      totalClaudeCost,
      totalE2bCost,
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      totalCachedTokens,
      avgDurationMs: runsWithDuration > 0 ? totalDurationMs / runsWithDuration : 0,
      periodStart: args.startTime,
      periodEnd: args.endTime,
    };
  },
});

/**
 * Execution trends data point
 */
type ExecutionTrend = {
  timestamp: number;
  runs: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number;
  totalCost: number;
};

/**
 * Get execution trends for a workspace over time.
 * Returns daily aggregates for the specified time period.
 *
 * @param workspaceId - The workspace to get trends for
 * @param startTime - Start of the time period (timestamp)
 * @param endTime - End of the time period (timestamp)
 * @param bucketSizeMs - Size of each time bucket in ms (default: 1 day)
 * @returns Array of trend data points
 */
export const getExecutionTrends = query({
  args: {
    workspaceId: v.id("workspaces"),
    startTime: v.number(),
    endTime: v.number(),
    bucketSizeMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ExecutionTrend[]> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return [];
    }

    const bucketSize = args.bucketSizeMs ?? 24 * 60 * 60 * 1000; // Default: 1 day

    // Query sandbox runs for the workspace within time period
    // Uses composite index for O(k) query where k = runs in time range
    const runs = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace_startedAt", (q) =>
        q.eq("workspaceId", args.workspaceId)
          .gte("startedAt", args.startTime)
          .lte("startedAt", args.endTime)
      )
      .collect();

    // Group by time buckets
    const buckets = new Map<number, {
      runs: Doc<"sandboxRuns">[];
    }>();

    for (const run of runs) {
      const bucketStart = Math.floor(run.startedAt / bucketSize) * bucketSize;
      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, { runs: [] });
      }
      buckets.get(bucketStart)!.runs.push(run);
    }

    // Convert buckets to trend data
    const trends: ExecutionTrend[] = [];
    for (const [timestamp, bucket] of buckets) {
      let succeeded = 0;
      let failed = 0;
      let totalDuration = 0;
      let runsWithDuration = 0;
      let totalCost = 0;

      for (const run of bucket.runs) {
        if (run.status === "succeeded") succeeded++;
        if (run.status === "failed") failed++;
        if (run.durationMs !== undefined) {
          totalDuration += run.durationMs;
          runsWithDuration++;
        }
        if (run.cost) {
          totalCost += run.cost.totalCost;
        }
      }

      trends.push({
        timestamp,
        runs: bucket.runs.length,
        succeeded,
        failed,
        avgDurationMs: runsWithDuration > 0 ? totalDuration / runsWithDuration : 0,
        totalCost,
      });
    }

    // Sort by timestamp
    trends.sort((a, b) => a.timestamp - b.timestamp);

    return trends;
  },
});

/**
 * Error breakdown by error code
 */
type ErrorBreakdown = {
  code: string;
  count: number;
  lastOccurrence: number;
  sampleMessage: string;
};

/**
 * Get error analytics for a workspace.
 * Returns breakdown of errors by error code.
 *
 * @param workspaceId - The workspace to get error analytics for
 * @param startTime - Start of the time period (timestamp)
 * @param endTime - End of the time period (timestamp)
 * @returns Array of error breakdowns
 */
export const getErrorAnalytics = query({
  args: {
    workspaceId: v.id("workspaces"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args): Promise<ErrorBreakdown[]> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return [];
    }

    // Query failed sandbox runs
    // Uses composite index for time range, then filters status in memory
    const runs = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace_startedAt", (q) =>
        q.eq("workspaceId", args.workspaceId)
          .gte("startedAt", args.startTime)
          .lte("startedAt", args.endTime)
      )
      .filter((q) => q.eq(q.field("status"), "failed"))
      .collect();

    // Group by error code
    const errorMap = new Map<string, {
      count: number;
      lastOccurrence: number;
      sampleMessage: string;
    }>();

    for (const run of runs) {
      const code = run.error?.code ?? "unknown";
      const existing = errorMap.get(code);

      if (!existing) {
        errorMap.set(code, {
          count: 1,
          lastOccurrence: run.startedAt,
          sampleMessage: run.error?.message ?? "Unknown error",
        });
      } else {
        existing.count++;
        if (run.startedAt > existing.lastOccurrence) {
          existing.lastOccurrence = run.startedAt;
          existing.sampleMessage = run.error?.message ?? "Unknown error";
        }
      }
    }

    // Convert to array
    const breakdowns: ErrorBreakdown[] = [];
    for (const [code, data] of errorMap) {
      breakdowns.push({
        code,
        count: data.count,
        lastOccurrence: data.lastOccurrence,
        sampleMessage: data.sampleMessage,
      });
    }

    // Sort by count descending
    breakdowns.sort((a, b) => b.count - a.count);

    return breakdowns;
  },
});
