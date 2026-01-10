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

import { STRING_LIMITS, TIMEOUTS, ARTIFACT_LIMITS } from './constants'
import { CostBreakdown, TokenUsage } from './cost-tracking'

// ============================================================================
// E2B Sandbox Interface (minimal for artifact capture)
// ============================================================================

/**
 * Minimal interface for E2B sandbox file operations.
 * This avoids importing the full E2B SDK as a dependency of convex-integration.
 */
export interface SandboxFiles {
  list(path: string): Promise<Array<{ name: string; path: string; size?: number }>>
  read(path: string): Promise<Uint8Array | string>
}

export interface SandboxInterface {
  sandboxId: string
  files: SandboxFiles
}

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
  storageGenerateUploadUrl: 'storage:internalGenerateUploadUrl',
  artifactsInternalCreate: 'artifacts:internalCreate',
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

// ============================================================================
// Artifact Capture Functions
// ============================================================================

/**
 * Artifact type based on file extension
 */
export type ArtifactType = 'file' | 'image' | 'code' | 'log' | 'other'

/**
 * Result of capturing artifacts from a sandbox
 */
export interface CapturedArtifact {
  sandboxPath: string
  artifactId: string
  size: number
  contentType: string
  type: ArtifactType
}

/**
 * Options for artifact capture
 */
export interface ArtifactCaptureOptions {
  /** Glob patterns to match files (default: common output patterns) */
  patterns?: string[]
  /** Maximum file size to capture in bytes (default: 10MB) */
  maxFileSize?: number
  /** Maximum number of artifacts to capture (default: 50) */
  maxArtifacts?: number
}

/**
 * Infer artifact type from file extension.
 */
function inferArtifactType(filename: string): ArtifactType {
  const ext = filename.toLowerCase().split('.').pop() || ''

  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return 'image'
  }

  // Code files
  if (['py', 'js', 'ts', 'jsx', 'tsx', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala', 'sh', 'bash', 'zsh', 'sql'].includes(ext)) {
    return 'code'
  }

  // Log files
  if (['log', 'out', 'err'].includes(ext)) {
    return 'log'
  }

  // General files (data, config, docs)
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'md', 'txt', 'html', 'css', 'ini', 'conf', 'cfg'].includes(ext)) {
    return 'file'
  }

  return 'other'
}

/**
 * Infer MIME content type from file extension.
 */
function inferContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''

  const mimeTypes: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    bmp: 'image/bmp',

    // Code/text
    py: 'text/x-python',
    js: 'application/javascript',
    ts: 'application/typescript',
    jsx: 'text/jsx',
    tsx: 'text/tsx',
    rb: 'text/x-ruby',
    go: 'text/x-go',
    rs: 'text/x-rust',
    java: 'text/x-java',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    hpp: 'text/x-c++',
    cs: 'text/x-csharp',
    swift: 'text/x-swift',
    kt: 'text/x-kotlin',
    scala: 'text/x-scala',
    sh: 'application/x-sh',
    bash: 'application/x-sh',
    sql: 'application/sql',

    // Data/config
    json: 'application/json',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    toml: 'application/toml',
    xml: 'application/xml',
    csv: 'text/csv',
    md: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    ini: 'text/plain',
    conf: 'text/plain',
    cfg: 'text/plain',
    log: 'text/plain',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * Generate a human-readable title from a file path.
 */
function generateArtifactTitle(sandboxPath: string): string {
  const filename = sandboxPath.split('/').pop() || sandboxPath
  // Truncate if too long
  if (filename.length > ARTIFACT_LIMITS.MAX_TITLE_LENGTH) {
    return filename.substring(0, ARTIFACT_LIMITS.MAX_TITLE_LENGTH - 3) + '...'
  }
  return filename
}

/**
 * Upload file content to Convex storage.
 *
 * @param config - Convex configuration
 * @param content - File content as Uint8Array or string
 * @param contentType - MIME type of the content
 * @returns Storage ID from Convex
 */
async function uploadToStorage(
  config: ConvexConfig,
  content: Uint8Array | string,
  contentType: string
): Promise<string> {
  // Get upload URL from Convex
  const uploadUrl = await config.client.mutation<string>(
    MUTATIONS.storageGenerateUploadUrl,
    {}
  )

  // Convert content to Blob for upload
  const blob = content instanceof Uint8Array
    ? new Blob([content], { type: contentType })
    : new Blob([content], { type: contentType })

  // Upload to Convex storage
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: blob,
  })

  if (!response.ok) {
    throw new Error(`Failed to upload to storage: ${response.statusText}`)
  }

  const result = await response.json() as { storageId: string }
  return result.storageId
}

