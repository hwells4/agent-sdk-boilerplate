# E2B Streaming Examples

This directory contains practical examples demonstrating how to stream data from Python code running in E2B sandboxes to TypeScript/Node.js applications.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Streaming Examples

```bash
# Basic streaming examples
npm run ts:streaming

# Server-Sent Events API server
npm run ts:sse-api
```

## Available Examples

### 1. Basic Streaming (`streaming_example.ts`)

Demonstrates fundamental streaming patterns:

```bash
npm run ts:streaming
```

**What it covers:**
- Basic stdout/stderr streaming
- Python code execution with streaming
- Structured JSON streaming
- Background process streaming
- Parallel task streaming
- Error handling
- Claude Agent streaming (if configured)

**Example output:**
```
=============================================================
Example 1: Basic Streaming
=============================================================

Running command with streaming output...

[STDOUT] Line 1
[STDOUT] Line 2
[STDOUT] Line 3
...
```

### 2. SSE Streaming API (`sse-streaming-api.ts`)

Production-ready Server-Sent Events API for web applications:

```bash
npm run ts:sse-api
```

Then open your browser to `http://localhost:3000` to test the interactive demo.

**Features:**
- Server-Sent Events (SSE) for real-time streaming to web clients
- Interactive HTML client for testing
- Multiple streaming endpoints
- Claude Agent integration (optional)

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /` | GET | Interactive HTML demo |
| `GET /api/stream/command` | GET | Stream shell command output |
| `GET /api/stream/python?prompt=...` | GET | Stream Python code execution |
| `GET /api/stream/structured` | GET | Stream structured JSON events |
| `POST /api/stream/agent` | POST | Stream Claude Agent responses |
| `GET /health` | GET | Health check endpoint |

**Example client code:**

```javascript
const eventSource = new EventSource('/api/stream/python?prompt=Calculate fibonacci')

eventSource.addEventListener('chunk', (e) => {
  console.log('Received:', e.data)
})

eventSource.addEventListener('complete', (e) => {
  console.log('Stream complete!')
  eventSource.close()
})
```

## Streaming Patterns

### Pattern 1: Real-Time Command Output

Stream output from any shell command as it executes:

```typescript
import { Sandbox } from '@e2b/code-interpreter'

const sandbox = await Sandbox.create()

await sandbox.commands.run('long-running-command', {
  onStdout: (data) => {
    console.log('STDOUT:', data)
  },
  onStderr: (data) => {
    console.error('STDERR:', data)
  },
})
```

**Use cases:**
- Build processes
- Package installations
- Data processing pipelines
- System commands

### Pattern 2: Python Code Streaming

Stream output from Python code execution:

```typescript
const pythonCode = `
import time
for i in range(10):
    print(f"Processing {i}", flush=True)
    time.sleep(0.5)
`

await sandbox.runCode(pythonCode, {
  onStdout: (data) => console.log(data),
  onStderr: (data) => console.error(data),
  onError: (error) => console.error('Execution error:', error),
})
```

**Use cases:**
- Data analysis
- Machine learning model training
- Scientific computations
- AI agent execution

### Pattern 3: Structured Event Streaming

Stream structured JSON events for complex workflows:

```typescript
// Python side
const pythonCode = `
import json

def emit(event_type: str, data: dict):
    print(json.dumps({"type": event_type, "data": data}), flush=True)

emit("progress", {"percent": 50})
emit("result", {"value": 42})
emit("complete", {})
`

// TypeScript side
await sandbox.runCode(pythonCode, {
  onStdout: (data) => {
    const event = JSON.parse(data)

    switch (event.type) {
      case 'progress':
        updateProgress(event.data.percent)
        break
      case 'result':
        handleResult(event.data.value)
        break
      case 'complete':
        finalize()
        break
    }
  },
})
```

**Use cases:**
- Progress tracking
- Multi-stage workflows
- Event-driven architectures
- Complex state management

### Pattern 4: Background Process Streaming

Run long-running processes in the background while streaming output:

```typescript
const handle = await sandbox.commands.run('python long_task.py', {
  background: true,
  timeout: 0, // No timeout
  onStdout: (data) => processStreamingData(data),
})

// Continue with other work
console.log('Doing other things...')

// Check back later
const result = await handle.wait()
```

**Use cases:**
- Database migrations
- Large file processing
- Model training
- Batch operations

### Pattern 5: Server-Sent Events (Web)

Stream data to web clients using SSE:

```typescript
// Express.js endpoint
app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sandbox = await Sandbox.create()

  await sandbox.runCode(pythonCode, {
    onStdout: (data) => {
      res.write(`data: ${data}\n\n`)
    },
  })

  res.end()
  await sandbox.kill()
})
```

**Use cases:**
- Real-time dashboards
- Live code execution interfaces
- AI chatbots
- Progress monitoring UIs

## Architecture

### How Streaming Works

```
┌─────────────────────────────────────────────────────────┐
│ Client (Browser/Node.js)                                │
│                                                          │
│  - Receives SSE/WebSocket events                        │
│  - Processes streaming data                             │
│  - Updates UI in real-time                              │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/SSE/WebSocket
┌────────────────────▼────────────────────────────────────┐
│ TypeScript/Node.js Application                          │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ E2B SDK (@e2b/code-interpreter)                │    │
│  │                                                 │    │
│  │  - onStdout callback                           │    │
│  │  - onStderr callback                           │    │
│  │  - Forwards to client                          │    │
│  └──────────────────┬──────────────────────────────┘    │
└─────────────────────┼──────────────────────────────────┘
                      │ WebSocket/HTTP
