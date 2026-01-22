/**
 * Braintrust observability integration for Claude Agent SDK.
 *
 * Provides automatic tracing, cost tracking, and evaluation capabilities
 * with minimal setup - just add BRAINTRUST_API_KEY to .env and it works.
 */

import { initLogger } from 'braintrust'

type BraintrustLogger = ReturnType<typeof initLogger>

/**
 * Braintrust span interface for tracing.
 * Minimal interface that captures the methods we use.
 */
export interface BraintrustSpan {
  id: string
  span_id?: string
  log(data: Record<string, unknown>): void
  end?(): void
}

let logger: BraintrustLogger | null = null
let initialized = false

/**
 * Initialize Braintrust observability.
 *
 * Called lazily on first access via getBraintrustLogger().
 * Requires BRAINTRUST_API_KEY environment variable.
 *
 * @returns Logger instance or null if disabled
 */
export function initializeBraintrust(): BraintrustLogger | null {
  const apiKey = process.env.BRAINTRUST_API_KEY
  const projectName = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'

  if (!apiKey) {
    console.warn('⚠️  BRAINTRUST_API_KEY not set - observability disabled')
    return null
  }

  try {
    logger = initLogger({
      projectName,
      apiKey,
      // Auto-create project if it doesn't exist
      asyncFlush: true,
    })
    console.log('✅ Braintrust observability enabled')
    return logger
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Failed to initialize Braintrust:', message)
    console.log('   Agent execution will continue without observability')
    return null
  }
}

/**
 * Get the current Braintrust logger instance.
 *
 * Uses lazy initialization - the logger is only initialized on first access.
 * This avoids import-time side effects and allows tests to run without API keys.
 *
 * @returns Logger instance or null if disabled
 */
export function getBraintrustLogger(): BraintrustLogger | null {
  if (!initialized) {
    logger = initializeBraintrust()
    initialized = true
  }
  return logger
}

/**
 * Trace an agent execution with Braintrust.
 *
 * Automatically logs execution metadata, duration, and results.
 * If Braintrust is not initialized, the function executes without tracing.
 *
 * @param name - Name of the trace (e.g., 'run_agent', 'run_agent_streaming')
 * @param metadata - Additional metadata to log (prompt, config, etc.)
 * @param fn - Function to execute within the trace
 * @returns Result of the function
 */
export async function traceAgentExecution<T>(
  name: string,
  metadata: Record<string, unknown>,
  fn: (span: BraintrustSpan | null) => Promise<T>
): Promise<T> {
  const currentLogger = getBraintrustLogger()

  if (!currentLogger) {
    // Graceful degradation: run function without observability
    return fn(null)
  }

  try {
    return await currentLogger.traced(async (span: BraintrustSpan) => {
      span.log({ metadata })
      return fn(span)
    }, { name })
  } catch (error: unknown) {
    // If tracing fails, continue execution
    const message = error instanceof Error ? error.message : String(error)
    console.error('⚠️  Tracing error:', message)
    console.log('   Continuing execution without tracing')
    return fn(null)
  }
}

/**
 * Export trace context for passing to E2B sandbox.
 *
 * This allows Python agents running in the sandbox to continue
 * the same trace, creating a unified view across TypeScript and Python.
 *
 * @param span - Braintrust span
 * @returns Serializable trace context or null
 */
export interface TraceContext {
  traceId: string
  spanId: string | undefined
  projectName: string
}

export async function exportTraceContext(span: BraintrustSpan | null): Promise<TraceContext | null> {
  if (!span) return null

  try {
    // Export span context for propagation to Python
    return {
      traceId: span.id,
      spanId: span.span_id,
      projectName: process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk',
    }
  } catch (error: unknown) {
    console.warn('⚠️  Failed to export trace context:', error)
    return null
  }
}

/**
 * Hash a string to a deterministic integer.
 *
 * Uses a simple hash algorithm to ensure the same input always
 * produces the same hash value.
 *
 * @param str - String to hash
 * @returns Positive integer hash
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

/**
 * Determine whether to sample this trace based on sampling rate.
 *
 * Uses deterministic hash-based sampling so the same prompt always
 * samples the same way, enabling reproducible debugging.
 *
 * @param prompt - The prompt being traced (used for deterministic hashing)
 * @param sampleRate - Sample rate (0.0-1.0), overrides BRAINTRUST_SAMPLE_RATE env var
 * @returns true if this trace should be sampled
 */
export function shouldSampleTrace(prompt: string, sampleRate?: number): boolean {
  const rate = sampleRate ?? parseFloat(process.env.BRAINTRUST_SAMPLE_RATE || '1.0')

  // Always trace if rate >= 100%
  if (rate >= 1.0) return true

  // Never trace if rate <= 0%
  if (rate <= 0.0) return false

  // Deterministic hash-based sampling
  const hash = hashString(prompt)
  return (hash % 100) < (rate * 100)
}

// Flush traces on process exit
process.on('beforeExit', async () => {
  if (logger) {
    try {
      await logger.flush()
      console.log('✅ Braintrust traces flushed successfully')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('❌ Failed to flush traces:', message)
    }
  }
})
