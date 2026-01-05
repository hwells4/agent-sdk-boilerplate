/**
 * TypeScript library for orchestrating Python-based Claude agents in E2B sandboxes.
 *
 * This demonstrates the hybrid approach:
 * - TypeScript orchestrates sandbox creation and management
 * - Python runs inside the sandbox with Claude Agent SDK
 * - Best of both worlds: TypeScript integration + mature Python SDK
 */

import { Sandbox } from '@e2b/code-interpreter'
import { createConsoleStreamHandler, createLineBufferedHandler, StreamCallbacks, StreamEvent, parseStreamEvent } from './streaming'
import { traceAgentExecution, exportTraceContext } from './observability'
import { calculateCost, formatCost, parseTokenUsage } from './cost-tracking'
import { createAgentError, formatAgentError, categorizeError } from './error-tracking'

export interface AgentConfig {
  prompt: string
  timeout?: number
  verbose?: boolean
}

export interface StreamingAgentConfig extends AgentConfig {
  onStream?: StreamCallbacks
  observability?: {
    mode?: 'batch' | 'realtime'  // Default: 'batch'
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

    // Export trace context for sandbox
    const traceContext = await exportTraceContext(span)

    // Create sandbox from Python-based template
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.create(templateId, {
        timeoutMs: timeout * 1000,
        metadata: {
          prompt: prompt.substring(0, 100), // For debugging
          traceId: traceContext?.traceId,
        },
      })
    } catch (err: any) {
      const error = createAgentError(
        'sandbox_error',
        'Failed to create E2B sandbox',
        {
          prompt: prompt.substring(0, 100),
          executionTime: Date.now() - startTime,
        },
        err
      )
      throw new Error(formatAgentError(error))
    }

    try {
      if (verbose) {
        console.log('Sandbox started. Running Python agent...')
      }

      // Python agent code with Braintrust integration
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

        # Initialize Braintrust
        braintrust.init(
            api_key=os.getenv('BRAINTRUST_API_KEY'),
            project=os.getenv('BRAINTRUST_PROJECT_NAME', 'claude-agent-sdk')
        )

        # Import trace context from parent (TypeScript)
        trace_context_json = os.getenv('BRAINTRUST_TRACE_CONTEXT')
        if trace_context_json:
            context_data = json.loads(trace_context_json)
            # Note: Context propagation will be enhanced in future iterations

        braintrust_enabled = True
    except Exception as e:
        print(f"Warning: Failed to initialize Braintrust: {e}", file=sys.stderr)

from claude_agent_sdk import query

async def main():
    result = None
    usage_data = None
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    if braintrust_enabled:
        # Wrap agent execution in Braintrust span
        with braintrust.start_span(name="agent_execution") as span:
            span.log(input=prompt)

            async for msg in query(prompt=prompt):
                if hasattr(msg, "result"):
                    result = msg.result
                    # Extract usage metrics if available
                    if hasattr(msg, 'usage') and msg.usage:
                        usage_data = {
                            "input_tokens": int(msg.usage.get('input_tokens', 0)),
                            "output_tokens": int(msg.usage.get('output_tokens', 0)),
                            "cache_read_input_tokens": int(msg.usage.get('cache_read_input_tokens', 0))
                        }
                        span.log(metrics={
                            "promptTokens": int(usage_data['input_tokens']),
                            "completionTokens": int(usage_data['output_tokens']),
                            "cachedTokens": int(usage_data['cache_read_input_tokens']),
                        })

            span.log(output=result)
    else:
        # Run without observability
        async for msg in query(prompt=prompt):
            if hasattr(msg, "result"):
                result = msg.result
                # Extract usage metrics if available
                if hasattr(msg, 'usage') and msg.usage:
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

      // Write and execute the Python agent
      await sandbox.files.write('/home/user/agent.py', pythonAgentCode)

      // Prepare environment variables
      const envs: Record<string, string> = {
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      }

      // Inject Braintrust context if available
      if (process.env.BRAINTRUST_API_KEY) {
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
            sandboxId: sandbox.id,
            executionTime: endTime - startTime,
            stdout: execution.stdout,
            stderr: execution.stderr,
            exitCode: execution.exitCode,
          }
        )

        // Log error to Braintrust span
        if (span) {
          span.log({
            error: agentError,
            metrics: {
              exitCode: Number(execution.exitCode),
              executionTime: Number(endTime - startTime),
            }
          })
        }

