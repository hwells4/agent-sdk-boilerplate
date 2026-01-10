/**
 * Session management for multi-turn conversations with Braintrust tracing.
 *
 * Uses ClaudeSDKClient for native multi-turn session management where the
 * agent maintains conversation context automatically. Provides conversation-level
 * tracing where each turn is a child span under a parent conversation trace.
 *
 * Key features:
 * - ClaudeSDKClient maintains conversation context natively
 * - Hooks support for stop conditions and tool interception
 * - Interrupt capability for long-running operations
 * - Persistent sandbox for file operations across turns
 */

import { v4 as uuidv4 } from 'uuid'
import { Sandbox } from '@e2b/code-interpreter'
import { getBraintrustLogger, BraintrustSpan } from './observability'
import { AgentConfig } from './agent'
import {
  ConvexConfig,
  createSandboxRunRecord,
  markSandboxRunning,
  markSandboxSucceeded,
  markSandboxFailed,
  updateLastActivity,
} from './convex-integration'

// Session TTL and cleanup configuration
const SESSION_TTL_MS = 30 * 60 * 1000  // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000  // Check every minute

export interface ConversationSession {
  sessionId: string
  traceId?: string
  span?: BraintrustSpan  // Store span reference
  sandbox?: Sandbox  // Keep sandbox alive across turns
  createdAt: Date
  lastActivityAt: number  // Timestamp for TTL tracking
  turnCount: number
  conversationHistory: Array<{turnId: number, prompt: string, response: string}>
  // Convex integration (managed mode)
  convex?: ConvexConfig
  sandboxRunId?: string
}

export interface SessionConfig {
  /** Sandbox timeout in seconds (default: 600 = 10 minutes) */
  timeout?: number
  /** Optional Convex integration for managed mode with lifecycle tracking */
  convex?: ConvexConfig
}

export interface SessionHooks {
  // Called before each tool use - return false to block
  onPreToolUse?: (toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>
  // Called after each tool use
  onPostToolUse?: (toolName: string, toolResult: string) => Promise<void>
  // Called to determine if agent should stop (e.g., task completion check)
  shouldStop?: (response: string, turnCount: number) => Promise<boolean>
}

const activeSessions = new Map<string, ConversationSession>()

// Periodic cleanup of expired sessions
setInterval(async () => {
  const now = Date.now()
  for (const [sessionId, session] of activeSessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      try {
        await endSession(sessionId)
      } catch {
        // Session may have already been cleaned up
        activeSessions.delete(sessionId)
      }
    }
  }
}, CLEANUP_INTERVAL_MS)

/**
 * Create a new conversation session with Braintrust tracing.
 *
 * This creates:
 * - A conversation-level trace in Braintrust
 * - A persistent E2B sandbox for the session (keeps context across turns)
 * - Optionally a Convex sandbox run record for lifecycle tracking
 *
 * @param config - Session configuration (timeout, convex integration)
 * @returns New session object
 */
export async function createSession(config: SessionConfig = {}): Promise<ConversationSession> {
  const { timeout = 600, convex } = config
  const now = Date.now()
  const session: ConversationSession = {
    sessionId: uuidv4(),
    createdAt: new Date(),
    lastActivityAt: now,
    turnCount: 0,
    conversationHistory: [],
    convex,
  }

  const logger = getBraintrustLogger()
  if (logger) {
    // Create conversation-level span
    const span = logger.startSpan({
      name: 'conversation',
      metadata: {
        sessionId: session.sessionId,
        createdAt: session.createdAt.toISOString(),
      }
    })
    session.span = span
    session.traceId = span.id
  }

  // Create Convex sandbox run record if configured (managed mode)
  if (convex) {
    try {
      session.sandboxRunId = await createSandboxRunRecord(
        convex,
        `[Multi-turn session] ${session.sessionId}`,
        session.traceId
      )
    } catch (err) {
      // Log but don't fail - Convex issues shouldn't block session creation
      console.error('[Convex] Failed to create sandbox run record:', err)
    }
  }

  // Create persistent sandbox for this session
  const templateId = process.env.E2B_TEMPLATE_ID
  if (!templateId) {
    throw new Error('E2B_TEMPLATE_ID not set. Run: ./setup.sh')
  }

  session.sandbox = await Sandbox.create(templateId, {
    timeoutMs: timeout * 1000,
    metadata: {
      sessionId: session.sessionId,
      ...(session.traceId && { traceId: session.traceId }),
    },
  })

  // Mark sandbox as running in Convex (with sandbox ID for cleanup)
  if (convex && session.sandboxRunId && session.sandbox) {
    markSandboxRunning(convex, session.sandboxRunId, session.sandbox.sandboxId).catch((err) => {
      console.error('[Convex] Failed to mark sandbox running:', err)
    })
  }

  activeSessions.set(session.sessionId, session)
  return session
}

