# Streaming Support Implementation Plan

## Overview
Add real-time streaming support to E2B Claude Agent SDK experiments with colored terminal output that visually distinguishes different message types (tool calls, text responses, thinking, errors).

## Goals
- Stream agent responses in real-time from E2B sandboxes to TypeScript/console
- Visual distinction for message types using emojis + colored output (chalk)
- Provide both console and SSE (Server-Sent Events) examples
- Make streaming the default behavior for new agents created via create-e2b-agent skill

## Architecture

### Current State (Non-Streaming)
```
TypeScript → E2B Sandbox → Python Agent SDK → Complete → Return stdout
                                                ↓
                                         Wait for full completion
                                                ↓
                                         User sees nothing until done
```

### Target State (Streaming)
```
Python Agent (E2B Sandbox)
  ├─> query() yields messages
  ├─> Emit JSON events via stdout with flush=True
  │   {"type": "tool_use", "data": {"name": "Bash", ...}}
  │   {"type": "text", "data": {"text": "Response..."}}
  │   {"type": "result", "data": {"result": "...", "cost": 0.01}}
  ↓
E2B onStdout Callback (TypeScript)
  ├─> Line buffering (handle partial JSON)
  ├─> Parse JSON events
  ├─> Route to formatters
  ↓
Console/SSE Output
  ├─> 🔧 Tool: Bash (yellow + bold)
  ├─> 💬 Response text... (white)
  ├─> 🤔 Thinking: ... (magenta dim)
  ├─> ✅ Complete (1.2s, $0.01) (green + bold)
```

## Event Type System

### Emitted Event Format (Python → TypeScript)
```json
{
  "type": "start" | "text" | "thinking" | "tool_use" | "tool_result" | "error" | "result" | "complete",
  "data": { /* event-specific data */ }
}
```

### Event Types Specification

| Event Type | When Emitted | Data Fields | Color | Emoji |
|------------|--------------|-------------|-------|-------|
| `start` | Agent begins execution | `prompt` | cyan bold | 🚀 |
| `text` | AssistantMessage with TextBlock | `text` | white | 💬 |
| `thinking` | AssistantMessage with ThinkingBlock | `thinking`, `signature` | magenta dim | 🤔 |
| `tool_use` | AssistantMessage with ToolUseBlock | `id`, `name`, `input` | yellow bold | 🔧 |
| `tool_result` | AssistantMessage with ToolResultBlock | `tool_use_id`, `content`, `is_error` | blue (red if error) | 📦 |
| `error` | Exception or error state | `error`, `message` | red bold | ❌ |
| `result` | ResultMessage received | `result`, `duration_ms`, `cost`, `num_turns` | green bold | ✅ |
| `complete` | Agent finished | `status` ("success" or "error") | green bold | ✨ |

## Implementation Roadmap

### Phase 1: Core Infrastructure ✅

#### 1.1 Add Dependencies
**File:** `package.json`
- Add `chalk@^5.3.0` for colored terminal output
- Add npm script: `ts:console-streaming`

#### 1.2 Create Streaming Utilities
**File:** `examples/lib/streaming.ts` (NEW)

Components to implement:
```typescript
// Type definitions
interface StreamEvent {
  type: 'start' | 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error' | 'result' | 'complete'
  data: any
}

interface StreamCallbacks {
  onStart?: (data: any) => void
  onText?: (text: string) => void
  onThinking?: (thinking: string, signature: string) => void
  onToolUse?: (id: string, name: string, input: any) => void
  onToolResult?: (toolUseId: string, content: string, isError: boolean) => void
  onError?: (error: string, message: string) => void
  onResult?: (result: string, durationMs: number, cost: number) => void
  onComplete?: (status: string, result?: string) => void
}

// Core functions
parseStreamEvent(line: string): StreamEvent | null
createConsoleStreamHandler(callbacks?: StreamCallbacks): (data: string) => void
createLineBufferedHandler(handler: (line: string) => void): (data: string) => void

// Helper class
class LineBuffer {
  push(data: string): string[]  // Returns complete lines
  flush(): string[]              // Returns remaining buffer
}
```

**Color Scheme:**
- Tool calls: `chalk.yellow.bold('🔧 Tool: Bash(...)')`
- Text responses: `chalk.white('💬 ') + text`
- Thinking: `chalk.magenta.dim('🤔 Thinking: ...')`
- Errors: `chalk.red.bold('❌ Error: ...')`
- Results: `chalk.green.bold('✅ Complete (1.2s, $0.01)')`
- Tool results: `chalk.blue('📦 Result: ...')` (or `chalk.red` if error)

### Phase 2: TypeScript Integration

#### 2.1 Add Streaming Function to Agent Library
**File:** `examples/lib/agent.ts`

