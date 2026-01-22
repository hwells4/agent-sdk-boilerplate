/**
 * Error tracking with full context for Claude Agent SDK.
 *
 * Provides comprehensive error categorization, logging, and
 * trace URL generation for debugging.
 */

import { currentSpan } from 'braintrust'
import { getBraintrustLogger } from './observability'

export interface AgentError {
  type: 'timeout' | 'api_error' | 'tool_error' | 'sandbox_error' | 'unknown'
  message: string
  stack?: string
  context: {
    prompt: string
    sandboxId?: string
    executionTime?: number
    stdout?: string
    stderr?: string
    exitCode?: number
  }
  traceUrl?: string
}

/**
 * Create an agent error with full context and Braintrust logging.
 *
 * @param type - Error type category
 * @param message - Error message
 * @param context - Execution context
 * @param error - Original error (optional)
 * @returns AgentError with trace URL
 */
export function createAgentError(
  type: AgentError['type'],
  message: string,
  context: Partial<AgentError['context']>,
  error?: Error
): AgentError {
  const agentError: AgentError = {
    type,
    message,
    stack: error?.stack,
    context: {
      prompt: context.prompt || '',
      sandboxId: context.sandboxId,
      executionTime: context.executionTime,
      stdout: context.stdout,
      stderr: context.stderr,
      exitCode: context.exitCode,
    }
  }

  // Log to Braintrust
  const logger = getBraintrustLogger()
  if (logger) {
    const span = currentSpan()

    // Log error details
    if (span) {
      span.log({
        error: {
          type,
          message,
          stack: agentError.stack,
        },
        metadata: {
          event: 'error',
          context: agentError.context,
        },
      })

      // Generate trace URL
      const projectName = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
      const traceId = span.rootSpanId || span.id
      agentError.traceUrl = `https://braintrust.dev/app/${projectName}/traces/${traceId}`
    }
  }

  return agentError
}

/**
 * Format an agent error for console output.
 *
 * Includes all relevant debugging information:
 * - Error type and message
 * - Exit code
 * - Execution time
 * - Sandbox stderr
 * - Trace URL for Braintrust
 *
 * @param error - Agent error to format
 * @returns Formatted error string
 */
export function formatAgentError(error: AgentError): string {
  const lines = [
    `❌ Agent Error (${error.type})`,
    `   ${error.message}`,
  ]

  if (error.context.exitCode !== undefined) {
    lines.push(`   Exit code: ${error.context.exitCode}`)
  }

  if (error.context.executionTime) {
    lines.push(`   Execution time: ${error.context.executionTime}ms`)
  }

  if (error.context.sandboxId) {
    lines.push(`   Sandbox ID: ${error.context.sandboxId}`)
  }

  if (error.context.stderr) {
    lines.push(`   ━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`   Sandbox stderr:`)
    const stderrLines = error.context.stderr.split('\n').slice(0, 10) // Limit to 10 lines
    lines.push(...stderrLines.map(line => `   ${line}`))
    if (error.context.stderr.split('\n').length > 10) {
      lines.push(`   ... (truncated)`)
    }
  }

  if (error.stack) {
    lines.push(`   ━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`   Stack trace:`)
    const stackLines = error.stack.split('\n').slice(0, 5) // Limit to 5 lines
    lines.push(...stackLines.map(line => `   ${line}`))
  }

  if (error.traceUrl) {
    lines.push(`   ━━━━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`   📊 View full trace: ${error.traceUrl}`)
  }

  return lines.join('\n')
}

/**
 * Determine error type from exit code and context.
 *
 * @param exitCode - Process exit code
 * @param stderr - Stderr output
 * @returns Error type category
 */
export function categorizeError(exitCode: number, stderr: string): AgentError['type'] {
  // Timeout (common exit code 124 from timeout command)
  if (exitCode === 124) {
    return 'timeout'
  }

  // API errors (check stderr for API-related messages)
  if (stderr.includes('API') || stderr.includes('authentication') || stderr.includes('rate limit')) {
    return 'api_error'
  }

  // Tool errors (check stderr for tool-related messages)
  if (stderr.includes('Tool') || stderr.includes('permission denied') || stderr.includes('command not found')) {
    return 'tool_error'
  }

  // Sandbox errors (check stderr for sandbox-related messages)
  if (stderr.includes('sandbox') || stderr.includes('container')) {
    return 'sandbox_error'
  }

  // Default to unknown
  return 'unknown'
}
