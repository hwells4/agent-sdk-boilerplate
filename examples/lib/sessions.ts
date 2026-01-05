/**
 * Session management for multi-turn conversations with Braintrust tracing.
 *
 * Provides conversation-level tracing where each turn is a child span
 * under a parent conversation trace.
 */

import { v4 as uuidv4 } from 'uuid'
import { Sandbox } from '@e2b/code-interpreter'
import { getBraintrustLogger } from './observability'
import { AgentConfig } from './agent'

export interface ConversationSession {
  sessionId: string
  traceId?: string
  span?: any  // Store span reference
  sandbox?: Sandbox  // Keep sandbox alive across turns
  createdAt: Date
  turnCount: number
  conversationHistory: Array<{turnId: number, prompt: string, response: string}>
}

const activeSessions = new Map<string, ConversationSession>()

/**
 * Create a new conversation session with Braintrust tracing.
 *
 * This creates:
 * - A conversation-level trace in Braintrust
 * - A persistent E2B sandbox for the session (keeps context across turns)
 *
 * @param timeout - Sandbox timeout in seconds (default: 600 = 10 minutes)
 * @returns New session object
 */
export async function createSession(timeout: number = 600): Promise<ConversationSession> {
  const session: ConversationSession = {
    sessionId: uuidv4(),
    createdAt: new Date(),
    turnCount: 0,
    conversationHistory: [],
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

  // Create persistent sandbox for this session
  const templateId = process.env.E2B_TEMPLATE_ID
  if (!templateId) {
    throw new Error('E2B_TEMPLATE_ID not set. Run: ./setup.sh')
  }

  session.sandbox = await Sandbox.create(templateId, {
    timeoutMs: timeout * 1000,
    metadata: {
      sessionId: session.sessionId,
      traceId: session.traceId,
    },
  })

  activeSessions.set(session.sessionId, session)
  return session
}

/**
 * Execute a turn in a conversation session.
 *
 * This:
 * - Maintains conversation context across turns
 * - Uses the persistent sandbox from the session
 * - Logs each turn to Braintrust with session linkage
 *
 * @param sessionId - Session ID from createSession()
 * @param prompt - User prompt for this turn
 * @param config - Additional agent configuration
 * @returns Agent response
 */
export async function executeTurn(
  sessionId: string,
  prompt: string,
  config?: Partial<AgentConfig>
): Promise<string> {
  const session = activeSessions.get(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  if (!session.sandbox) {
    throw new Error(`Session ${sessionId} has no active sandbox`)
  }

  session.turnCount++
  const turnId = session.turnCount

  // Build conversation context from history
  let contextualPrompt = prompt
  if (session.conversationHistory.length > 0) {
    const historyText = session.conversationHistory
      .map(h => `Turn ${h.turnId}:\nUser: ${h.prompt}\nAssistant: ${h.response}`)
      .join('\n\n')

    contextualPrompt = `Previous conversation:\n\n${historyText}\n\nCurrent turn:\nUser: ${prompt}\n\nPlease respond to the current turn, taking into account the previous conversation context.`
  }

  const logger = getBraintrustLogger()
  const executeWithSpan = async (span?: any) => {
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

    // Python agent code
    const pythonCode = `
import asyncio
import json
import os
from claude_agent_sdk import query

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(contextualPrompt))})
    result = None

    async for msg in query(prompt=prompt):
        if hasattr(msg, "result"):
            result = msg.result

    if result:
        print(result)

asyncio.run(main())
`

    await session.sandbox!.files.write('/home/user/turn_agent.py', pythonCode)

    const execution = await session.sandbox!.commands.run(
      'python3 /home/user/turn_agent.py',
      {
        timeoutMs: (config?.timeout || 120) * 1000,
        envs: {
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        },
      }
    )

    if (execution.exitCode !== 0) {
      throw new Error(`Turn ${turnId} failed: ${execution.stderr}`)
    }

    const result = execution.stdout.trim()

    // Store in conversation history
    session.conversationHistory.push({
      turnId,
      prompt,
      response: result,
    })

    if (span) {
      span.log({ output: result })
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
 *
 * @param sessionId - Session ID to end
 */
export async function endSession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId)
  if (!session) return

  // Kill the persistent sandbox
  if (session.sandbox) {
    await session.sandbox.kill()
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
    session.span.end()
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