Add new export:
```typescript
export interface StreamingAgentConfig extends AgentConfig {
  onStream?: StreamCallbacks
  verbose?: boolean
}

export async function runPythonAgentStreaming(
  config: StreamingAgentConfig
): Promise<string>
```

**Implementation Details:**
1. Import streaming utilities: `import { createConsoleStreamHandler, createLineBufferedHandler, StreamCallbacks } from './streaming'`
2. Load E2B template and OAuth token
3. Create E2B sandbox
4. Generate Python streaming agent code (see Python pattern below)
5. Write Python code to `/home/user/streaming_agent.py`
6. Execute with streaming callbacks:
   ```typescript
   const streamHandler = createLineBufferedHandler(
     createConsoleStreamHandler(config.onStream)
   )

   await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
     timeoutMs: timeout * 1000,
     onStdout: streamHandler,
     onStderr: (data) => console.error(chalk.red(`[STDERR] ${data}`))
   })
   ```
7. Capture and return final result from `result` event

**Python Streaming Agent Pattern:**
```python
import asyncio
import json
import sys
from claude_agent_sdk import query

def emit(event_type: str, data: dict):
    """Emit structured JSON event to stdout"""
    event = {"type": event_type, "data": data}
    print(json.dumps(event), flush=True)

async def main():
    prompt = json.loads(sys.argv[1]) if len(sys.argv) > 1 else input("Enter prompt: ")

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
```

### Phase 3: Examples

#### 3.1 Console Streaming Example
**File:** `examples/console_streaming_example.ts` (NEW)

Create three demonstration examples:

**Example 1: Basic Streaming**
```typescript
async function example1_BasicStreaming() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 1: Basic Streaming'))
  console.log('='.repeat(60) + '\n')

  await runPythonAgentStreaming({
    prompt: 'List the first 5 prime numbers with a brief explanation.',
    verbose: true,
  })
}
```

**Example 2: Tool Usage Streaming**
```typescript
async function example2_ToolUsageStreaming() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 2: Tool Usage with Streaming'))
  console.log('='.repeat(60) + '\n')

  await runPythonAgentStreaming({
    prompt: 'Create a file called test.txt with "Hello!" and read it back.',
    verbose: true,
    onStream: {
      onToolUse: (id, name, input) => {
        console.log(chalk.gray(`  [Debug] Tool ${name} called with ID: ${id}`))
      },
      onToolResult: (toolUseId, content, isError) => {
        if (isError) {
          console.log(chalk.red(`  [Debug] Tool ${toolUseId} failed`))
        }
      },
    },
  })
}
```

**Example 3: Custom Callbacks with Statistics**
```typescript
async function example3_CustomCallbacks() {
  const stats = {
    textChunks: 0,
    toolsUsed: 0,
    thinkingBlocks: 0,
  }

  await runPythonAgentStreaming({
    prompt: 'What is the current directory? List its contents.',
    onStream: {
      onText: () => stats.textChunks++,
      onToolUse: () => stats.toolsUsed++,
      onThinking: () => stats.thinkingBlocks++,
      onComplete: (status) => {
        console.log('\n' + chalk.bold('Statistics:'))
        console.log(chalk.gray(`  Text chunks: ${stats.textChunks}`))
        console.log(chalk.gray(`  Tools used: ${stats.toolsUsed}`))
        console.log(chalk.gray(`  Thinking blocks: ${stats.thinkingBlocks}`))
      },
    },
  })
}
```

#### 3.2 Enhance SSE Streaming API
**File:** `examples/sse-streaming-api.ts`

Update `/api/stream/agent` endpoint:

**Backend Implementation:**
```typescript
app.post('/api/stream/agent', async (req: Request, res: Response) => {
  const { prompt } = req.body

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' })
    return
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  // ... sandbox setup ...

  // Line buffering for SSE
  let buffer = ''

  await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
    timeoutMs: 120000,
    onStdout: (data) => {
      buffer += data
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      lines.forEach(line => {
        if (!line.trim()) return

        try {
          const event = JSON.parse(line)
          // Forward event to SSE client
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
        } catch (e) {
          res.write(`event: raw\ndata: ${line}\n\n`)
        }
      })
    },
    onStderr: (data) => {
      res.write(`event: stderr\ndata: ${data}\n\n`)
    },
  })

  res.write('event: done\ndata: success\n\n')
  res.end()
})
```

