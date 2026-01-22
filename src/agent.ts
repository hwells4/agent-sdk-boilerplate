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
  observability?: {
    mode?: 'batch' | 'realtime'  // Default: 'batch'
    sample?: number  // Sample rate (0.0-1.0), overrides BRAINTRUST_SAMPLE_RATE env var
  }
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

  return traceAgentExecution('run_agent', { prompt: prompt.substring(0, 100) }, async (span) => {
    const startTime = Date.now()
    const templateId = process.env.E2B_TEMPLATE_ID
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

    if (!templateId || !oauthToken) {
      const error = createAgentError(
        'unknown',
        'Missing required environment variables',
        { prompt: prompt.substring(0, 100) }
      )
      throw new Error(formatAgentError(error))
    }

    if (verbose) {
      console.log(`Starting sandbox (template: ${templateId})...`)
    }

    // Export trace context for sandbox (only if we're sampling)
    const traceContext = shouldTrace ? await exportTraceContext(span) : null

    // Create sandbox from Python-based template
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create(templateId, {
        timeoutMs: timeout * 1000,
        metadata: {
          prompt: prompt.substring(0, 100), // For debugging
          ...(traceContext?.traceId ? { traceId: traceContext.traceId } : {}),
        },
      })
    } catch (err: unknown) {
      const error = createAgentError(
        'sandbox_error',
        'Failed to create E2B sandbox',
        {
          prompt: prompt.substring(0, 100),
          executionTime: Date.now() - startTime,
        },
        err instanceof Error ? err : new Error(String(err))
      )
      throw new Error(formatAgentError(error))
    }

    try {
      if (verbose) {
        console.log('Sandbox started. Running Python agent...')
      }

      // Generate Python agent code using centralized template generator
      // This eliminates ~95 lines of duplicated Python code
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
              sampledOut: !shouldTrace,  // Indicate this was sampled out but logged due to error
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
      } catch (error) {
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
    } finally {
      await sandbox.kill()
      if (verbose) {
        console.log('Sandbox terminated')
      }
    }
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

  return traceAgentExecution('run_agent_detailed', { prompt: prompt.substring(0, 100) }, async (span) => {
    const startTime = Date.now()
    const templateId = process.env.E2B_TEMPLATE_ID
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

    if (!templateId) {
      throw new Error('E2B_TEMPLATE_ID not set')
    }
    if (!oauthToken) {
      throw new Error('CLAUDE_CODE_OAUTH_TOKEN not set')
    }

    // Export trace context for sandbox (only if we're sampling)
    const traceContext = shouldTrace ? await exportTraceContext(span) : null

    const sandbox = await Sandbox.create(templateId, {
      timeoutMs: timeout * 1000,
      metadata: traceContext?.traceId ? { traceId: traceContext.traceId } : undefined,
    })

    try {
      // Use ClaudeSDKClient with proper options (with Braintrust support)
      const pythonAgentCode = `
import asyncio
import json
import os
import sys

# Braintrust initialization (optional)
braintrust_enabled = False
if os.getenv('BRAINTRUST_API_KEY'):
    try:
        import braintrust
        braintrust.init(
            api_key=os.getenv('BRAINTRUST_API_KEY'),
            project=os.getenv('BRAINTRUST_PROJECT_NAME', 'claude-agent-sdk')
        )
        braintrust_enabled = True
    except Exception as e:
        print(f"Warning: Failed to initialize Braintrust: {e}", file=sys.stderr)

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    ResultMessage
)

async def main():
    result = None
    usage_data = None
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    # Configure agent with proper permissions for autonomous operation
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"],
        permission_mode="bypassPermissions",
        cwd="/home/user",
    )

    if braintrust_enabled:
        with braintrust.start_span(name="agent_execution") as span:
            span.log(input=prompt)
            async with ClaudeSDKClient(options=options) as client:
                await client.query(prompt)
                async for msg in client.receive_response():
                    if isinstance(msg, ResultMessage):
                        result = msg.result
                        if msg.usage:
                            usage_data = {
                                "input_tokens": int(msg.usage.get('input_tokens', 0)),
                                "output_tokens": int(msg.usage.get('output_tokens', 0)),
                                "cache_read_input_tokens": int(msg.usage.get('cache_read_input_tokens', 0))
                            }
            span.log(output=result)
    else:
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for msg in client.receive_response():
                if isinstance(msg, ResultMessage):
                    result = msg.result
                    if msg.usage:
                        usage_data = {
                            "input_tokens": int(msg.usage.get('input_tokens', 0)),
                            "output_tokens": int(msg.usage.get('output_tokens', 0)),
                            "cache_read_input_tokens": int(msg.usage.get('cache_read_input_tokens', 0))
                        }

    # Output result and usage as JSON to stdout for TypeScript parsing
    output = {
        "result": result,
        "usage": usage_data
    }
    print(json.dumps(output))

asyncio.run(main())
`

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
            sampledOut: !shouldTrace && isError,  // Indicate if this was sampled out but logged due to error
          }
        })
      }

      return {
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode: execution.exitCode,
      }
    } finally {
      await sandbox.kill()
    }
  })
}

