/**
 * Streaming utilities for Claude Agent SDK
 *
 * Provides colored terminal output and event parsing for real-time
 * agent responses streamed from E2B sandboxes.
 */

import chalk from 'chalk'

/**
 * Stream event types emitted by Python agents
 */
export interface StreamEvent {
  type: 'start' | 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error' | 'result' | 'complete'
  data: any
}

/**
 * Optional callbacks for different stream event types
 */
export interface StreamCallbacks {
  onStart?: (data: any) => void
  onText?: (text: string) => void
  onThinking?: (thinking: string, signature: string) => void
  onToolUse?: (id: string, name: string, input: any) => void
  onToolResult?: (toolUseId: string, content: string, isError: boolean) => void
  onError?: (error: string, message: string) => void
  onResult?: (result: string, durationMs: number, cost: number) => void
  onComplete?: (status: string, result?: string) => void
}

/**
 * Format tool input for display (truncate if too long)
 */
function formatToolInput(input: any, maxLength: number = 100): string {
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
 * Create a console stream handler with colored output
 *
 * This function creates a handler that:
 * - Parses JSON events from stdout
 * - Formats them with colors and emojis
 * - Invokes optional callbacks
 *
 * Color scheme:
 * - Tool calls: yellow bold 🔧
 * - Text: white 💬
 * - Thinking: magenta dim 🤔
 * - Errors: red bold ❌
 * - Results: green bold ✅
 * - Tool results: blue 📦
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
        console.log(chalk.cyan.bold('🚀 Starting agent...'))
        if (callbacks?.onStart) callbacks.onStart(event.data)
        break

      case 'text':
        process.stdout.write(chalk.white('💬 '))
        process.stdout.write(event.data.text)
        if (callbacks?.onText) callbacks.onText(event.data.text)
        break

      case 'thinking':
        const thinkingPreview = event.data.thinking.substring(0, 100)
        const hasMore = event.data.thinking.length > 100
        console.log(chalk.magenta.dim(`🤔 Thinking: ${thinkingPreview}${hasMore ? '...' : ''}`))
        if (callbacks?.onThinking) {
          callbacks.onThinking(event.data.thinking, event.data.signature || '')
        }
        break

      case 'tool_use':
        const toolInput = formatToolInput(event.data.input)
        console.log(chalk.yellow.bold(`🔧 Tool: ${event.data.name}(${toolInput})`))
        if (callbacks?.onToolUse) {
          callbacks.onToolUse(event.data.id, event.data.name, event.data.input)
        }
        break

      case 'tool_result':
        const resultPreview = event.data.content?.substring(0, 80) || ''
        const hasMoreResult = event.data.content?.length > 80
        const resultColor = event.data.is_error ? chalk.red : chalk.blue
        console.log(resultColor(`📦 Result: ${resultPreview}${hasMoreResult ? '...' : ''}`))
        if (callbacks?.onToolResult) {
          callbacks.onToolResult(
            event.data.tool_use_id,
            event.data.content,
            event.data.is_error || false
          )
        }
        break

      case 'error':
        console.log(chalk.red.bold(`❌ Error: ${event.data.message}`))
        if (callbacks?.onError) {
          callbacks.onError(event.data.error, event.data.message)
        }
        break

      case 'result':
        const cost = event.data.cost?.toFixed(4) || 'N/A'
        const duration = ((event.data.duration_ms || 0) / 1000).toFixed(2)
        console.log(chalk.green.bold(`✅ Complete (${duration}s, $${cost})`))
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
        const statusColor = event.data.status === 'success' ? chalk.green : chalk.yellow
        console.log(statusColor.bold(`${icon} Agent finished: ${event.data.status}`))
        if (callbacks?.onComplete) {
          callbacks.onComplete(event.data.status, event.data.result)
        }
        break

      default:
        // Unknown event type, log for debugging
        console.log(chalk.gray(`[Unknown event: ${event.type}]`))
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

/**
 * Create a simple text-only stream handler (no colors)
 *
 * Useful for:
 * - Non-TTY environments
 * - Log files
 * - CI/CD pipelines
 *
 * @param callbacks - Optional callbacks for each event type
 * @returns Handler function for stdout data
 */
export function createPlainStreamHandler(callbacks?: StreamCallbacks) {
  return (data: string) => {
    const event = parseStreamEvent(data)
    if (!event) {
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
        const preview = event.data.thinking.substring(0, 100)
        console.log(`🤔 Thinking: ${preview}...`)
        if (callbacks?.onThinking) {
          callbacks.onThinking(event.data.thinking, event.data.signature || '')
        }
        break

      case 'tool_use':
        const input = formatToolInput(event.data.input)
        console.log(`🔧 Tool: ${event.data.name}(${input})`)
        if (callbacks?.onToolUse) {
          callbacks.onToolUse(event.data.id, event.data.name, event.data.input)
        }
        break

      case 'tool_result':
        const result = event.data.content?.substring(0, 80) || ''
        console.log(`📦 Result: ${result}...`)
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
    }
  }
}
