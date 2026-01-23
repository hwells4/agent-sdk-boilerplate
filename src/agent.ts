/**
 * TypeScript library for orchestrating Python-based Claude agents in E2B sandboxes.
 *
 * This demonstrates the hybrid approach:
 * - TypeScript orchestrates sandbox creation and management
 * - Python runs inside the sandbox with Claude Agent SDK
 * - Best of both worlds: TypeScript integration + mature Python SDK
 *
 * ## Sandbox Management Architecture
 *
 * This SDK operates in "Ephemeral Mode" - sandboxes are created directly via
 * the E2B SDK and cleaned up immediately after execution. There is no external
 * state tracking or database persistence.
 *
 * A separate "Managed Mode" exists via the Convex backend (convex/actions/startSandboxRun.ts)
 * which provides full lifecycle tracking, database persistence, and cron-based cleanup.
 *
 * These two modes are currently independent:
 * - Ephemeral Mode (this file): Direct E2B SDK, cleanup in finally blocks, no Convex
 * - Managed Mode (Convex): Database-tracked, state machine, cron cleanup
 *
 * Sandboxes created via functions in this file are invisible to the Convex cleanup cron.
 * This is intentional - Ephemeral Mode is designed for simple scripts and CLI tools
 * where database overhead is unnecessary.
 *
 * See CLAUDE.md "Sandbox Management Modes" for guidance on which mode to use.
 */

import { Sandbox } from '@e2b/code-interpreter'
import { createConsoleStreamHandler, createLineBufferedHandler, StreamCallbacks, StreamEvent, parseStreamEvent } from './streaming'
import { traceAgentExecution, exportTraceContext, shouldSampleTrace } from './observability'
import { calculateCost, formatCost, parseTokenUsage, type TokenUsage } from './cost-tracking'
import { createAgentError, formatAgentError, categorizeError } from './error-tracking'
import { generatePythonAgentCode } from './python-templates'
import { DEFAULT_MODEL, E2B_DEFAULTS } from './constants'

/**
 * Options for sandbox lifecycle management.
 */
interface SandboxOptions {
  /** Timeout in seconds for sandbox operations */
  timeout?: number
  /** Metadata to attach to the sandbox */
  metadata?: Record<string, string>
  /** Whether to log verbose output */
  verbose?: boolean
}

/**
 * Sandbox lifecycle helper that handles creation, environment setup, and cleanup.
 *
 * This centralizes the common pattern of:
 * 1. Creating a sandbox from the E2B template
 * 2. Logging verbose output
 * 3. Ensuring cleanup in a finally block
 *
 * @param options - Sandbox configuration options
 * @param fn - Async function to execute with the sandbox
 * @returns The result of the function execution
 * @throws Error if sandbox creation fails or if the function throws
 *
 * @example
 * ```typescript
 * const result = await withSandbox(
 *   { timeout: 120, verbose: true },
 *   async (sandbox) => {
 *     const execution = await sandbox.commands.run('echo hello')
 *     return execution.stdout
 *   }
 * )
 * ```
 */
async function withSandbox<T>(
  options: SandboxOptions,
  fn: (sandbox: Sandbox) => Promise<T>
): Promise<T> {
  const { timeout = 120, metadata, verbose = false } = options
  const templateId = process.env.E2B_TEMPLATE_ID

  if (!templateId) {
    throw new Error('E2B_TEMPLATE_ID not set. Run: ./setup.sh')
  }

  if (verbose) {
    console.log(`Starting sandbox (template: ${templateId})...`)
  }

  const sandbox = await Sandbox.create(templateId, {
    timeoutMs: timeout * 1000,
    metadata,
  })

  try {
    if (verbose) {
      console.log('Sandbox started.')
    }
    return await fn(sandbox)
  } finally {
    await sandbox.kill()
    if (verbose) {
      console.log('Sandbox terminated')
    }
  }
}