/**
 * Run a Claude agent with real-time streaming output.
 *
 * This function:
 * - Creates an E2B sandbox
 * - Runs Python agent code that emits JSON events
 * - Streams events in real-time with colored console output
 * - Optionally traces events to Braintrust (batch or real-time mode)
 * - Returns the final result
 *
 * Event types streamed:
 * - 🔧 tool_use (yellow) - Tool executions like Bash, Read, Write
 * - 💬 text (white) - Agent text responses
 * - 🤔 thinking (magenta) - Extended thinking process
 * - 📦 tool_result (blue) - Tool outputs
 * - ❌ error (red) - Errors
 * - ✅ result (green) - Final result with cost and duration
 *
 * Observability modes:
 * - batch (default): Buffer events and upload to Braintrust at completion (efficient)
 * - realtime: Upload events to Braintrust as they occur (debugging)
 *
 * @param config - Streaming agent configuration
 * @returns The agent's final result
 */
export async function runPythonAgentStreaming(
  config: StreamingAgentConfig
): Promise<string> {
  const { prompt, timeout = 120, verbose = false, onStream, observability } = config

  // Check sampling (deterministic hash-based)
  const shouldTrace = shouldSampleTrace(prompt, observability?.sample)

  // Log when traces are sampled out
  if (!shouldTrace && verbose && process.env.BRAINTRUST_API_KEY) {
    const rate = observability?.sample ?? parseFloat(process.env.BRAINTRUST_SAMPLE_RATE || '1.0')
    console.log(`[Observability] Trace sampled out (rate: ${(rate * 100).toFixed(0)}%)`)
  }

  return traceAgentExecution('run_agent_streaming', { prompt: prompt.substring(0, 100) }, async (span) => {
    const startTime = Date.now()
    const templateId = process.env.E2B_TEMPLATE_ID
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

    if (!templateId) {
      throw new Error('E2B_TEMPLATE_ID not set. Run: ./setup.sh')
    }
    if (!oauthToken) {
      throw new Error('CLAUDE_CODE_OAUTH_TOKEN not set. Run: ./setup.sh')
    }

    if (verbose) {
      console.log(`Starting sandbox (template: ${templateId})...`)
    }

    // Export trace context for sandbox (only if we're sampling)
    const traceContext = shouldTrace ? await exportTraceContext(span) : null

    const sandbox = await Sandbox.create(templateId, {
      timeoutMs: timeout * 1000,
      metadata: {
        prompt: prompt.substring(0, 100),
        ...(traceContext?.traceId ? { traceId: traceContext.traceId } : {}),
      },
    })

    try {
      if (verbose) {
        console.log('Sandbox started. Running Python agent with streaming...\n')
      }

      // Store events for batch upload with capped buffer to prevent unbounded memory growth
      const MAX_EVENTS_BUFFER = 100
      const events: StreamEvent[] = []
      const realtimeMode = observability?.mode === 'realtime'

    // Python streaming agent code with ClaudeSDKClient
    const pythonStreamingCode = `
import asyncio
import json
import sys
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage
)

def emit(event_type: str, data: dict):
    """Emit structured JSON event to stdout"""
    event = {"type": event_type, "data": data}
    print(json.dumps(event), flush=True)

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    emit("start", {"prompt": prompt})

    # Configure agent with proper permissions for autonomous operation
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"],
        permission_mode="bypassPermissions",  # Autonomous operation - no permission prompts
        cwd="/home/user",
        include_partial_messages=True,  # Enable streaming of partial messages
    )

    try:
        result = None
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for msg in client.receive_messages():
                # Handle AssistantMessage with content blocks
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            emit("text", {"text": block.text})
                        elif isinstance(block, ThinkingBlock):
                            emit("thinking", {
                                "thinking": block.thinking,
                                "signature": getattr(block, "signature", "")
                            })
                        elif isinstance(block, ToolUseBlock):
                            emit("tool_use", {
                                "id": block.id,
                                "name": block.name,
                                "input": block.input
                            })
                        elif isinstance(block, ToolResultBlock):
                            emit("tool_result", {
                                "tool_use_id": block.tool_use_id,
                                "content": str(block.content) if block.content else "",
                                "is_error": getattr(block, "is_error", False)
                            })

                # Handle ResultMessage
                if isinstance(msg, ResultMessage):
                    result = msg.result
                    # Extract usage metrics if available
                    usage_info = {}
                    if msg.usage:
                        usage_info = {
                            "input_tokens": int(msg.usage.get('input_tokens', 0)),
                            "output_tokens": int(msg.usage.get('output_tokens', 0)),
                            "cache_read_input_tokens": int(msg.usage.get('cache_read_input_tokens', 0))
                        }

                    emit("result", {
                        "result": result,
                        "duration_ms": msg.duration_ms if hasattr(msg, 'duration_ms') else 0,
                        "cost": msg.total_cost_usd if hasattr(msg, 'total_cost_usd') else 0,
                        "num_turns": msg.num_turns if hasattr(msg, 'num_turns') else 0,
                        "usage": usage_info
                    })
                    break  # Exit after receiving result

        emit("complete", {"status": "success", "result": result})

    except Exception as e:
        emit("error", {"error": "exception", "message": str(e)})
        emit("complete", {"status": "error"})
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
`

      await sandbox.files.write('/home/user/streaming_agent.py', pythonStreamingCode)

      let finalResult = ''
      let tokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

      // Helper function to log event to Braintrust span
      const logEventToSpan = (event: StreamEvent) => {
        if (!span || !shouldTrace) return

        switch (event.type) {
          case 'tool_use':
            if (realtimeMode) {
              span.log({
                event: 'tool_use',
                data: {
                  id: event.data.id,
                  name: event.data.name,
                  input: event.data.input,
                }
              })
            }
            break
          case 'tool_result':
            if (realtimeMode) {
              span.log({
                event: 'tool_result',
                data: {
                  tool_use_id: event.data.tool_use_id,
                  content: event.data.content?.substring(0, 500), // Truncate for efficiency
                  is_error: event.data.is_error,
                }
              })
            }
            break
          case 'thinking':
            if (realtimeMode) {
              span.log({
                event: 'thinking',
                data: { thinking: event.data.thinking.substring(0, 500) }
              })
            }
            break
          case 'error':
            // Always log errors in real-time
            span.log({
              event: 'error',
              data: { error: event.data.error, message: event.data.message }
            })
            break
        }
      }

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

        // Log to Braintrust in real-time if enabled
        logEventToSpan(event)

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
        // Extract usage directly from the result event
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

      // Batch upload events to Braintrust (if not in real-time mode and we're sampling)
      if (span && !realtimeMode && shouldTrace) {
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
          }
        }
      }

      // Log final metrics (only if we're sampling)
      if (span && shouldTrace) {
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
            observabilityMode: realtimeMode ? 'realtime' : 'batch',
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
    } finally {
      await sandbox.kill()
      if (verbose) {
        console.log('Sandbox terminated')
      }
    }
  })
}
