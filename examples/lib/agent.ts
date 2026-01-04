/**
 * TypeScript library for orchestrating Python-based Claude agents in E2B sandboxes.
 *
 * This demonstrates the hybrid approach:
 * - TypeScript orchestrates sandbox creation and management
 * - Python runs inside the sandbox with Claude Agent SDK
 * - Best of both worlds: TypeScript integration + mature Python SDK
 */

import { Sandbox } from '@e2b/code-interpreter'
import { createConsoleStreamHandler, createLineBufferedHandler, StreamCallbacks } from './streaming'
import { traceAgentExecution, exportTraceContext } from './observability'
import { calculateCost, formatCost, parseTokenUsage } from './cost-tracking'

export interface AgentConfig {
  prompt: string
  timeout?: number
  verbose?: boolean
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

  return traceAgentExecution('run_agent', { prompt: prompt.substring(0, 100) }, async (span) => {
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

    // Create sandbox from Python-based template
    const sandbox = await Sandbox.create(templateId, {
      timeoutMs: timeout * 1000,
      metadata: {
        prompt: prompt.substring(0, 100), // For debugging
        traceId: traceContext?.traceId,
      },
    })

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
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    if braintrust_enabled:
        # Wrap agent execution in Braintrust span
        with braintrust.start_span(name="agent_execution") as span:
            span.log(input=prompt)

            async for msg in query(prompt=prompt):
                if hasattr(msg, "result"):
                    result = msg.result
                    # Log usage metrics if available
                    if hasattr(msg, 'usage'):
                        span.log(metrics={
                            "promptTokens": getattr(msg.usage, 'input_tokens', 0),
                            "completionTokens": getattr(msg.usage, 'output_tokens', 0),
                            "cachedTokens": getattr(msg.usage, 'cache_read_input_tokens', 0),
                        })

            span.log(output=result)
            if result:
                print(result)
    else:
        # Run without observability
        async for msg in query(prompt=prompt):
            if hasattr(msg, "result"):
                result = msg.result

        if result:
            print(result)

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
        // Log error to Braintrust
        if (span) {
          span.log({
            error: execution.stderr,
            exitCode: execution.exitCode,
            durationMs: endTime - startTime,
          })
        }
        throw new Error(`Agent failed: ${execution.stderr}`)
      }

      const result = execution.stdout.trim()

      // Parse token usage and calculate cost
      const tokenUsage = parseTokenUsage(execution.stdout)
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
            durationMs: endTime - startTime,
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            cachedTokens: tokenUsage.cachedTokens,
            totalCost: cost.total,
            claudeCost: cost.claude.totalCost,
            e2bCost: cost.e2b.cost,
            durationSeconds: durationSeconds,
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
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    if braintrust_enabled:
        with braintrust.start_span(name="agent_execution") as span:
            span.log(input=prompt)
            async for msg in query(prompt=prompt):
                if hasattr(msg, "result"):
                    result = msg.result
            span.log(output=result)
            if result:
                print(result)
    else:
        async for msg in query(prompt=prompt):
            if hasattr(msg, "result"):
                result = msg.result
        if result:
            print(result)

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
            exitCode: execution.exitCode,
            durationMs: endTime - startTime,
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
 * @param config - Streaming agent configuration
 * @returns The agent's final result
 */
export async function runPythonAgentStreaming(
  config: StreamingAgentConfig
): Promise<string> {
  const { prompt, timeout = 120, verbose = false, onStream } = config

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

  const sandbox = await Sandbox.create(templateId, {
    timeoutMs: timeout * 1000,
  })

  try {
    if (verbose) {
      console.log('Sandbox started. Running Python agent with streaming...\n')
    }

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
                emit("result", {
                    "result": result,
                    "duration_ms": getattr(msg, "duration_ms", 0),
                    "cost": getattr(msg, "total_cost_usd", 0),
                    "num_turns": getattr(msg, "num_turns", 0)
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

    // Create line-buffered stream handler
    const streamHandler = createLineBufferedHandler(
      createConsoleStreamHandler({
        ...onStream,
        onResult: (result, durationMs, cost) => {
          finalResult = result
          if (onStream?.onResult) {
            onStream.onResult(result, durationMs, cost)
          }
        },
      })
    )

    await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
      timeoutMs: timeout * 1000,
      envs: {
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      },
      onStdout: streamHandler,
      onStderr: (data) => {
        console.error(`[STDERR] ${data}`)
      },
    })

    if (verbose) {
      console.log('\nAgent completed successfully')
    }

    return finalResult
  } finally {
    await sandbox.kill()
    if (verbose) {
      console.log('Sandbox terminated')
    }
  }
}