**Frontend Enhancement (HTML/CSS/JS):**
```html
<style>
  /* Color scheme for different event types */
  .event-text { color: #e0e0e0; }
  .event-thinking { color: #ba68c8; font-style: italic; }
  .event-tool_use { color: #ffd54f; font-weight: bold; }
  .event-tool_result { color: #64b5f6; }
  .event-error { color: #f44336; font-weight: bold; }
  .event-result { color: #81c784; font-weight: bold; }
</style>

<script>
  function streamAgent() {
    const prompt = document.getElementById('prompt').value;
    const output = document.getElementById('output');
    output.innerHTML = '';

    const eventSource = new EventSource('/api/stream/agent');

    eventSource.addEventListener('text', (e) => {
      const data = JSON.parse(e.data);
      addOutput(data.text, 'event-text');
    });

    eventSource.addEventListener('thinking', (e) => {
      const data = JSON.parse(e.data);
      addOutput(`💭 ${data.thinking.substring(0, 100)}...`, 'event-thinking');
    });

    eventSource.addEventListener('tool_use', (e) => {
      const data = JSON.parse(e.data);
      const inputStr = JSON.stringify(data.input).substring(0, 100);
      addOutput(`🔧 ${data.name}(${inputStr})`, 'event-tool_use');
    });

    eventSource.addEventListener('tool_result', (e) => {
      const data = JSON.parse(e.data);
      const preview = data.content.substring(0, 80);
      addOutput(`📦 ${preview}...`, 'event-tool_result');
    });

    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse(e.data);
      addOutput(`❌ Error: ${data.message}`, 'event-error');
    });

    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data);
      const duration = (data.duration_ms / 1000).toFixed(2);
      const cost = data.cost.toFixed(4);
      addOutput(`✅ Complete (${duration}s, $${cost})`, 'event-result');
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
    });
  }

  function addOutput(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    document.getElementById('output').appendChild(div);
  }
</script>
```

### Phase 4: Skill Integration

#### 4.1 Update Agent Runner Template
**File:** `.claude/skills/create-e2b-agent/templates/run_agent.py.template`

Add streaming mode support:
```python
async def run_streaming():
    """Run agent with real-time streaming output"""
    template_id = os.getenv("E2B_TEMPLATE_ID")
    oauth_token = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")

    # Validation...

    async with Sandbox(template=template_id, timeout=300) as sandbox:
        task = """{{EXAMPLE_TASK}}"""

        # Read streaming_agent.py template
        streaming_agent_code = open('streaming_agent.py').read()

        # Write to sandbox
        await sandbox.files.write('/home/user/streaming_agent.py', streaming_agent_code)

        # Execute with streaming
        await sandbox.commands.run(
            f'python3 /home/user/streaming_agent.py {repr(task)}',
            env={"CLAUDE_CODE_OAUTH_TOKEN": oauth_token},
            on_stdout=lambda data: print(data, end='', flush=True),
            on_stderr=lambda data: print(data, file=sys.stderr, flush=True)
        )

async def main():
    """Main entry point"""
    mode = sys.argv[1] if len(sys.argv) > 1 else "streaming"

    if mode == "streaming":
        await run_streaming()
    else:
        # Legacy non-streaming mode
        await run_non_streaming()

if __name__ == "__main__":
    asyncio.run(main())
```

#### 4.2 Update README Template
**File:** `.claude/skills/create-e2b-agent/templates/README.md.template`

Add streaming documentation section:

```markdown
## Streaming Support

This agent supports real-time streaming of responses with colored terminal output.

### Event Types

| Event | Description | Visual |
|-------|-------------|--------|
| 🚀 start | Agent initialization | Cyan |
| 💬 text | Response text chunks | White |
| 🤔 thinking | Extended thinking process | Magenta (dim) |
| 🔧 tool_use | Tool execution (Bash, Read, Write, etc.) | Yellow (bold) |
| 📦 tool_result | Tool output/results | Blue |
| ❌ error | Error occurred | Red (bold) |
| ✅ result | Final result with cost/duration | Green (bold) |
| ✨ complete | Agent finished successfully | Green (bold) |

### Usage Examples

**Python (streaming mode):**
```bash
python examples/run_{{AGENT_NAME}}.py streaming
```

**Python (non-streaming mode):**
```bash
python examples/run_{{AGENT_NAME}}.py
```

**TypeScript with colored output:**
```typescript
import { runPythonAgentStreaming } from './examples/lib/agent'

await runPythonAgentStreaming({
  prompt: 'Your task here',
  verbose: true,
  onStream: {
    onText: (text) => console.log(text),
    onToolUse: (id, name, input) => console.log(`Tool: ${name}`),
    onResult: (result, duration, cost) => {
      console.log(`Done in ${duration}ms for $${cost}`)
    }
  }
})
```

**Web UI (Server-Sent Events):**
```bash
npm run ts:sse-api
# Open http://localhost:3000
```

### Benefits of Streaming

- **Real-time feedback**: See agent progress as it works
- **Tool visibility**: Watch which tools are being used
- **Thinking process**: Understand how the agent reasons
- **Cost tracking**: Monitor API costs in real-time
- **Better UX**: No "frozen" waiting periods
```

