# E2B Sandbox Streaming Research

**Research Date:** 2026-01-04
**Focus:** Real-time communication between Python code in E2B sandboxes and TypeScript/Node.js applications

---

## Executive Summary

E2B sandboxes provide multiple mechanisms for streaming data from Python code to TypeScript/Node.js applications:

1. **Callback-based streaming** via `onStdout`/`onStderr` handlers (Primary method)
2. **Process API** for background processes with output handlers
3. **WebSocket/HTTP** port forwarding for custom protocols
4. **Code Interpreter SDK** with specialized streaming for Jupyter-style execution

The recommended approach is using callback handlers which provide real-time, event-driven streaming with minimal latency (~150ms sandbox startup).

---

## 1. Real-Time Communication Architecture

### How E2B Handles Communication

E2B uses **Firecracker microVMs** to create isolated sandboxes that start in approximately 150 milliseconds. Communication between the host (TypeScript/Node.js) and sandbox (Python) happens through:

- **WebSocket connections** for real-time bidirectional communication
- **HTTP API** for sandbox management and control
- **Callback handlers** that stream output as it's generated

### Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ TypeScript/Node.js Application (Host)                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ E2B SDK (@e2b/code-interpreter)                      │  │
│  │                                                       │  │
│  │  - Manages WebSocket connections                     │  │
│  │  - Handles callback registration                     │  │
│  │  - Serializes/deserializes messages                  │  │
│  └───────────────────┬──────────────────────────────────┘  │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │ WebSocket/HTTP
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ E2B Firecracker microVM (Sandbox)                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Python Process                                       │  │
│  │                                                       │  │
│  │  - Executes code                                     │  │
│  │  - Writes to stdout/stderr                           │  │
│  │  - Streams output in real-time                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Streaming Methods

### Method 1: Command Output Streaming (Recommended)

The primary method for streaming data is using `onStdout` and `onStderr` callbacks with the commands API.

#### TypeScript Example

```typescript
import { Sandbox } from '@e2b/code-interpreter'

const sandbox = await Sandbox.create()

// Stream command output in real-time
const result = await sandbox.commands.run('echo hello; sleep 1; echo world', {
  onStdout: (data: string) => {
    console.log('STDOUT:', data)
    // Data is streamed as it arrives, not buffered
  },
  onStderr: (data: string) => {
    console.error('STDERR:', data)
  },
})

console.log('Final result:', result)
await sandbox.kill()
```

#### Python SDK Equivalent

```python
from e2b_code_interpreter import Sandbox

sandbox = Sandbox.create()

result = sandbox.commands.run(
    'echo hello; sleep 1; echo world',
    on_stdout=lambda data: print(f'STDOUT: {data}'),
    on_stderr=lambda data: print(f'STDERR: {data}')
)

print('Final result:', result)
```

**Key Features:**
- Real-time streaming as output is generated
- Works with any shell command
- No buffering - data arrives immediately
- Both stdout and stderr are supported

---

### Method 2: Code Interpreter Streaming

For Python code execution, the Code Interpreter SDK provides enhanced streaming with support for execution results, errors, and rich outputs.

#### TypeScript Example

```typescript
import { Sandbox } from '@e2b/code-interpreter'

const codeToRun = `
import time
import sys

print("Starting execution...")
time.sleep(2)

print("Processing data...", file=sys.stderr)
time.sleep(2)

result = 42
print(f"Result: {result}")
`

const sandbox = await Sandbox.create()

const execution = await sandbox.runCode(codeToRun, {
  onStdout: (data) => console.log('stdout:', data),
  onStderr: (data) => console.error('stderr:', data),
  onError: (error) => console.error('error:', error),
  // Additional callbacks for rich outputs:
  // onResult: (result) => console.log('Result:', result)
})

await sandbox.kill()
```

#### Python SDK Example

```python
from e2b_code_interpreter import Sandbox

code_to_run = """
import time
import sys

print("Starting execution...")
time.sleep(2)

print("Processing data...", file=sys.stderr)
time.sleep(2)

result = 42
print(f"Result: {result}")
"""

sandbox = Sandbox.create()

execution = sandbox.run_code(
    code_to_run,
    on_stdout=lambda data: print('stdout:', data),
    on_stderr=lambda data: print('stderr:', data),
    on_error=lambda error: print('error:', error),
)
```