        throw new Error(formatAgentError(agentError))
      }

      // Parse JSON output containing result and usage
      let result = ''
      let tokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

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
        'claude-sonnet-4-5-20250929', // Default model
        tokenUsage,
        {
          durationSeconds,
          cpuCount: 2, // From e2b.toml
        }
      )

      // Log to Braintrust
      if (span) {
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

    // Export trace context for sandbox
    const traceContext = await exportTraceContext(span)

    const sandbox = await Sandbox.create(templateId, {
      timeoutMs: timeout * 1000,
      metadata: {
        traceId: traceContext?.traceId,
      },
    })

    try {
      // Use the same Python agent code as runPythonAgent (with Braintrust support)
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

from claude_agent_sdk import query

async def main():
    result = None
    usage_data = None
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    if braintrust_enabled:
        with braintrust.start_span(name="agent_execution") as span:
            span.log(input=prompt)
            async for msg in query(prompt=prompt):
                if hasattr(msg, "result"):
                    result = msg.result
                    # Extract usage metrics if available
                    if hasattr(msg, 'usage') and msg.usage:
                        usage_data = {
                            "input_tokens": int(msg.usage.get('input_tokens', 0)),
                            "output_tokens": int(msg.usage.get('output_tokens', 0)),
                            "cache_read_input_tokens": int(msg.usage.get('cache_read_input_tokens', 0))
                        }
            span.log(output=result)
    else:
        async for msg in query(prompt=prompt):
            if hasattr(msg, "result"):
                result = msg.result
                # Extract usage metrics if available
                if hasattr(msg, 'usage') and msg.usage:
                    usage_data = {
                        "input_tokens": int(getattr(msg.usage, 'input_tokens', 0)),
                        "output_tokens": int(getattr(msg.usage, 'output_tokens', 0)),
                        "cache_read_input_tokens": int(getattr(msg.usage, 'cache_read_input_tokens', 0))
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

      // Prepare environment variables
      const envs: Record<string, string> = {
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      }

      if (process.env.BRAINTRUST_API_KEY) {
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

      // Log to Braintrust
      if (span) {
        span.log({
          metrics: {
            exitCode: Number(execution.exitCode),
            durationMs: Number(endTime - startTime),
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

    // Export trace context for sandbox
    const traceContext = await exportTraceContext(span)

    const sandbox = await Sandbox.create(templateId, {
      timeoutMs: timeout * 1000,
      metadata: {
        prompt: prompt.substring(0, 100),
        traceId: traceContext?.traceId,
      },
    })

    try {
      if (verbose) {
        console.log('Sandbox started. Running Python agent with streaming...\n')
      }

      // Store events for batch upload
      const events: any[] = []
      const realtimeMode = observability?.mode === 'realtime'

    // Python streaming agent code
    const pythonStreamingCode = `
import asyncio
import json
import sys
from claude_agent_sdk import query

def emit(event_type: str, data: dict):
    """Emit structured JSON event to stdout"""
    event = {"type": event_type, "data": data}
    print(json.dumps(event), flush=True)

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    emit("start", {"prompt": prompt})

    try:
        result = None
        async for msg in query(prompt=prompt):
            # Handle AssistantMessage with content blocks
            if hasattr(msg, "content") and isinstance(msg.content, list):
                for block in msg.content:
                    if hasattr(block, "text"):
                        emit("text", {"text": block.text})
                    elif hasattr(block, "thinking"):
                        emit("thinking", {
                            "thinking": block.thinking,
                            "signature": getattr(block, "signature", "")
                        })
                    elif hasattr(block, "name"):  # ToolUseBlock
                        emit("tool_use", {
                            "id": block.id,
                            "name": block.name,
                            "input": block.input
                        })
                    elif hasattr(block, "tool_use_id"):  # ToolResultBlock
                        emit("tool_result", {
                            "tool_use_id": block.tool_use_id,
                            "content": str(block.content),
                            "is_error": getattr(block, "is_error", False)
                        })

            # Handle ResultMessage
            if hasattr(msg, "result"):
                result = msg.result
                # Extract usage metrics if available
                usage_info = {}
                if hasattr(msg, 'usage') and msg.usage:
                    usage_info = {
                        "input_tokens": int(getattr(msg.usage, 'input_tokens', 0)),
                        "output_tokens": int(getattr(msg.usage, 'output_tokens', 0)),
                        "cache_read_input_tokens": int(getattr(msg.usage, 'cache_read_input_tokens', 0))
                    }

                emit("result", {
                    "result": result,
                    "duration_ms": getattr(msg, "duration_ms", 0),
                    "cost": getattr(msg, "total_cost_usd", 0),
                    "num_turns": getattr(msg, "num_turns", 0),
                    "usage": usage_info
                })

            # Handle errors
            if hasattr(msg, "error") and msg.error:
                emit("error", {"error": msg.error, "message": str(msg)})

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
        if (!span) return

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

      // Create line-buffered stream handler
      const streamHandler = createLineBufferedHandler((line) => {
        const event = parseStreamEvent(line)
        if (!event) {
          // Non-event output, print as-is
          process.stdout.write(line + '\n')
          return
        }

        // Store event for batch upload
        events.push(event)

        // Log to Braintrust in real-time if enabled
        logEventToSpan(event)

        // Handle the event with console output
        const consoleHandler = createConsoleStreamHandler({
          ...onStream,
          onResult: (result, durationMs, cost) => {
            finalResult = result
            if (onStream?.onResult) {
              onStream.onResult(result, durationMs, cost)
            }
          },
        })
        consoleHandler(line)
      })

      // Prepare environment variables
      const envs: Record<string, string> = {
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      }

      // Inject Braintrust context if available
      if (process.env.BRAINTRUST_API_KEY) {
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
        'claude-sonnet-4-5-20250929',
        tokenUsage,
        {
          durationSeconds,
          cpuCount: 2,
        }
      )

      // Batch upload events to Braintrust (if not in real-time mode)
      if (span && !realtimeMode) {
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

      // Log final metrics
      if (span) {
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
