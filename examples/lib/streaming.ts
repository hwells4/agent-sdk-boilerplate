/**
 * Streaming utilities for Claude Agent SDK
 *
 * Provides emoji-based visual distinction and event parsing for real-time
 * agent responses streamed from E2B sandboxes.
 */

import type { RawTokenUsage } from './cost-tracking'

// Re-export RawTokenUsage as TokenUsage for backward compatibility with streaming events
// Streaming events use snake_case (from Python), while cost-tracking uses camelCase
export type TokenUsage = RawTokenUsage

/**
 * Stream event types emitted by Python agents (discriminated union)
 */
export type StreamEvent =
  | { type: 'start'; data: { prompt: string } }
  | { type: 'text'; data: { text: string } }
  | { type: 'thinking'; data: { thinking: string; signature?: string } }
  | { type: 'tool_use'; data: { id: string; name: string; input: unknown } }
  | { type: 'tool_result'; data: { tool_use_id: string; content: string; is_error?: boolean } }
  | { type: 'error'; data: { error: string; message: string } }
  | { type: 'result'; data: { result: string; duration_ms: number; cost: number; usage?: TokenUsage } }
  | { type: 'complete'; data: { status: string; result?: string } }

/**
 * Optional callbacks for different stream event types
 */
export interface StreamCallbacks {
  onStart?: (data: { prompt: string }) => void
  onText?: (text: string) => void
  onThinking?: (thinking: string, signature: string) => void
  onToolUse?: (id: string, name: string, input: unknown) => void
  onToolResult?: (toolUseId: string, content: string, isError: boolean) => void
  onError?: (error: string, message: string) => void
  onResult?: (result: string, durationMs: number, cost: number) => void
  onComplete?: (status: string, result?: string) => void
}

/**
 * Format tool input for display (truncate if too long)
 */
function formatToolInput(input: unknown, maxLength: number = 100): string {
  const str = JSON.stringify(input)
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

/**
 * Parse a JSON line into a StreamEvent
 *
 * @param line - JSON string to parse
 * @returns Parsed StreamEvent or null if invalid
 */
export function parseStreamEvent(line: string): StreamEvent | null {
  try {
    const trimmed = line.trim()
    if (!trimmed) return null

    const event = JSON.parse(trimmed)
    if (event.type && event.data !== undefined) {
      return event as StreamEvent
    }
  } catch (e) {
    // Not JSON or invalid format - this is okay, might be raw output
  }
  return null
}

/**
 * Create a console stream handler with emoji-based visual distinction
 *
 * This function creates a handler that:
 * - Parses JSON events from stdout
 * - Formats them with emojis for visual distinction
 * - Invokes optional callbacks
 *
 * Visual scheme:
 * - Tool calls: 🔧
 * - Text: 💬
 * - Thinking: 🤔
 * - Errors: ❌
 * - Results: ✅
 * - Tool results: 📦
 *
 * @param callbacks - Optional callbacks for each event type
 * @returns Handler function for stdout data
 */
export function createConsoleStreamHandler(callbacks?: StreamCallbacks) {
  return (data: string) => {
    const event = parseStreamEvent(data)
    if (!event) {
      // Non-event output, print as-is
      process.stdout.write(data)
      return
    }

    switch (event.type) {
      case 'start':
        console.log('🚀 Starting agent...')
        if (callbacks?.onStart) callbacks.onStart(event.data)
        break

      case 'text':
        process.stdout.write('💬 ')
        process.stdout.write(event.data.text)
        if (callbacks?.onText) callbacks.onText(event.data.text)
        break

      case 'thinking':
        const thinkingPreview = event.data.thinking.substring(0, 100)
        const hasMore = event.data.thinking.length > 100
        console.log(`🤔 Thinking: ${thinkingPreview}${hasMore ? '...' : ''}`)
        if (callbacks?.onThinking) {
          callbacks.onThinking(event.data.thinking, event.data.signature || '')
        }
        break

      case 'tool_use':
        const toolInput = formatToolInput(event.data.input)
        console.log(`🔧 Tool: ${event.data.name}(${toolInput})`)
        if (callbacks?.onToolUse) {
          callbacks.onToolUse(event.data.id, event.data.name, event.data.input)
        }
        break

      case 'tool_result':
        const resultPreview = event.data.content?.substring(0, 80) || ''
        const hasMoreResult = event.data.content?.length > 80
        console.log(`📦 Result: ${resultPreview}${hasMoreResult ? '...' : ''}`)
        if (callbacks?.onToolResult) {
          callbacks.onToolResult(
            event.data.tool_use_id,
            event.data.content,
            event.data.is_error || false
          )
        }
        break

      case 'error':
        console.log(`❌ Error: ${event.data.message}`)
        if (callbacks?.onError) {
          callbacks.onError(event.data.error, event.data.message)
        }
        break

      case 'result':
        const cost = event.data.cost?.toFixed(4) || 'N/A'
        const duration = ((event.data.duration_ms || 0) / 1000).toFixed(2)
        console.log(`✅ Complete (${duration}s, $${cost})`)
        if (callbacks?.onResult) {
          callbacks.onResult(
            event.data.result,
            event.data.duration_ms || 0,
            event.data.cost || 0
          )
        }
        break

      case 'complete':
        const icon = event.data.status === 'success' ? '✨' : '⚠️'
        console.log(`${icon} Agent finished: ${event.data.status}`)
        if (callbacks?.onComplete) {
          callbacks.onComplete(event.data.status, event.data.result)
        }
        break

      default:
        // Unknown event type, log for debugging
        // This case handles unexpected event types from parseStreamEvent's unsafe cast
        console.log(`[Unknown event: ${(event as { type: string }).type}]`)
    }
  }
}

/**
 * Buffer for collecting partial JSON lines
 *
 * E2B onStdout callbacks may receive partial lines like:
 *   {"type": "tool_use", "data"
 *   : {"name": "Bash"}}\n
 *
 * This class buffers data until complete newlines are found.
 */
class LineBuffer {
  private buffer: string = ''

  /**
   * Add data to buffer and return complete lines
   *
   * @param data - New data chunk from stdout
   * @returns Array of complete lines (without incomplete final line)
   */
  push(data: string): string[] {
    this.buffer += data
    const lines = this.buffer.split('\n')
    // Keep the last (potentially incomplete) line in the buffer
    this.buffer = lines.pop() || ''
    // Return complete lines, filtering out empty ones
    return lines.filter(line => line.trim())
  }

  /**
   * Flush remaining buffer contents
   *
   * @returns Array containing the remaining buffer (if non-empty)
   */
  flush(): string[] {
    const remaining = this.buffer.trim()
    this.buffer = ''
    return remaining ? [remaining] : []
  }
}

/**
 * Wrap a line handler with line buffering
 *
 * This ensures the handler receives complete lines even when
 * E2B emits partial chunks.
 *
 * @param handler - Function that processes complete lines
 * @returns Handler function for stdout data chunks
 */
export function createLineBufferedHandler(
  handler: (line: string) => void
): (data: string) => void {
  const buffer = new LineBuffer()

  return (data: string) => {
    const lines = buffer.push(data)
    lines.forEach(handler)
  }
}