**Key Features:**
- Specialized for Python code execution
- Supports rich outputs (charts, images)
- Handles execution errors gracefully
- Works with Jupyter-style cell execution

---

### Method 3: Background Process Streaming

For long-running processes, E2B supports background execution with streaming output.

#### TypeScript Example

```typescript
import { Sandbox } from '@e2b/code-interpreter'

const sandbox = await Sandbox.create()

// Start a long-running process in the background
const handle = await sandbox.commands.run('python long_running_script.py', {
  background: true,
  onStdout: (data) => {
    console.log('Background process output:', data)
    // Process streaming data from long-running task
  },
  onStderr: (data) => {
    console.error('Background process error:', data)
  },
  timeout: 0, // No timeout for long-running processes
})

console.log('Process started with PID:', handle.pid)

// Optionally send input to the process
await sandbox.commands.sendStdin(handle.pid, 'some input\n')

// Wait for completion (non-blocking in the background)
const result = await handle.wait()
console.log('Process completed:', result)
```

#### Python SDK Example

```python
from e2b_code_interpreter import Sandbox

sandbox = Sandbox.create()

# Start background process
handle = sandbox.commands.run(
    'python long_running_script.py',
    background=True,
    on_stdout=lambda data: print(f'Output: {data}'),
    on_stderr=lambda data: print(f'Error: {data}'),
    timeout=0  # No timeout
)

print(f'Process started with PID: {handle.pid}')

# Send input if needed
sandbox.commands.send_stdin(handle.pid, 'some input\n')

# Wait for completion
result = handle.wait()
```

**Key Features:**
- Non-blocking execution
- Stream output while process runs
- Send input to running processes via stdin
- Manage multiple background processes simultaneously

---

### Method 4: WebSocket Port Forwarding

For custom protocols, E2B allows you to expose sandbox ports and connect via WebSocket or HTTP.

#### TypeScript Example

```typescript
import { Sandbox } from '@e2b/code-interpreter'
import WebSocket from 'ws'

const sandbox = await Sandbox.create()

// Start a WebSocket server inside the sandbox
await sandbox.commands.run(
  'python -m websockets localhost:8000',
  { background: true }
)

// Get the public URL for the sandbox port
const url = await sandbox.getHostURL(8000)
console.log('Sandbox WebSocket URL:', url)

// Connect to the WebSocket from your application
const ws = new WebSocket(url.replace('http', 'ws'))

ws.on('open', () => {
  console.log('Connected to sandbox WebSocket')
  ws.send(JSON.stringify({ type: 'query', data: 'Hello from host' }))
})

ws.on('message', (data) => {
  console.log('Received from sandbox:', data.toString())
  // Process streaming data from custom protocol
})

ws.on('close', () => {
  console.log('WebSocket closed')
})
```

**Key Features:**
- Full control over communication protocol
- Bidirectional streaming
- Suitable for complex agent architectures
- Can use any WebSocket library

