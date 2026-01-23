/**
 * Python code template generator for Claude agents in E2B sandboxes.
 *
 * This module centralizes Python agent code generation to eliminate duplication
 * across runPythonAgent, runPythonAgentDetailed, runPythonAgentStreaming, and
 * executeTurn (sessions). All Python code variants are generated from a single
 * source of truth.
 *
 * Modes:
 * - basic: Non-streaming, returns JSON result with usage (runPythonAgent, runPythonAgentDetailed)
 * - streaming: Emits JSON events for real-time processing (runPythonAgentStreaming)
 * - session: Emits tool events and supports conversation context (executeTurn)
 */

// Re-export DEFAULT_ALLOWED_TOOLS for consumers who previously imported from this module
export { DEFAULT_ALLOWED_TOOLS } from './constants'

/**
 * Maximum allowed prompt length (100KB)
 */
const MAX_PROMPT_LENGTH = 100_000

/**
 * Regex pattern for invalid control characters (excluding tab, newline, carriage return)
 */
const INVALID_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/

/**
 * Validate prompt input for security and sanity.
 *
 * @throws {Error} if prompt exceeds length limit or contains invalid characters
 */
export function validatePrompt(prompt: string): void {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt too long: ${prompt.length} characters exceeds limit of ${MAX_PROMPT_LENGTH}`)
  }
  if (INVALID_CONTROL_CHARS.test(prompt)) {
    throw new Error('Prompt contains invalid control characters')
  }
}

/**
 * Options for Python agent code generation.
 */
export interface PythonAgentOptions {
  /**
   * Enable streaming mode with JSON event emission.
   * When true, emits text, thinking, tool_use, tool_result, result, and complete events.
   */
  streaming?: boolean

  /**
   * Enable Braintrust observability integration.
   * When true, includes Braintrust initialization and span logging.
   */
  braintrustEnabled?: boolean

  /**
   * Include partial messages for streaming (include_partial_messages=True).
   * Only applies when streaming is true.
   */
  includePartialMessages?: boolean

  /**
   * Session mode for multi-turn conversations.
   * Emits tool_use and tool_result events for hook interception.
   */
  sessionMode?: boolean

  /**
   * Turn ID for session mode.
   */
  turnId?: number
}

/**
 * Generate the common Python imports for Claude agent code.
 */
function generateImports(options: PythonAgentOptions): string {
  const baseImports = `import asyncio
import json
import os
import sys`

  // SDK imports vary by mode
  let sdkImports: string
  if (options.streaming) {
    sdkImports = `from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage
)`
  } else if (options.sessionMode) {
    sdkImports = `from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage
)`
  } else {
    sdkImports = `from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ResultMessage
)`
  }

  return `${baseImports}

${sdkImports}`
}

/**
 * Generate Braintrust initialization code.
 */
function generateBraintrustInit(): string {
  return `
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
`
}

/**
 * Generate the ClaudeAgentOptions configuration.
 */
function generateAgentOptions(options: PythonAgentOptions): string {
  const includePartial = options.streaming && options.includePartialMessages !== false
    ? '\n        include_partial_messages=True,  # Enable streaming of partial messages'
    : ''

  return `    # Configure agent with proper permissions for autonomous operation
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"],
        permission_mode="bypassPermissions",  # Autonomous operation - no permission prompts
        cwd="/home/user",${includePartial}
    )`
}

/**
 * Generate the emit helper function for streaming modes.
 */
function generateEmitHelper(): string {
  return `
def emit(event_type: str, data: dict):
    """Emit structured JSON event to stdout"""
    event = {"type": event_type, "data": data}
    print(json.dumps(event), flush=True)
`
}

/**
 * Generate Python agent code for basic (non-streaming) mode.
 */
function generateBasicAgentCode(prompt: string, options: PythonAgentOptions): string {
  const imports = generateImports(options)
  const braintrustInit = options.braintrustEnabled ? generateBraintrustInit() : ''
  const agentOptions = generateAgentOptions(options)
  const promptJson = JSON.stringify(JSON.stringify(prompt))

  if (options.braintrustEnabled) {
    return `${imports}
${braintrustInit}
async def main():
    result = None
    usage_data = None
    prompt = json.loads(${promptJson})

