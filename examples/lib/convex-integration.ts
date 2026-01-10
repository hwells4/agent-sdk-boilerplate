/**
 * Convex integration module for Claude Agent SDK.
 *
 * Provides typed wrappers for Convex mutations that enable optional
 * persistence of sandbox runs, costs, and artifacts. This module
 * bridges the SDK's ephemeral mode with Convex's managed mode.
 *
 * Usage:
 * ```typescript
 * import { ConvexClient } from 'convex/browser'
 *
 * const convexClient = new ConvexClient(process.env.CONVEX_URL!)
 *
 * const result = await runPythonAgent({
 *   prompt: 'Your task',
 *   convex: {
 *     client: convexClient,
 *     workspaceId: 'workspace-id-here',
 *     threadId: 'optional-thread-id',
 *     persistArtifacts: true,
 *   }
 * })
 * ```
 */

import { STRING_LIMITS, TIMEOUTS } from './constants'
import { CostBreakdown, TokenUsage } from './cost-tracking'

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal Convex client interface.
 * We use a generic interface to avoid importing Convex types directly,
 * allowing users to pass any compatible Convex client.
 */
export interface ConvexClientInterface {
  mutation<T>(mutationReference: unknown, args: Record<string, unknown>): Promise<T>
  query<T>(queryReference: unknown, args: Record<string, unknown>): Promise<T>
}

/**
 * Configuration for Convex integration in SDK functions.
 * Pass this to enable managed mode with full lifecycle tracking.
 */
export interface ConvexConfig {
  /** Convex client instance */
  client: ConvexClientInterface
  /** Workspace ID for multi-tenant isolation */
  workspaceId: string
  /** User ID for authorization (typically from auth provider) */
  userId: string
  /** Optional thread ID for grouping related runs */
  threadId?: string
  /** Whether to capture and persist artifacts from sandbox */
  persistArtifacts?: boolean
}

/**
 * Status of a sandbox run (matches convex/lib/stateMachine.ts)
 */
export type SandboxStatus = 'booting' | 'running' | 'succeeded' | 'failed' | 'canceled'

/**
 * Data for updating a sandbox run
 */
export interface SandboxRunUpdate {
  sandboxId?: string
  status?: SandboxStatus
  finishedAt?: number
  lastActivityAt?: number
  error?: { message: string; code?: string; details?: string }
  cost?: { claudeCost: number; e2bCost: number; totalCost: number }
  tokenUsage?: { inputTokens: number; outputTokens: number; cachedTokens?: number }
  durationMs?: number
  braintrustTraceId?: string
  result?: string
  prompt?: string
}

// ============================================================================
// Convex Mutation References
// ============================================================================

/**
 * Internal mutation references for sandbox runs.
 * These match the exports from convex/sandboxRuns.ts
 *
 * NOTE: In a production setup, these would be imported from the generated
 * Convex API. For now, we use string references that match the function names.
 */