**Example Use Case:**
A third-party project ([claude-agent-server](https://github.com/dzhng/claude-agent-server)) wraps the Claude Agent SDK as a WebSocket server, allowing real-time bidirectional communication with Claude agents running in E2B sandboxes.

---

## 3. Capturing stdout/stderr Streams

### Callback Signatures

#### TypeScript

```typescript
// Synchronous callback
onStdout: (data: string) => void

// Asynchronous callback (for processing that requires I/O)
onStdout: (data: string) => Promise<void>

// Same for stderr
onStderr: (data: string) => void | Promise<void>
```

#### Python

```python
from typing import Callable

# Simple callback
def on_stdout(data: str) -> None:
    print(data)

# Or as lambda
on_stdout: Callable[[str], None] = lambda data: print(data)
```

### Stream Processing Patterns

#### Pattern 1: Accumulate Output

```typescript
let fullOutput = ''

const result = await sandbox.commands.run('python script.py', {
  onStdout: (data) => {
    fullOutput += data
  },
})

console.log('Complete output:', fullOutput)
```

#### Pattern 2: Parse and Process

```typescript
const results: any[] = []

await sandbox.runCode(pythonCode, {
  onStdout: (data) => {
    try {
      // Parse JSON output from Python
      const parsed = JSON.parse(data)
      results.push(parsed)
    } catch (e) {
      // Handle non-JSON output
      console.log(data)
    }
  },
})
```

#### Pattern 3: Stream to Client (SSE)

```typescript
// Express.js endpoint with Server-Sent Events
app.get('/stream-agent', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sandbox = await Sandbox.create()

  await sandbox.runCode(pythonCode, {
    onStdout: (data) => {
      res.write(`data: ${JSON.stringify({ type: 'stdout', content: data })}\n\n`)
    },
    onStderr: (data) => {
      res.write(`data: ${JSON.stringify({ type: 'stderr', content: data })}\n\n`)
    },
    onError: (error) => {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error })}\n\n`)
    },
  })

  res.write('data: {"type":"complete"}\n\n')
  res.end()
  await sandbox.kill()
})
```

---

## 4. Best Practices for Long-Running Processes

### 1. Use Background Execution

```typescript
// Don't block the main thread
const handle = await sandbox.commands.run('python long_task.py', {
  background: true,
  timeout: 0, // Disable timeout for long tasks
  onStdout: (data) => processStreamingData(data),
})

// Continue with other work
console.log('Task started, doing other things...')

// Check back later
const result = await handle.wait()
```

### 2. Implement Heartbeat Monitoring

```python
# Inside sandbox: long_running_task.py
import time
import sys

for i in range(100):
    # Flush output immediately for real-time streaming
    print(f"Progress: {i}%", flush=True)
    time.sleep(1)

print("Complete!", flush=True)
```

```typescript
// TypeScript host
let lastHeartbeat = Date.now()

await sandbox.commands.run('python long_running_task.py', {
  onStdout: (data) => {
    lastHeartbeat = Date.now()
    console.log(data)
  },
})

// Monitor for stalls
setInterval(() => {
  if (Date.now() - lastHeartbeat > 30000) {
    console.error('Process appears stalled')
  }
}, 10000)
```

### 3. Handle Errors Gracefully

```typescript
try {
  await sandbox.commands.run('python potentially_failing_task.py', {
    onStdout: (data) => console.log(data),
    onStderr: (data) => {
      // Log errors but don't throw
      console.error('Task error:', data)
    },
    timeout: 300, // 5 minute timeout
  })
} catch (error) {
  console.error('Task failed:', error)
  // Implement retry logic or fallback
} finally {
  await sandbox.kill()
}
```

### 4. Use Structured Output

```python
# Inside sandbox: structured_output.py
import json
import sys

def emit_event(event_type: str, data: any):
    """Emit structured JSON events for easy parsing"""
    event = {
        'type': event_type,
        'data': data,
        'timestamp': time.time()
    }
    print(json.dumps(event), flush=True)

emit_event('progress', {'percent': 50})
emit_event('result', {'value': 42})
emit_event('complete', {})
```

```typescript
// TypeScript host with structured parsing
await sandbox.commands.run('python structured_output.py', {
  onStdout: (data) => {
    try {
      const event = JSON.parse(data)

      switch (event.type) {
        case 'progress':
          updateProgressBar(event.data.percent)
          break
        case 'result':
          handleResult(event.data.value)
          break
        case 'complete':
          finalize()
          break
      }
    } catch (e) {
      // Handle non-JSON output
      console.log('Raw output:', data)
    }
  },
})
```

### 5. Manage Sandbox Lifecycle

```typescript
class AgentSession {
  private sandbox: Sandbox | null = null

  async start() {
    this.sandbox = await Sandbox.create({
      timeoutMs: 0, // No automatic timeout
      onClose: () => console.log('Sandbox closed'),
    })
  }

  async runTask(code: string) {
    if (!this.sandbox) throw new Error('Session not started')

    return await this.sandbox.runCode(code, {
      onStdout: (data) => this.handleOutput(data),
    })
  }