export interface AgentConfig {
  prompt: string
  timeout?: number
  verbose?: boolean
  observability?: {
    sample?: number  // Sample rate (0.0-1.0), overrides BRAINTRUST_SAMPLE_RATE env var
  }
}

export interface StreamingAgentConfig extends AgentConfig {
  onStream?: StreamCallbacks
}

export interface AgentResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Run a Claude agent in an E2B sandbox using Python.
 *
 * The sandbox contains:
 * - Python 3.12+
 * - Claude Agent SDK (Python)
 * - Claude Code CLI
 * - All standard development tools
 *
 * @param config - Agent configuration
 * @returns The agent's output
 */
export async function runPythonAgent(config: AgentConfig): Promise<string> {
  const { prompt, timeout = 120, verbose = false } = config

  // Check sampling (deterministic hash-based)
  const shouldTrace = shouldSampleTrace(prompt, config.observability?.sample)

  // Log when traces are sampled out
  if (!shouldTrace && verbose && process.env.BRAINTRUST_API_KEY) {
    const rate = config.observability?.sample ?? parseFloat(process.env.BRAINTRUST_SAMPLE_RATE || '1.0')
    console.log(`[Observability] Trace sampled out (rate: ${(rate * 100).toFixed(0)}%)`)
  }

  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  if (!oauthToken) {
    const error = createAgentError(
      'unknown',
      'Missing required environment variables',
      { prompt: prompt.substring(0, 100) }
    )
    throw new Error(formatAgentError(error))
  }

  return traceAgentExecution('run_agent', { prompt: prompt.substring(0, 100) }, async (span) => {
    const startTime = Date.now()

    // Export trace context for sandbox (only if we're sampling)
    const traceContext = shouldTrace ? await exportTraceContext(span) : null

    return withSandbox(
      {
        timeout,
        verbose,
        metadata: {
          prompt: prompt.substring(0, 100),
          ...(traceContext?.traceId ? { traceId: traceContext.traceId } : {}),
        },
      },
      async (sandbox) => {
        if (verbose) {
          console.log('Running Python agent...')
        }

        // Generate Python agent code using centralized template generator
        const pythonAgentCode = generatePythonAgentCode(prompt, {
          braintrustEnabled: !!process.env.BRAINTRUST_API_KEY && shouldTrace,
        })

        // Write and execute the Python agent
        await sandbox.files.write('/home/user/agent.py', pythonAgentCode)

        /**
         * SECURITY NOTE: OAuth token is passed to sandbox environment.
         *
         * This is acceptable for development/demo use cases where:
         * - E2B sandbox isolation is trusted
         * - Network egress is not a concern
         *
         * For production deployments, consider:
         * - Implementing a proxy architecture where sandboxes call back to a trusted server
         * - Using short-lived, scoped tokens if available
         * - Configuring E2B egress filtering to only allow Claude API endpoints
         *
         * See todos/008-pending-p2-oauth-token-exposure.md for detailed analysis.
         */
        const envs: Record<string, string> = {
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        }

        // Inject Braintrust context if available and we're sampling
        if (process.env.BRAINTRUST_API_KEY && shouldTrace) {
          envs.BRAINTRUST_API_KEY = process.env.BRAINTRUST_API_KEY
          envs.BRAINTRUST_PROJECT_NAME = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'

          if (traceContext) {
            envs.BRAINTRUST_TRACE_CONTEXT = JSON.stringify(traceContext)
          }
        }

        const execution = await sandbox.commands.run(
          'python3 /home/user/agent.py',
          {
            timeoutMs: timeout * 1000,
            envs,
          }
        )

        const endTime = Date.now()
        const durationSeconds = (endTime - startTime) / 1000

        if (execution.exitCode !== 0) {
          // Categorize and log error with full context
          const errorType = categorizeError(execution.exitCode, execution.stderr)
          const agentError = createAgentError(
            errorType,
            `Agent execution failed with exit code ${execution.exitCode}`,
            {
              prompt: prompt.substring(0, 100),
              executionTime: endTime - startTime,
              stdout: execution.stdout,
              stderr: execution.stderr,
              exitCode: execution.exitCode,
            }
          )

          // Log error to Braintrust span (always log errors, even if sampled out)
          if (span) {
            span.log({
              error: agentError,
              metrics: {
                exitCode: Number(execution.exitCode),
                executionTime: Number(endTime - startTime),
              },
              metadata: {
                sampledOut: !shouldTrace,
              }
            })
          }

          throw new Error(formatAgentError(agentError))
        }

        // Parse JSON output containing result and usage
        let result = ''
        let tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

        try {
          const output = JSON.parse(execution.stdout.trim())
          result = output.result || ''

          if (output.usage) {
            tokenUsage = {
              promptTokens: output.usage.input_tokens || 0,
              completionTokens: output.usage.output_tokens || 0,
              cachedTokens: output.usage.cache_read_input_tokens || 0,
            }
          }
        } catch {
          // Fallback: if JSON parsing fails, treat stdout as plain text result
          result = execution.stdout.trim()
          tokenUsage = parseTokenUsage(execution.stdout)
        }

        const cost = calculateCost(
          DEFAULT_MODEL,
          tokenUsage,
          {
            durationSeconds,
            cpuCount: E2B_DEFAULTS.CPU_COUNT,
          }
        )

        // Log to Braintrust (only if we're sampling)
        if (span && shouldTrace) {
          span.log({
            output: result,
            metrics: {
              exitCode: 0,
              durationMs: Number(endTime - startTime),
              promptTokens: Number(tokenUsage.promptTokens || 0),
              completionTokens: Number(tokenUsage.completionTokens || 0),
              cachedTokens: Number(tokenUsage.cachedTokens || 0),
              totalCost: Number(cost.total),
              claudeCost: Number(cost.claude.totalCost),
              e2bCost: Number(cost.e2b.cost),
              durationSeconds: Number(durationSeconds),
            },
            metadata: {
              costBreakdown: cost,
            }
          })
        }

        // Display cost to user if verbose
        if (verbose && cost.total > 0) {
          console.log('\n' + formatCost(cost))
        }

        if (verbose) {
          console.log('Agent completed successfully')
        }

        return result
      }
    )
  })
}