┌─────────────────────▼──────────────────────────────────┐
│ E2B Sandbox (Firecracker microVM)                       │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Python Process                                 │    │
│  │                                                 │    │
│  │  - Executes code                               │    │
│  │  - print(..., flush=True)                      │    │
│  │  - Streams output immediately                  │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Performance Characteristics

- **Sandbox startup:** ~150ms (Firecracker microVM)
- **Streaming latency:** <10ms per chunk
- **Network overhead:** Minimal (WebSocket)
- **Throughput:** Thousands of events/second

## Best Practices

### 1. Always Flush Output in Python

```python
# DO: Flush immediately for real-time streaming
print("message", flush=True)

# DON'T: Python buffers output by default
print("message")  # May be delayed
```

### 2. Use Structured Output

```python
# DO: Use JSON for complex data
import json
print(json.dumps({"type": "result", "value": 42}), flush=True)

# DON'T: Use unstructured strings
print("Result: 42")  # Hard to parse
```

### 3. Handle Errors Gracefully

```typescript
await sandbox.runCode(code, {
  onStdout: (data) => handleOutput(data),
  onStderr: (data) => {
    // Log but don't throw - stderr doesn't mean failure
    console.error('Warning:', data)
  },
  onError: (error) => {
    // Handle actual execution errors
    handleError(error)
  },
})
```

### 4. Set Appropriate Timeouts

```typescript
// For long-running tasks
const handle = await sandbox.commands.run('long_task.py', {
  background: true,
  timeout: 0, // Disable timeout
})

// For quick tasks
await sandbox.runCode(code, {
  timeout: 30, // 30 second timeout
})
```

### 5. Clean Up Resources

```typescript
try {
  await sandbox.runCode(code, { onStdout: handleOutput })
} finally {
  await sandbox.kill() // Always clean up
}
```

### 6. Monitor for Stalls

```typescript
let lastHeartbeat = Date.now()

await sandbox.commands.run('long_task.py', {
  onStdout: (data) => {
    lastHeartbeat = Date.now()
    processData(data)
  },
})

// Check for stalls
setInterval(() => {
  if (Date.now() - lastHeartbeat > 30000) {
    console.error('Process appears stalled')
  }
}, 10000)
```

## Common Use Cases

### Use Case 1: AI Agent with Progress Updates

```typescript
const pythonCode = `
import asyncio
import json
from claude_agent_sdk import query

async def main():
    print(json.dumps({"type": "start"}), flush=True)

    result = None
    async for msg in query(prompt="Analyze this data..."):
        if hasattr(msg, "content"):
            print(json.dumps({"type": "chunk", "data": msg.content}), flush=True)
        if hasattr(msg, "result"):
            result = msg.result

    print(json.dumps({"type": "complete", "data": result}), flush=True)

asyncio.run(main())
`
```

### Use Case 2: Data Pipeline with Stages

```typescript
const pipeline = `
import json

def emit(stage, status, progress=None):
    print(json.dumps({
        "stage": stage,
        "status": status,
        "progress": progress
    }), flush=True)

emit("extract", "started")
# ... extract data
emit("extract", "complete", 100)

emit("transform", "started")
# ... transform data
emit("transform", "complete", 100)

emit("load", "started")
# ... load data
emit("load", "complete", 100)
`
```

### Use Case 3: Real-Time Logs Aggregation

```typescript
const logsBuffer: string[] = []

await sandbox.commands.run('tail -f /var/log/app.log', {
  background: true,
  onStdout: (data) => {
    logsBuffer.push(data)

    // Send to monitoring service
    sendToMonitoring(data)

    // Stream to clients
    broadcastToClients('log', data)
  },
})
```

## Troubleshooting

### Problem: No output appears

**Solution:** Make sure Python code flushes output:
```python
print("message", flush=True)
```

### Problem: Output appears in chunks instead of real-time

**Solution:**
1. Use `flush=True` in Python
2. Check network latency
3. Verify SSE headers are correct

### Problem: Connection drops during long operations

**Solution:**
1. Set `timeout: 0` for background processes
2. Implement heartbeat mechanism
3. Use WebSocket for bidirectional keep-alive

### Problem: JSON parsing errors

**Solution:**
```typescript
try {
  const event = JSON.parse(data)
  handleEvent(event)
} catch (e) {
  // Handle non-JSON output gracefully
  console.log('Non-JSON output:', data)
}
```

## Related Documentation

- [E2B Streaming Research](./E2B_STREAMING_RESEARCH.md) - Comprehensive research on streaming methods
- [E2B Official Docs](https://e2b.dev/docs) - Official E2B documentation
- [Server-Sent Events Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html) - SSE specification

## License

MIT

## Contributing

Contributions are welcome! Please submit pull requests or open issues for improvements.