  async close() {
    if (this.sandbox) {
      await this.sandbox.kill()
      this.sandbox = null
    }
  }

  private handleOutput(data: string) {
    console.log('Task output:', data)
  }
}

// Usage
const session = new AgentSession()
await session.start()
await session.runTask('print("Hello")')
await session.runTask('print("World")')
await session.close()
```

---

## 5. Practical Streaming Examples

### Example 1: Claude Agent with Streaming Output

Based on the existing codebase at `/Users/harrisonwells/claude-agent-sdk-experiments/examples/lib/agent.ts`:

```typescript
import { Sandbox } from '@e2b/code-interpreter'

export interface StreamingAgentConfig {
  prompt: string
  timeout?: number
  onChunk?: (chunk: string) => void
  onComplete?: (result: string) => void
  onError?: (error: string) => void
}

export async function runStreamingAgent(config: StreamingAgentConfig): Promise<void> {
  const { prompt, timeout = 120, onChunk, onComplete, onError } = config

  const templateId = process.env.E2B_TEMPLATE_ID
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

  if (!templateId || !oauthToken) {
    throw new Error('Missing environment variables')
  }

  const sandbox = await Sandbox.create({
    template: templateId,
    timeoutMs: timeout * 1000,
  })

  await sandbox.commands.run(`export CLAUDE_CODE_OAUTH_TOKEN="${oauthToken}"`)

  try {
    // Enhanced Python agent with streaming
    const pythonCode = `
import asyncio
import json
import sys
from claude_agent_sdk import query

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})
    result = None

    # Stream intermediate messages
    async for msg in query(prompt=prompt):
        if hasattr(msg, "content"):
            # Stream content chunks as they arrive
            print(json.dumps({"type": "chunk", "data": msg.content}), flush=True)
        if hasattr(msg, "result"):
            result = msg.result

    # Send final result
    if result:
        print(json.dumps({"type": "complete", "data": result}), flush=True)

asyncio.run(main())
`

    await sandbox.files.write('/home/user/streaming_agent.py', pythonCode)

    let fullResult = ''

    await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
      timeoutMs: timeout * 1000,
      onStdout: (data) => {
        try {
          const event = JSON.parse(data)

          if (event.type === 'chunk') {
            onChunk?.(event.data)
            fullResult += event.data
          } else if (event.type === 'complete') {
            onComplete?.(event.data)
          }
        } catch (e) {
          // Non-JSON output
          onChunk?.(data)
        }
      },
      onStderr: (data) => {
        onError?.(data)
      },
    })

  } finally {
    await sandbox.kill()
  }
}