/**
 * Create an artifact record in Convex.
 *
 * @param config - Convex configuration
 * @param sandboxRunId - The sandbox run that produced this artifact
 * @param params - Artifact parameters
 * @returns The created artifact ID
 */
async function createArtifactRecord(
  config: ConvexConfig,
  sandboxRunId: string,
  params: {
    threadId: string
    type: ArtifactType
    title: string
    storageId: string
    contentType: string
    size: number
    sandboxPath: string
  }
): Promise<string> {
  return config.client.mutation<string>(
    MUTATIONS.artifactsInternalCreate,
    {
      sandboxRunId,
      workspaceId: config.workspaceId,
      threadId: params.threadId,
      type: params.type,
      title: params.title,
      storageId: params.storageId,
      contentType: params.contentType,
      size: params.size,
      sandboxPath: params.sandboxPath,
    }
  )
}

/**
 * Capture artifacts from a sandbox and persist them to Convex.
 *
 * This function:
 * 1. Lists files in the sandbox matching the specified patterns
 * 2. Downloads each file's content
 * 3. Uploads the content to Convex storage
 * 4. Creates artifact records linking to the sandbox run
 *
 * Files are filtered by:
 * - Pattern matching (default: common output patterns)
 * - Maximum file size (default: 10MB)
 * - Maximum artifact count (default: 50)
 * - Exclusion of SDK-generated files (agent.py, streaming_agent.py)
 *
 * @param config - Convex configuration with persistArtifacts enabled
 * @param sandboxRunId - The ID of the sandbox run record
 * @param sandbox - E2B sandbox interface for file operations
 * @param options - Optional capture configuration
 * @returns Array of captured artifact info
 */
export async function captureArtifacts(
  config: ConvexConfig,
  sandboxRunId: string,
  sandbox: SandboxInterface,
  options: ArtifactCaptureOptions = {}
): Promise<CapturedArtifact[]> {
  const {
    patterns = ['/home/user'],
    maxFileSize = ARTIFACT_LIMITS.MAX_FILE_SIZE,
    maxArtifacts = ARTIFACT_LIMITS.MAX_ARTIFACTS_PER_RUN,
  } = options

  const threadId = config.threadId || generateThreadId()
  const captured: CapturedArtifact[] = []

  // Exclusion list for SDK-generated files
  const excludeFiles = new Set(['agent.py', 'streaming_agent.py'])

  try {
    // List files in the sandbox
    for (const pattern of patterns) {
      if (captured.length >= maxArtifacts) break

      const files = await sandbox.files.list(pattern)

      for (const file of files) {
        if (captured.length >= maxArtifacts) break

        const filename = file.name || file.path.split('/').pop() || ''

        // Skip SDK-generated files
        if (excludeFiles.has(filename)) {
          continue
        }

        // Skip files that are too large (if size is known)
        if (file.size !== undefined && file.size > maxFileSize) {
          console.warn(`[Artifacts] Skipping ${file.path}: exceeds max size (${file.size} > ${maxFileSize})`)
          continue
        }

        try {
          // Download file content
          const content = await sandbox.files.read(file.path)

          // Check size after download if not known before
          const size = content instanceof Uint8Array ? content.length : new TextEncoder().encode(content).length
          if (size > maxFileSize) {
            console.warn(`[Artifacts] Skipping ${file.path}: exceeds max size (${size} > ${maxFileSize})`)
            continue
          }

          const contentType = inferContentType(filename)
          const artifactType = inferArtifactType(filename)
          const title = generateArtifactTitle(file.path)

          // Upload to Convex storage
          const storageId = await uploadToStorage(config, content, contentType)

          // Create artifact record
          const artifactId = await createArtifactRecord(config, sandboxRunId, {
            threadId,
            type: artifactType,
            title,
            storageId,
            contentType,
            size,
            sandboxPath: file.path,
          })

          captured.push({
            sandboxPath: file.path,
            artifactId,
            size,
            contentType,
            type: artifactType,
          })
        } catch (err) {
          // Log error but continue with other files
          console.error(`[Artifacts] Failed to capture ${file.path}:`, err)
        }
      }
    }

    return captured
  } catch (err) {
    // Log error but don't fail the main execution
    console.error('[Artifacts] Failed to capture artifacts:', err)
    return captured
  }
}