${agentOptions}

    if braintrust_enabled:
        # Wrap agent execution in Braintrust span
        with braintrust.start_span(name="agent_execution") as span:
            span.log(input=prompt)

            async with ClaudeSDKClient(options=options) as client:
                await client.query(prompt)
                async for msg in client.receive_response():
                    if isinstance(msg, ResultMessage):
                        result = msg.result
                        # Extract usage metrics if available
                        if msg.usage:
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
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for msg in client.receive_response():
                if isinstance(msg, ResultMessage):
                    result = msg.result
                    # Extract usage metrics if available
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
  }

  // Non-Braintrust version
  return `${imports}

async def main():
    result = None
    usage_data = None
    prompt = json.loads(${promptJson})

${agentOptions}

    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for msg in client.receive_response():
            if isinstance(msg, ResultMessage):
                result = msg.result
                # Extract usage metrics if available
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
}

/**
 * Generate Python agent code for streaming mode.
 */
function generateStreamingAgentCode(prompt: string): string {
  const imports = generateImports({ streaming: true })
  const emitHelper = generateEmitHelper()
  const agentOptions = generateAgentOptions({ streaming: true, includePartialMessages: true })
  const promptJson = JSON.stringify(JSON.stringify(prompt))

  return `${imports}
${emitHelper}
async def main():
    prompt = json.loads(${promptJson})

    emit("start", {"prompt": prompt})

${agentOptions}

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
}

/**
 * Generate Python agent code for session/multi-turn mode.
 */
function generateSessionAgentCode(prompt: string, turnId: number): string {
  const imports = generateImports({ sessionMode: true })
  const agentOptions = generateAgentOptions({ sessionMode: true })
  const promptJson = JSON.stringify(JSON.stringify(prompt))

  return `${imports}

async def main():
    prompt = json.loads(${promptJson})

${agentOptions}

    result = None
    tool_uses = []

    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)

        async for msg in client.receive_response():
            # Track tool usage for hooks (logged to stdout for TypeScript to intercept if needed)
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, ToolUseBlock):
                        tool_uses.append({
                            "name": block.name,
                            "input": block.input
                        })
                        # Emit tool use event for potential interception
                        print(json.dumps({"event": "tool_use", "name": block.name, "input": block.input}), flush=True)
                    elif isinstance(block, ToolResultBlock):
                        # Emit tool result event
                        print(json.dumps({"event": "tool_result", "content": str(block.content)[:500]}), flush=True)

            # Capture final result
            if isinstance(msg, ResultMessage):
                result = msg.result
                break

    # Output final result as JSON
    output = {
        "result": result,
        "tool_uses": tool_uses,
        "turn_id": ${turnId}
    }
    print(json.dumps({"event": "complete", "data": output}))

asyncio.run(main())
`
}

/**
 * Generate Python agent code based on options.
 *
 * This is the main entry point for Python code generation, providing a single
 * source of truth for all agent code variants.
 *
 * @param prompt - The user prompt for the agent
 * @param options - Generation options controlling mode and features
 * @returns Generated Python code string
 *
 * @example
 * // Basic mode with Braintrust
 * const code = generatePythonAgentCode('Hello', { braintrustEnabled: true })
 *
 * @example
 * // Streaming mode
 * const code = generatePythonAgentCode('Hello', { streaming: true })
 *
 * @example
 * // Session mode for multi-turn
 * const code = generatePythonAgentCode('Hello', { sessionMode: true, turnId: 1 })
 */
export function generatePythonAgentCode(
  prompt: string,
  options: PythonAgentOptions = {}
): string {
  // Validate prompt before generating code
  validatePrompt(prompt)

  if (options.streaming) {
    return generateStreamingAgentCode(prompt)
  }

  if (options.sessionMode) {
    return generateSessionAgentCode(prompt, options.turnId || 1)
  }

  return generateBasicAgentCode(prompt, options)
}

/**
 * Type guard to check if PythonAgentOptions indicates streaming mode.
 */
export function isStreamingMode(options: PythonAgentOptions): boolean {
  return options.streaming === true
}

/**
 * Type guard to check if PythonAgentOptions indicates session mode.
 */
export function isSessionMode(options: PythonAgentOptions): boolean {
  return options.sessionMode === true
}