// Usage Example
await runStreamingAgent({
  prompt: 'Explain quantum computing in simple terms',
  onChunk: (chunk) => {
    process.stdout.write(chunk) // Stream to console
  },
  onComplete: (result) => {
    console.log('\n\nFinal result:', result)
  },
  onError: (error) => {
    console.error('Error:', error)
  },
})
```

### Example 2: Data Analysis with Progress Updates

```typescript
async function runDataAnalysis(csvData: string) {
  const sandbox = await Sandbox.create()

  const analysisCode = `
import pandas as pd
import json
import sys

def emit(msg_type: str, data: any):
    print(json.dumps({"type": msg_type, "data": data}), flush=True)

emit("status", "Loading data...")
df = pd.read_csv("data.csv")
emit("status", f"Loaded {len(df)} rows")

emit("status", "Calculating statistics...")
stats = {
    "mean": df.mean().to_dict(),
    "median": df.median().to_dict(),
    "std": df.std().to_dict(),
}
emit("stats", stats)

emit("status", "Generating visualization...")
# ... create plot
emit("complete", "Analysis complete")
`

  // Write CSV data to sandbox
  await sandbox.files.write('/home/user/data.csv', csvData)
  await sandbox.files.write('/home/user/analysis.py', analysisCode)

  const updates: any[] = []

  await sandbox.commands.run('python3 analysis.py', {
    onStdout: (data) => {
      try {
        const event = JSON.parse(data)
        console.log(`[${event.type}]`, event.data)
        updates.push(event)
      } catch (e) {
        console.log(data)
      }
    },
  })

  await sandbox.kill()
  return updates
}
```

### Example 3: Real-Time Agent Collaboration

```typescript
// Multiple agents streaming simultaneously
async function runMultiAgentTask(tasks: string[]) {
  const sandbox = await Sandbox.create()

  const agentOutputs = new Map<number, string[]>()

  // Run multiple agents in parallel
  const promises = tasks.map(async (task, index) => {
    agentOutputs.set(index, [])

    const code = `
import json
print(json.dumps({
    "agent_id": ${index},
    "task": ${JSON.stringify(task)},
    "result": "processed"
}), flush=True)
`

    await sandbox.files.write(`/home/user/agent_${index}.py`, code)

    return sandbox.commands.run(`python3 /home/user/agent_${index}.py`, {
      background: true,
      onStdout: (data) => {
        const output = agentOutputs.get(index) || []
        output.push(data)
        agentOutputs.set(index, output)
        console.log(`Agent ${index}:`, data)
      },
    })
  })

  // Wait for all agents to complete
  await Promise.all(promises.map(p => p.then(h => h.wait())))

  await sandbox.kill()
  return agentOutputs
}
```

---

## 6. Technology Comparison

### Streaming Technologies in 2025

| Technology | Best For | Pros | Cons | E2B Support |
|------------|----------|------|------|-------------|
| **Callbacks** | Simple streaming | Easy to use, low latency | Unidirectional | ✅ Native |
| **WebSocket** | Bidirectional communication | Full duplex, low overhead | More complex setup | ✅ Port forwarding |
| **SSE** | Server→Client streaming | Simple HTTP, auto-reconnect | Unidirectional | ✅ Via HTTP |
| **Polling** | Fallback option | Universal compatibility | High latency, inefficient | ✅ Via API |

### E2B Recommendation

**Use callbacks (`onStdout`/`onStderr`) as the primary streaming method** because:
- Native integration with E2B SDK
- Minimal latency (~150ms sandbox startup)
- Simple implementation
- No additional protocol overhead
- Works seamlessly with both command execution and code interpretation

**Use WebSocket port forwarding when:**
- You need bidirectional communication
- Building custom agent protocols
- Implementing complex multi-agent systems
- Require connection persistence across multiple operations

---

## 7. Performance Considerations

### Latency Breakdown

```
Total Streaming Latency = Sandbox Startup + Code Execution + Network Transfer

- Sandbox Startup: ~150ms (Firecracker microVM)
- Code Execution: Variable (depends on workload)
- Network Transfer: <10ms (streaming chunks as generated)
```

### Optimization Tips

1. **Reuse Sandboxes for Multiple Tasks**
   ```typescript
   // Don't create new sandbox for each task
   const sandbox = await Sandbox.create()
   await sandbox.runCode(code1, { onStdout: handler })
   await sandbox.runCode(code2, { onStdout: handler })
   await sandbox.kill()
   ```

2. **Use Background Processes for Parallel Execution**
   ```typescript
   const handles = await Promise.all([
     sandbox.commands.run('task1.py', { background: true }),
     sandbox.commands.run('task2.py', { background: true }),
   ])
   ```

3. **Flush Output Immediately in Python**
   ```python
   print("message", flush=True)  # Don't buffer
   ```

4. **Stream JSON for Structured Data**
   ```python
   # More efficient than large single output
   for item in results:
       print(json.dumps(item), flush=True)
   ```

---

## 8. Current Implementation Analysis

### Existing Codebase

The current implementation at `/Users/harrisonwells/claude-agent-sdk-experiments/examples/lib/agent.ts` uses:

```typescript
// Current: No streaming, buffered output
const execution = await sandbox.commands.run('python3 /home/user/agent.py', {
  timeoutMs: timeout * 1000,
})