## Testing Strategy

### Test 1: Console Streaming
```bash
# Install dependencies
npm install

# Run console streaming example
npm run ts:console-streaming
```

**Expected Output:**
- Colored terminal output with emojis
- 🔧 Yellow tool calls when agent uses tools
- 💬 White text for agent responses
- 🤔 Magenta thinking blocks
- ✅ Green success message with duration and cost
- Real-time updates (not buffered)

### Test 2: SSE Web UI
```bash
# Start SSE server
npm run ts:sse-api

# Open browser to http://localhost:3000
# Submit a prompt like "List files and create test.txt"
```

**Expected Output:**
- Web UI displays events in real-time
- Different event types have different colors
- Tool calls shown in yellow/gold
- Text responses in white/light gray
- Errors in red
- Final result in green

### Test 3: Skill-Generated Agent
```bash
# Use create-e2b-agent skill to generate a new agent
# The generated agent should include streaming by default

cd agents/new-agent
python build_dev.py
export E2B_TEMPLATE_ID="..."
python examples/run_new_agent.py streaming
```

**Expected Output:**
- New agents work with streaming out of the box
- No additional configuration needed
- Streaming mode is the default

## Technical Implementation Details

### Line Buffering Strategy
**Problem:** E2B `onStdout` callback may receive partial lines/chunks:
```
"{"type": "tool_use", "data": {"
"name": "Bash"}}\n{"type": "text""
```

**Solution:** `LineBuffer` class accumulates data until newlines:
```typescript
class LineBuffer {
  private buffer: string = ''

  push(data: string): string[] {
    this.buffer += data
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''  // Save incomplete line
    return lines.filter(line => line.trim())  // Return complete lines
  }
}
```

### Error Handling
**Python Side:**
- Exceptions wrapped in `{"type": "error"}` events
- stderr captured separately via `onStderr`
- Exit codes propagated (non-zero on error)

**TypeScript Side:**
- JSON parse errors caught in `parseStreamEvent()`
- Invalid events logged but don't crash
- stderr displayed in red with `[STDERR]` prefix

### Performance Characteristics
- **Memory**: O(1) - line buffering only holds incomplete lines
- **Latency**: <10ms E2B streaming latency + JSON parse time
- **Network**: ~100-200 bytes per event (compressed JSON)
- **CPU**: Minimal - simple JSON parse and chalk formatting

### Color Fallback Behavior
Chalk automatically handles terminals without color support:
- Detects TTY capability
- Respects `NO_COLOR` environment variable
- Falls back to emoji-only display
- Preserves formatting in logs/files

## Files Modified

### New Files Created
1. `examples/lib/streaming.ts` - Core streaming utilities (250 lines)
2. `examples/console_streaming_example.ts` - Console examples (150 lines)
3. `plan.md` - This implementation plan

### Files Modified
1. `package.json` - Added chalk dependency and script
2. `examples/lib/agent.ts` - Added `runPythonAgentStreaming()` function
3. `examples/sse-streaming-api.ts` - Enhanced agent endpoint
4. `.claude/skills/create-e2b-agent/templates/run_agent.py.template` - Added streaming mode
5. `.claude/skills/create-e2b-agent/templates/README.md.template` - Documented streaming

## Future Enhancements

### Short Term
- [ ] Progress bars for long-running tools
- [ ] Configurable color schemes
- [ ] Session recording (save streams to file)
- [ ] Replay mode (playback recorded sessions)

### Medium Term
- [ ] Interrupt support (Ctrl+C to stop agent)
- [ ] Custom event formatters
- [ ] Terminal width detection and line wrapping
- [ ] Diff view for file edits

### Long Term
- [ ] Multi-agent streaming (parallel agents)
- [ ] Stream aggregation and filtering
- [ ] Real-time performance metrics
- [ ] WebSocket bidirectional streaming

## References

### Documentation
- E2B Streaming Docs: `docs/E2B_STREAMING_RESEARCH.md`
- Streaming Examples: `docs/STREAMING_EXAMPLES.md`
- Claude Agent SDK: https://github.com/anthropics/claude-agent-sdk-python

### Code Examples
- Basic Streaming: `examples/streaming_example.ts`
- SSE Server: `examples/sse-streaming-api.ts`
- Agent Library: `examples/lib/agent.ts`

### Dependencies
- chalk: ^5.3.0 - Terminal colors
- @e2b/code-interpreter: ^1.0.1 - E2B sandbox
- express: ^4.18.2 - SSE server

---

**Implementation Status:** ✅ In Progress
**Last Updated:** 2026-01-04
**Next Steps:** Complete streaming utilities library
