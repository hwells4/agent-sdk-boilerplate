/**
 * Braintrust observability integration for Claude Agent SDK.
 *
 * Provides automatic tracing, cost tracking, and evaluation capabilities
 * with minimal setup - just add BRAINTRUST_API_KEY to .env and it works.
 */

import { initLogger } from 'braintrust'

type BraintrustLogger = ReturnType<typeof initLogger>
type BraintrustSpan = any // The Span type from braintrust

let logger: BraintrustLogger | null = null

/**
 * Initialize Braintrust observability.
 *
 * This is called automatically when the module loads.
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
  } catch (error: any) {
    console.error('❌ Failed to initialize Braintrust:', error.message)
    console.log('   Agent execution will continue without observability')
    return null
  }
}

/**
 * Get the current Braintrust logger instance.
 *
 * @returns Logger instance or null if not initialized
 */
export function getBraintrustLogger(): BraintrustLogger | null {
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
  metadata: Record<string, any>,
  fn: (span: BraintrustSpan | null) => Promise<T>
): Promise<T> {
  if (!logger) {
    // Graceful degradation: run function without observability
    return fn(null)
  }

  try {
    return await logger.traced(async (span: BraintrustSpan) => {
      span.log({ metadata })
      return fn(span)
    }, { name })
  } catch (error: any) {
    // If tracing fails, continue execution
    console.error('⚠️  Tracing error:', error.message)
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
export async function exportTraceContext(span: BraintrustSpan | null): Promise<any> {
  if (!span) return null

  try {
    // Export span context for propagation to Python
    return {
      traceId: span.id,
      spanId: span.span_id,
      projectName: process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk',
    }
  } catch (error) {
    console.warn('⚠️  Failed to export trace context:', error)
    return null
  }
}

// Flush traces on process exit
process.on('beforeExit', async () => {
  if (logger) {
    try {
      await logger.flush()
      console.log('✅ Braintrust traces flushed successfully')
    } catch (error: any) {
      console.error('❌ Failed to flush traces:', error.message)
    }
  }
})

// Initialize on module load
logger = initializeBraintrust()