return execution.stdout.trim()
```

### Recommended Enhancement

```typescript
// Enhanced: Real-time streaming
export async function runPythonAgentStreaming(
  config: AgentConfig,
  onStream?: (chunk: string) => void
): Promise<string> {
  let streamedOutput = ''

  const execution = await sandbox.commands.run('python3 /home/user/agent.py', {
    timeoutMs: timeout * 1000,
    onStdout: (data) => {
      streamedOutput += data
      onStream?.(data) // Real-time callback
    },
    onStderr: (data) => {
      console.error('[Agent Error]', data)
    },
  })

  return streamedOutput.trim()
}
```

---

## 9. Sources and References

### Official Documentation
- [E2B Streaming Documentation](https://e2b.dev/docs/commands/streaming)
- [E2B SDK Reference (Python)](https://e2b.dev/docs/sdk-reference/python-sdk/v2.2.4/sandbox_async)
- [E2B SDK Reference (JavaScript)](https://e2b.dev/docs/sdk-reference/js-sdk/v1.0.1/sandbox)
- [E2B Process API](https://e2b.dev/docs/sandbox/api/process)

### GitHub Resources
- [E2B Main Repository](https://github.com/e2b-dev/E2B)
- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter)
- [E2B Cookbook (Examples)](https://github.com/e2b-dev/e2b-cookbook)
- [Claude Agent Server (WebSocket Example)](https://github.com/dzhng/claude-agent-server)

### Blog Posts and Guides
- [Build AI Data Analyst with TypeScript and GPT-4o](https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o)
- [AI Data Analyst with LangChain & E2B](https://medium.com/e-two-b/ai-data-analyst-in-cloud-sandbox-with-langchain-e2b-68978cfe8c95)

### Technology Comparisons
- [Server-Sent Events vs WebSockets vs Long Polling (2025)](https://dev.to/haraf/server-sent-events-sse-vs-websockets-vs-long-polling-whats-best-in-2025-5ep8)
- [WebSocket vs Polling vs SSE](https://dev.to/abirk/websocket-vs-polling-vs-sse-17ii)
- [SSE's Comeback in 2025](https://portalzine.de/sses-glorious-comeback-why-2025-is-the-year-of-server-sent-events/)

### Package Documentation
- [E2B NPM Package](https://www.npmjs.com/package/e2b)
- [E2B Docker Integration](https://docs.docker.com/ai/mcp-catalog-and-toolkit/e2b-sandboxes/)

---

## 10. Quick Reference

### TypeScript Streaming Patterns

```typescript
// 1. Simple stdout streaming
await sandbox.commands.run('command', {
  onStdout: (data) => console.log(data)
})

// 2. Code execution streaming
await sandbox.runCode(code, {
  onStdout: (data) => handleOutput(data),
  onStderr: (error) => handleError(error),
})

// 3. Background process streaming
const handle = await sandbox.commands.run('command', {
  background: true,
  onStdout: (data) => streamData(data),
})

// 4. WebSocket streaming
const url = await sandbox.getHostURL(8000)
const ws = new WebSocket(url)
ws.on('message', (data) => process(data))
```

### Python Streaming Patterns

```python
# 1. Command streaming
sandbox.commands.run(
    'command',
    on_stdout=lambda data: print(data)
)

# 2. Code execution streaming
sandbox.run_code(
    code,
    on_stdout=lambda data: handle_output(data),
    on_stderr=lambda error: handle_error(error)
)

# 3. Background process streaming
handle = sandbox.commands.run(
    'command',
    background=True,
    on_stdout=lambda data: stream_data(data)
)

# 4. Structured output
import json

def emit(event_type, data):
    print(json.dumps({"type": event_type, "data": data}), flush=True)
```

---

## Conclusion

E2B provides robust, production-ready streaming capabilities for Python→TypeScript communication with:

- **150ms startup latency** for Firecracker microVMs
- **Real-time callback-based streaming** as the primary method
- **Multiple streaming options** (callbacks, WebSocket, HTTP, SSE)
- **Support for background processes** with stdin/stdout/stderr streaming
- **Rich output handling** for Jupyter-style code execution

The recommended approach is to use **callback handlers** (`onStdout`/`onStderr`) for most use cases, with WebSocket port forwarding reserved for complex bidirectional protocols.

For the Claude Agent SDK project, enhancing the existing implementation with streaming callbacks will provide real-time progress updates and better user experience for long-running agent tasks.