/**
 * Run a Claude agent and get detailed execution results.
 *
 * Similar to runPythonAgent but returns full execution details
 * including stderr and exit code.
 */
export async function runPythonAgentDetailed(config: AgentConfig): Promise<AgentResult> {
  const { prompt, timeout = 120, verbose = false } = config

  // Check sampling (deterministic hash-based)
  const shouldTrace = shouldSampleTrace(prompt, config.observability?.sample)

  // Log when traces are sampled out
  if (!shouldTrace && verbose && process.env.BRAINTRUST_API_KEY) {
    const rate = config.observability?.sample ?? parseFloat(process.env.BRAINTRUST_SAMPLE_RATE || '1.0')
    console.log(`[Observability] Trace sampled out (rate: ${(rate * 100).toFixed(0)}%)`)
  }

  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  if (!oauthToken) {
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN not set')
  }

  return traceAgentExecution('run_agent_detailed', { prompt: prompt.substring(0, 100) }, async (span) => {
    const startTime = Date.now()

    // Export trace context for sandbox (only if we're sampling)
    const traceContext = shouldTrace ? await exportTraceContext(span) : null

    return withSandbox(
      {
        timeout,
        metadata: traceContext?.traceId ? { traceId: traceContext.traceId } : undefined,
      },
      async (sandbox) => {
        // Generate Python agent code using centralized template generator
        const pythonAgentCode = generatePythonAgentCode(prompt, {
          braintrustEnabled: !!process.env.BRAINTRUST_API_KEY && shouldTrace,
        })

        await sandbox.files.write('/home/user/agent.py', pythonAgentCode)

        /**
         * SECURITY NOTE: OAuth token is passed to sandbox environment.
         * See runPythonAgent for detailed security considerations.
         */
        const envs: Record<string, string> = {
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        }

        // Inject Braintrust context if available and we're sampling
        if (process.env.BRAINTRUST_API_KEY && shouldTrace) {
          envs.BRAINTRUST_API_KEY = process.env.BRAINTRUST_API_KEY
          envs.BRAINTRUST_PROJECT_NAME = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
          if (traceContext) {
            envs.BRAINTRUST_TRACE_CONTEXT = JSON.stringify(traceContext)
          }
        }

        const execution = await sandbox.commands.run(
          'python3 /home/user/agent.py',
          {
            timeoutMs: timeout * 1000,
            envs,
          }
        )

        const endTime = Date.now()

        // Log to Braintrust (always log errors, only log success if sampling)
        const isError = execution.exitCode !== 0
        if (span && (shouldTrace || isError)) {
          span.log({
            metrics: {
              exitCode: Number(execution.exitCode),
              durationMs: Number(endTime - startTime),
            },
            metadata: {
              sampledOut: !shouldTrace && isError,
            }
          })
        }

        return {
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
        }
      }
    )
  })
}