const MUTATIONS = {
  internalCreate: 'sandboxRuns:internalCreate',
  internalUpdate: 'sandboxRuns:internalUpdate',
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique thread ID if not provided.
 */
export function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Truncate a string to fit within Convex storage limits.
 *
 * IMPORTANT: When truncation occurs, a warning is logged to help users understand
 * why their data was cut off. The full data is still used for execution - truncation
 * only affects what's stored in the database for later querying.
 *
 * @param value - String to truncate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Name of the field (for warning message)
 * @returns Truncated string if over limit, original otherwise
 */
export function truncateForStorage(
  value: string,
  maxLength: number,
  fieldName: string = 'value'
): string {
  if (value.length <= maxLength) return value

  console.warn(
    `[convex-integration] ${fieldName} truncated from ${value.length} to ${maxLength} chars for database storage. ` +
    `Full ${fieldName.toLowerCase()} was used for execution, but only a preview is stored in Convex.`
  )
  return value.substring(0, maxLength - 3) + '...'
}

// ============================================================================
// Convex Integration Functions
// ============================================================================

/**
 * Create a new sandbox run record in Convex.
 *
 * This should be called at the start of agent execution when
 * Convex integration is enabled. The record starts in 'booting' state.
 *
 * @param config - Convex configuration
 * @param prompt - The prompt being executed (will be truncated)
 * @param traceId - Optional Braintrust trace ID for observability correlation
 * @returns The ID of the created sandbox run record
 */
export async function createSandboxRunRecord(
  config: ConvexConfig,
  prompt: string,
  traceId?: string
): Promise<string> {
  const threadId = config.threadId || generateThreadId()

  try {
    const sandboxRunId = await config.client.mutation<string>(
      MUTATIONS.internalCreate,
      {
        threadId,
        workspaceId: config.workspaceId,
        createdBy: config.userId,
        prompt: truncateForStorage(prompt, STRING_LIMITS.MAX_PROMPT_LENGTH, 'Prompt'),
        braintrustTraceId: traceId,
        maxDurationMs: TIMEOUTS.MAX_SANDBOX_TIMEOUT,
        idleTimeoutMs: TIMEOUTS.IDLE_CLEANUP_TIMEOUT,
      }
    )
    return sandboxRunId
  } catch (error) {
    // Log error but don't throw - Convex failures shouldn't break agent execution
    console.error('Failed to create Convex sandbox run record:', error)
    throw error
  }
}

/**
 * Update a sandbox run record in Convex.
 *
 * This wraps Convex writes in error handling to ensure agent execution
 * continues even if persistence fails.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run to update
 * @param update - The fields to update
 * @returns Whether the update succeeded
 */
export async function updateSandboxRunStatus(
  config: ConvexConfig,
  sandboxRunId: string,
  update: SandboxRunUpdate
): Promise<boolean> {
  try {
    // Truncate result if provided
    const truncatedUpdate = {
      ...update,
      result: update.result
        ? truncateForStorage(update.result, STRING_LIMITS.MAX_RESULT_LENGTH, 'Result')
        : undefined,
      error: update.error
        ? {
            ...update.error,
            message: truncateForStorage(
              update.error.message,
              STRING_LIMITS.MAX_ERROR_MESSAGE_LENGTH,
              'Error message'
            ),
          }
        : undefined,
    }

    await config.client.mutation(MUTATIONS.internalUpdate, {
      sandboxRunId,
      ...truncatedUpdate,
      skipTerminalStates: true, // Don't fail if already in terminal state
    })
    return true
  } catch (error) {
    // Log error but don't throw - Convex failures shouldn't break agent execution
    console.error('Failed to update Convex sandbox run:', error)
    return false
  }
}

/**
 * Persist cost data to a sandbox run record.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run
 * @param cost - Cost breakdown from calculateCost()
 * @param tokenUsage - Token usage from agent execution
 * @param durationMs - Execution duration in milliseconds
 * @returns Whether the update succeeded
 */
export async function persistCostData(
  config: ConvexConfig,
  sandboxRunId: string,
  cost: CostBreakdown,
  tokenUsage: TokenUsage,
  durationMs: number
): Promise<boolean> {
  return updateSandboxRunStatus(config, sandboxRunId, {
    cost: {
      claudeCost: cost.claude.totalCost,
      e2bCost: cost.e2b.cost,
      totalCost: cost.total,
    },
    tokenUsage: {
      inputTokens: tokenUsage.promptTokens,
      outputTokens: tokenUsage.completionTokens,
      cachedTokens: tokenUsage.cachedTokens,
    },
    durationMs,
  })
}

/**
 * Mark a sandbox run as running with sandbox ID.
 *
 * This should be called immediately after E2B sandbox creation
 * to enable cron cleanup if the process crashes.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run
 * @param sandboxId - The E2B sandbox ID
 * @returns Whether the update succeeded
 */
export async function markSandboxRunning(
  config: ConvexConfig,
  sandboxRunId: string,
  sandboxId: string
): Promise<boolean> {
  return updateSandboxRunStatus(config, sandboxRunId, {
    sandboxId,
    status: 'running',
    lastActivityAt: Date.now(),
  })
}

/**
 * Mark a sandbox run as succeeded with result.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run
 * @param result - The execution result (will be truncated)
 * @returns Whether the update succeeded
 */
export async function markSandboxSucceeded(
  config: ConvexConfig,
  sandboxRunId: string,
  result: string
): Promise<boolean> {
  return updateSandboxRunStatus(config, sandboxRunId, {
    status: 'succeeded',
    result,
    finishedAt: Date.now(),
  })
}

/**
 * Mark a sandbox run as failed with error.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run
 * @param error - Error message
 * @param errorCode - Optional error code for categorization
 * @returns Whether the update succeeded
 */
export async function markSandboxFailed(
  config: ConvexConfig,
  sandboxRunId: string,
  error: string,
  errorCode?: string
): Promise<boolean> {
  return updateSandboxRunStatus(config, sandboxRunId, {
    status: 'failed',
    error: { message: error, code: errorCode },
    finishedAt: Date.now(),
  })
}

/**
 * Update last activity timestamp (for heartbeat).
 *
 * Call this periodically during long-running tasks to prevent
 * cron cleanup from killing active sandboxes.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run
 * @returns Whether the update succeeded
 */
export async function updateLastActivity(
  config: ConvexConfig,
  sandboxRunId: string
): Promise<boolean> {
  return updateSandboxRunStatus(config, sandboxRunId, {
    lastActivityAt: Date.now(),
  })
}

/**
 * Create a throttled heartbeat function.
 *
 * Returns a function that updates lastActivityAt at most once
 * per HEARTBEAT_INTERVAL milliseconds.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The ID of the sandbox run
 * @returns Throttled heartbeat function
 */
export function createHeartbeat(
  config: ConvexConfig,
  sandboxRunId: string
): () => void {
  let lastHeartbeat = 0

  return () => {
    const now = Date.now()
    if (now - lastHeartbeat >= TIMEOUTS.HEARTBEAT_INTERVAL) {
      lastHeartbeat = now
      // Fire and forget - don't await
      updateLastActivity(config, sandboxRunId).catch((error) => {
        console.error('Heartbeat update failed:', error)
      })
    }
  }
}