/**
 * Execute a turn in a conversation session.
 *
 * This:
 * - Uses ClaudeSDKClient which maintains conversation context natively
 * - Uses the persistent sandbox from the session
 * - Logs each turn to Braintrust with session linkage
 * - Supports hooks for stop conditions and tool interception
 *
 * @param sessionId - Session ID from createSession()
 * @param prompt - User prompt for this turn
 * @param config - Additional agent configuration
 * @param hooks - Optional hooks for tool interception and stop conditions
 * @returns Agent response
 */
export async function executeTurn(
  sessionId: string,
  prompt: string,
  config?: Partial<AgentConfig>,
  hooks?: SessionHooks
): Promise<string> {
  const session = activeSessions.get(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  if (!session.sandbox) {
    throw new Error(`Session ${sessionId} has no active sandbox`)
  }

  // Update last activity time for TTL tracking
  session.lastActivityAt = Date.now()

  // Update activity in Convex to prevent cron cleanup
  if (session.convex && session.sandboxRunId) {
    updateLastActivity(session.convex, session.sandboxRunId).catch((err) => {
      console.error('[Convex] Failed to update activity:', err)
    })
  }

  session.turnCount++
  const turnId = session.turnCount

  const logger = getBraintrustLogger()
  const executeWithSpan = async (span?: BraintrustSpan) => {
    if (span) {
      span.log({
        input: prompt,
        metadata: {
          sessionId,
          conversationTraceId: session.traceId,
          turnId,
          turnNumber: turnId,
          hasHistory: session.conversationHistory.length > 0,
        }
      })
    }

    // Execute in persistent sandbox
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
    if (!oauthToken) {
      throw new Error('CLAUDE_CODE_OAUTH_TOKEN not set')
    }

    // Build hooks configuration for Python
    const hooksConfig = {
      hasPreToolUse: !!hooks?.onPreToolUse,
      hasPostToolUse: !!hooks?.onPostToolUse,
      hasShouldStop: !!hooks?.shouldStop,
    }

    // Build conversation context from history for multi-turn support
    // Since each turn runs in a separate Python process, we pass history explicitly
    let contextualPrompt = prompt
    if (session.conversationHistory.length > 0) {
      const historyText = session.conversationHistory
        .map(h => `Turn ${h.turnId}:\nUser: ${h.prompt}\nAssistant: ${h.response}`)
        .join('\n\n')

      contextualPrompt = `Previous conversation:\n\n${historyText}\n\nCurrent turn:\nUser: ${prompt}\n\nPlease respond to the current turn, taking into account the previous conversation context.`
    }

    // Python agent code using ClaudeSDKClient with proper options
    const pythonCode = `
import asyncio
import json
import os
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage
)

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(contextualPrompt))})
    hooks_config = json.loads(${JSON.stringify(JSON.stringify(hooksConfig))})

    # Configure agent with proper permissions for autonomous operation
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"],
        permission_mode="bypassPermissions",  # Autonomous operation
        cwd="/home/user",
    )

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

    await session.sandbox!.files.write('/home/user/turn_agent.py', pythonCode)

    let result = ''
    const toolUses: Array<{name: string, input: unknown}> = []

    /**
     * SECURITY NOTE: OAuth token is passed to sandbox environment.
     * See agent.ts runPythonAgent for detailed security considerations.
     */
    const execution = await session.sandbox!.commands.run(
      'python3 /home/user/turn_agent.py',
      {
        timeoutMs: (config?.timeout || 120) * 1000,
        envs: {
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        },
        onStdout: async (data: string) => {
          // Parse JSON events from stdout
          for (const line of data.split('\n')) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line)

              if (event.event === 'tool_use' && hooks?.onPreToolUse) {
                // Note: In this implementation, we log but can't block mid-execution
                // Future: Use interrupt() for real-time blocking
                toolUses.push({ name: event.name, input: event.input })
              }

              if (event.event === 'tool_result' && hooks?.onPostToolUse) {
                await hooks.onPostToolUse(
                  toolUses[toolUses.length - 1]?.name || 'unknown',
                  event.content
                )
              }

              if (event.event === 'complete') {
                result = event.data?.result || ''
              }
            } catch {
              // Not JSON, ignore
            }
          }
        },
      }
    )

    if (execution.exitCode !== 0) {
      throw new Error(`Turn ${turnId} failed: ${execution.stderr}`)
    }

    // If no result from events, try parsing stdout directly
    if (!result) {
      const lines = execution.stdout.trim().split('\n')
      for (const line of lines.reverse()) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.event === 'complete') {
            result = parsed.data?.result || ''
            break
          }
        } catch {
          continue
        }
      }
    }

    // Store in conversation history
    session.conversationHistory.push({
      turnId,
      prompt,
      response: result,
    })

    if (span) {
      span.log({ output: result })
    }

    // Check if we should stop (via hook)
    if (hooks?.shouldStop) {
      const stop = await hooks.shouldStop(result, session.turnCount)
      if (stop) {
        // Mark session for completion (caller should end session)
        console.log(`[Session ${sessionId}] Stop condition met at turn ${turnId}`)
      }
    }

    return result
  }

  if (logger) {
    return logger.traced(executeWithSpan, {
      name: `turn-${turnId}`,
    })
  } else {
    return executeWithSpan()
  }
}

/**
 * End a conversation session and finalize its trace.
 *
 * This:
 * - Logs final conversation metadata
 * - Kills the persistent sandbox
 * - Ends the Braintrust span
 * - Marks Convex record as succeeded
 *
 * @param sessionId - Session ID to end
 * @param error - Optional error if session ended due to failure
 */
export async function endSession(sessionId: string, error?: string): Promise<void> {
  const session = activeSessions.get(sessionId)
  if (!session) return

  // Kill the persistent sandbox
  if (session.sandbox) {
    await session.sandbox.kill()
  }

  // Mark session status in Convex
  if (session.convex && session.sandboxRunId) {
    const durationMs = Date.now() - session.createdAt.getTime()
    if (error) {
      markSandboxFailed(session.convex, session.sandboxRunId, error).catch((err) => {
        console.error('[Convex] Failed to mark session failed:', err)
      })
    } else {
      // Create a summary of the session for the result
      const summary = `Session completed: ${session.turnCount} turns, ${durationMs}ms duration`
      markSandboxSucceeded(session.convex, session.sandboxRunId, summary).catch((err) => {
        console.error('[Convex] Failed to mark session succeeded:', err)
      })
    }
  }

  // Log final metadata and end the span
  if (session.span) {
    session.span.log({
      metadata: {
        sessionId,
        turnCount: session.turnCount,
        duration: Date.now() - session.createdAt.getTime(),
        conversationLength: session.conversationHistory.length,
      }
    })
    if (session.span.end) {
      session.span.end()
    }
  }

  activeSessions.delete(sessionId)
}

/**
 * Get a session by ID.
 *
 * @param sessionId - Session ID
 * @returns Session object or undefined if not found
 */
export function getSession(sessionId: string): ConversationSession | undefined {
  return activeSessions.get(sessionId)
}

/**
 * Get all active sessions.
 *
 * @returns Array of active sessions
 */
export function getActiveSessions(): ConversationSession[] {
  return Array.from(activeSessions.values())
}