/**
 * Run a Claude agent with real-time streaming output.
 *
 * This function:
 * - Creates an E2B sandbox
 * - Runs Python agent code that emits JSON events
 * - Streams events in real-time with colored console output
 * - Optionally traces events to Braintrust (batch upload at completion)
 * - Returns the final result
 *
 * Event types streamed:
 * - tool_use (yellow) - Tool executions like Bash, Read, Write
 * - text (white) - Agent text responses
 * - thinking (magenta) - Extended thinking process
 * - tool_result (blue) - Tool outputs
 * - error (red) - Errors
 * - result (green) - Final result with cost and duration
 *
 * @param config - Streaming agent configuration
 * @returns The agent's final result
 */
export async function runPythonAgentStreaming(
  config: StreamingAgentConfig
): Promise<string> {
  const { prompt, timeout = 120, verbose = false, onStream } = config

  // Check sampling (deterministic hash-based)
  const shouldTrace = shouldSampleTrace(prompt, config.observability?.sample)

  // Log when traces are sampled out
  if (!shouldTrace && verbose && process.env.BRAINTRUST_API_KEY) {
    const rate = config.observability?.sample ?? parseFloat(process.env.BRAINTRUST_SAMPLE_RATE || '1.0')
    console.log(`[Observability] Trace sampled out (rate: ${(rate * 100).toFixed(0)}%)`)
  }

  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  if (!oauthToken) {
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN not set. Run: ./setup.sh')
  }

  return traceAgentExecution('run_agent_streaming', { prompt: prompt.substring(0, 100) }, async (span) => {
    const startTime = Date.now()

    // Export trace context for sandbox (only if we're sampling)
    const traceContext = shouldTrace ? await exportTraceContext(span) : null

    return withSandbox(
      {
        timeout,
        verbose,
        metadata: {
          prompt: prompt.substring(0, 100),
          ...(traceContext?.traceId ? { traceId: traceContext.traceId } : {}),
        },
      },
      async (sandbox) => {
        if (verbose) {
          console.log('Running Python agent with streaming...\n')
        }

        // Store events for batch upload with capped buffer to prevent unbounded memory growth
        const MAX_EVENTS_BUFFER = 100
        const events: StreamEvent[] = []

        // Generate Python streaming agent code using centralized template generator
        const pythonStreamingCode = generatePythonAgentCode(prompt, { streaming: true })

        await sandbox.files.write('/home/user/streaming_agent.py', pythonStreamingCode)

        let finalResult = ''
        let tokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

        // Create console handler once, outside the callback to avoid repeated allocations
        const consoleHandler = createConsoleStreamHandler({
          ...onStream,
          onResult: (result, durationMs, cost) => {
            finalResult = result
            if (onStream?.onResult) {
              onStream.onResult(result, durationMs, cost)
            }
          },
        })

        // Create line-buffered stream handler
        const streamHandler = createLineBufferedHandler((line) => {
          const event = parseStreamEvent(line)
          if (!event) {
            // Non-event output, print as-is
            process.stdout.write(line + '\n')
            return
          }

          // Cap events buffer to prevent unbounded memory growth
          if (events.length >= MAX_EVENTS_BUFFER) {
            // Remove oldest half of events when at capacity
            events.splice(0, Math.floor(MAX_EVENTS_BUFFER / 2))
          }
          events.push(event)

          // Handle the event with console output (reuse same handler instance)
          consoleHandler(line)
        })

        /**
         * SECURITY NOTE: OAuth token is passed to sandbox environment.
         * See runPythonAgent for detailed security considerations.
         */
        const envs: Record<string, string> = {
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        }

        // Inject Braintrust context if available and we're sampling
        if (process.env.BRAINTRUST_API_KEY && shouldTrace) {
          envs.BRAINTRUST_API_KEY = process.env.BRAINTRUST_API_KEY
          envs.BRAINTRUST_PROJECT_NAME = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
          if (traceContext) {
            envs.BRAINTRUST_TRACE_CONTEXT = JSON.stringify(traceContext)
          }
        }

        await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
          timeoutMs: timeout * 1000,
          envs,
          onStdout: streamHandler,
          onStderr: (data) => {
            console.error(`[STDERR] ${data}`)
            if (span) {
              span.log({ stderr: data })
            }
          },
        })

        const endTime = Date.now()
        const durationSeconds = (endTime - startTime) / 1000

        // Extract token usage from result event
        const resultEvent = events.find(e => e.type === 'result')
        if (resultEvent?.data?.usage) {
          tokenUsage = {
            promptTokens: resultEvent.data.usage.input_tokens || 0,
            completionTokens: resultEvent.data.usage.output_tokens || 0,
            cachedTokens: resultEvent.data.usage.cache_read_input_tokens || 0,
          }
        }

        // Calculate cost
        const cost = calculateCost(
          DEFAULT_MODEL,
          tokenUsage,
          {
            durationSeconds,
            cpuCount: E2B_DEFAULTS.CPU_COUNT,
          }
        )

        // Batch upload events to Braintrust (if we're sampling)
        if (span && shouldTrace) {
          for (const event of events) {
            switch (event.type) {
              case 'tool_use':
                span.log({
                  event: 'tool_use',
                  data: {
                    id: event.data.id,
                    name: event.data.name,
                    input: event.data.input,
                  }
                })
                break
              case 'tool_result':
                span.log({
                  event: 'tool_result',
                  data: {
                    tool_use_id: event.data.tool_use_id,
                    content: event.data.content?.substring(0, 500),
                    is_error: event.data.is_error,
                  }
                })
                break
              case 'thinking':
                span.log({
                  event: 'thinking',
                  data: { thinking: event.data.thinking.substring(0, 500) }
                })
                break
              case 'error':
                span.log({
                  event: 'error',
                  data: { error: event.data.error, message: event.data.message }
                })
                break
            }
          }

          // Log final metrics
          span.log({
            output: finalResult,
            metrics: {
              eventCount: Number(events.length),
              durationMs: Number(endTime - startTime),
              promptTokens: Number(tokenUsage.promptTokens || 0),
              completionTokens: Number(tokenUsage.completionTokens || 0),
              cachedTokens: Number(tokenUsage.cachedTokens || 0),
              totalCost: Number(cost.total),
              claudeCost: Number(cost.claude.totalCost),
              e2bCost: Number(cost.e2b.cost),
              durationSeconds: Number(durationSeconds),
            },
            metadata: {
              costBreakdown: cost,
            }
          })
        }

        // Display cost to user if verbose
        if (verbose && cost.total > 0) {
          console.log('\n' + formatCost(cost))
        }

        if (verbose) {
          console.log('Agent completed successfully')
        }

        return finalResult
      }
    )
  })
}
