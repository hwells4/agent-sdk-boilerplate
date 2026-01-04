/**
 * Server-Sent Events (SSE) Streaming API Example
 *
 * This demonstrates how to stream E2B sandbox output to web clients
 * using Server-Sent Events (SSE) - perfect for AI agent streaming in 2025.
 *
 * Run this example:
 *   npm install express
 *   npx tsx examples/sse-streaming-api.ts
 *
 * Then open your browser to:
 *   http://localhost:3000
 */

import 'dotenv/config'
import { Sandbox } from '@e2b/code-interpreter'
import express, { Request, Response } from 'express'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

/**
 * Serve a simple HTML client for testing
 */
app.get('/', (_req: Request, res: Response) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>E2B Streaming Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .prompt-input {
            width: 100%;
            padding: 12px;
            font-size: 14px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        button {
            background: #007bff;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
        }
        button:hover { background: #0056b3; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        #output {
            margin-top: 20px;
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
            border-radius: 4px;
            min-height: 300px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            white-space: pre-wrap;
            overflow-y: auto;
            max-height: 500px;
        }
        .status { color: #4caf50; }
        .error { color: #f44336; }
        .chunk { color: #2196f3; }
        .progress { color: #ff9800; }
        .event-text { color: #e0e0e0; }
        .event-thinking { color: #ba68c8; font-style: italic; }
        .event-tool_use { color: #ffd54f; font-weight: bold; }
        .event-tool_result { color: #64b5f6; }
        .event-error { color: #f44336; font-weight: bold; }
        .event-result { color: #81c784; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>E2B Streaming Demo</h1>
        <p>Test real-time streaming from Python code in E2B sandboxes</p>

        <textarea class="prompt-input" id="prompt" rows="3" placeholder="Enter your prompt...">Calculate the first 10 fibonacci numbers</textarea>

        <button onclick="streamBasicCommand()">Stream Command</button>
        <button onclick="streamPythonCode()">Stream Python Code</button>
        <button onclick="streamStructuredData()">Stream Structured Data</button>
        <button onclick="streamAgent()">Stream Claude Agent</button>
        <button onclick="clearOutput()">Clear</button>

        <div id="output"></div>
    </div>

    <script>
        const output = document.getElementById('output');
        let eventSource = null;

        function addOutput(text, className = '') {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = text + '\\n';
            output.appendChild(span);
            output.scrollTop = output.scrollHeight;
        }

        function clearOutput() {
            output.innerHTML = '';
        }

        function closeEventSource() {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
        }

        async function streamBasicCommand() {
            closeEventSource();
            clearOutput();
            addOutput('Connecting to stream...', 'status');

            eventSource = new EventSource('/api/stream/command');

            eventSource.addEventListener('stdout', (e) => {
                addOutput('STDOUT: ' + e.data);
            });

            eventSource.addEventListener('stderr', (e) => {
                addOutput('STDERR: ' + e.data, 'error');
            });

            eventSource.addEventListener('complete', (e) => {
                addOutput('\\nStream complete!', 'status');
                closeEventSource();
            });

            eventSource.addEventListener('error', (e) => {
                addOutput('\\nConnection error', 'error');
                closeEventSource();
            });
        }

        async function streamPythonCode() {
            closeEventSource();
            clearOutput();
            addOutput('Connecting to stream...', 'status');

            const prompt = document.getElementById('prompt').value;
            eventSource = new EventSource('/api/stream/python?prompt=' + encodeURIComponent(prompt));

            eventSource.addEventListener('chunk', (e) => {
                const span = document.createElement('span');
                span.className = 'chunk';
                span.textContent = e.data;
                output.appendChild(span);
                output.scrollTop = output.scrollHeight;
            });

            eventSource.addEventListener('error_msg', (e) => {
                addOutput('\\nError: ' + e.data, 'error');
            });

            eventSource.addEventListener('complete', (e) => {
                addOutput('\\n\\nStream complete!', 'status');
                closeEventSource();
            });

            eventSource.onerror = () => {
                addOutput('\\nConnection error', 'error');
                closeEventSource();
            };
        }

        async function streamStructuredData() {
            closeEventSource();
            clearOutput();
            addOutput('Connecting to stream...', 'status');

            eventSource = new EventSource('/api/stream/structured');

            eventSource.addEventListener('start', (e) => {
                const data = JSON.parse(e.data);
                addOutput('Started: ' + data.message, 'status');
            });

            eventSource.addEventListener('progress', (e) => {
                const data = JSON.parse(e.data);
                addOutput(\`Progress: \${data.percent}% - \${data.status}\`, 'progress');
            });

            eventSource.addEventListener('result', (e) => {
                const data = JSON.parse(e.data);
                addOutput('Result: ' + JSON.stringify(data, null, 2), 'chunk');
            });

            eventSource.addEventListener('complete', (e) => {
                addOutput('\\nStream complete!', 'status');
                closeEventSource();
            });

            eventSource.onerror = () => {
                addOutput('\\nConnection error', 'error');
                closeEventSource();
            };
        }

        async function streamAgent() {
            closeEventSource();
            clearOutput();
            addOutput('Connecting to Claude Agent stream...', 'status');

            const prompt = document.getElementById('prompt').value;

            // Use fetch to POST the prompt, then connect to SSE
            try {
                const response = await fetch('/api/stream/agent/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });

                const { sessionId } = await response.json();

                eventSource = new EventSource('/api/stream/agent/' + sessionId);

                eventSource.addEventListener('start', (e) => {
                    addOutput('🚀 Agent started', 'status');
                });

                eventSource.addEventListener('text', (e) => {
                    const data = JSON.parse(e.data);
                    addOutput('💬 ' + data.text, 'event-text');
                });

                eventSource.addEventListener('thinking', (e) => {
                    const data = JSON.parse(e.data);
                    const preview = data.thinking.substring(0, 100);
                    addOutput('🤔 Thinking: ' + preview + '...', 'event-thinking');
                });

                eventSource.addEventListener('tool_use', (e) => {
                    const data = JSON.parse(e.data);
                    const inputStr = JSON.stringify(data.input).substring(0, 100);
                    addOutput(\`🔧 Tool: \${data.name}(\${inputStr})\`, 'event-tool_use');
                });

                eventSource.addEventListener('tool_result', (e) => {
                    const data = JSON.parse(e.data);
                    const preview = data.content?.substring(0, 80) || '';
                    addOutput('📦 Result: ' + preview + '...', 'event-tool_result');
                });

                eventSource.addEventListener('error', (e) => {
                    const data = JSON.parse(e.data);
                    addOutput('❌ Error: ' + data.message, 'event-error');
                });

                eventSource.addEventListener('result', (e) => {
                    const data = JSON.parse(e.data);
                    const duration = (data.duration_ms / 1000).toFixed(2);
                    const cost = data.cost?.toFixed(4) || 'N/A';
                    addOutput(\`✅ Complete (\${duration}s, $\${cost})\`, 'event-result');
                });

                eventSource.addEventListener('complete', (e) => {
                    const data = JSON.parse(e.data);
                    addOutput('\\n✨ Agent finished: ' + data.status, 'status');
                    closeEventSource();
                });

                eventSource.onerror = () => {
                    addOutput('\\nConnection error', 'error');
                    closeEventSource();
                };
            } catch (error) {
                addOutput('Failed to start agent: ' + error.message, 'error');
            }
        }
    </script>
</body>
</html>
  `)
})

/**
 * SSE endpoint for streaming basic commands
 */
app.get('/api/stream/command', async (_req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    const sandbox = await Sandbox.create()

    await sandbox.commands.run(
      'for i in {1..10}; do echo "Processing item $i"; sleep 0.5; done',
      {
        onStdout: (data) => {
          res.write(`event: stdout\ndata: ${data.trim()}\n\n`)
        },
        onStderr: (data) => {
          res.write(`event: stderr\ndata: ${data.trim()}\n\n`)
        },
      }
    )

    await sandbox.kill()
    res.write('event: complete\ndata: success\n\n')
    res.end()
  } catch (error) {
    res.write(
      `event: error\ndata: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`
    )
    res.end()
  }
})

/**
 * SSE endpoint for streaming Python code execution
 */
app.get('/api/stream/python', async (req: Request, res: Response) => {
  const prompt = (req.query.prompt as string) || 'Calculate 2 + 2'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    const sandbox = await Sandbox.create()

    const pythonCode = `
import time

print("Starting computation...", flush=True)
time.sleep(1)

# Simulate processing the prompt: ${prompt.replace(/['"]/g, '')}
print("Processing your request...", flush=True)
time.sleep(1)

print("Generating response...", flush=True)
time.sleep(1)

print("Complete!", flush=True)
`

    await sandbox.runCode(pythonCode, {
      onStdout: (data) => {
        res.write(`event: chunk\ndata: ${data}\n\n`)
      },
      onStderr: (data) => {
        res.write(`event: error_msg\ndata: ${data}\n\n`)
      },
      onError: (error) => {
        res.write(`event: error_msg\ndata: ${JSON.stringify(error)}\n\n`)
      },
    })

    await sandbox.kill()
    res.write('event: complete\ndata: success\n\n')
    res.end()
  } catch (error) {
    res.write(
      `event: error\ndata: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`
    )
    res.end()
  }
})

/**
 * SSE endpoint for streaming structured data
 */
app.get('/api/stream/structured', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    const sandbox = await Sandbox.create()

    const pythonCode = `
import json
import time

def emit(event_type: str, data: dict):
    event = {
        "type": event_type,
        "data": data
    }
    print(json.dumps(event), flush=True)

emit("start", {"message": "Data analysis initiated"})
time.sleep(0.5)

emit("progress", {"percent": 20, "status": "Loading dataset"})
time.sleep(0.5)

emit("progress", {"percent": 40, "status": "Cleaning data"})
time.sleep(0.5)

emit("progress", {"percent": 60, "status": "Running analysis"})
time.sleep(0.5)

emit("progress", {"percent": 80, "status": "Generating insights"})
time.sleep(0.5)

emit("result", {
    "mean": 42.5,
    "median": 40.0,
    "std_dev": 12.3,
    "sample_size": 1000
})
time.sleep(0.5)

emit("complete", {"duration": 2.5, "status": "success"})
`

    await sandbox.runCode(pythonCode, {
      onStdout: (data) => {
        try {
          const event = JSON.parse(data.trim())
          // Forward the event to the client with its type
          res.write(
            `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
          )
        } catch (e) {
          // Non-JSON output
          res.write(`event: stdout\ndata: ${data}\n\n`)
        }
      },
      onStderr: (data) => {
        res.write(`event: stderr\ndata: ${data}\n\n`)
      },
    })

    await sandbox.kill()
    res.write('event: complete\ndata: success\n\n')
    res.end()
  } catch (error) {
    res.write(
      `event: error\ndata: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`
    )
    res.end()
  }
})

// Store active agent sessions (in production, use Redis or similar)
const agentSessions = new Map<string, { prompt: string; timestamp: number }>()

/**
 * Initialize a Claude Agent streaming session
 */
app.post('/api/stream/agent/init', async (req: Request, res: Response) => {
  const { prompt } = req.body

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' })
    return
  }

  const sessionId = Math.random().toString(36).substring(7)
  agentSessions.set(sessionId, { prompt, timestamp: Date.now() })

  // Clean up old sessions (older than 5 minutes)
  for (const [id, session] of agentSessions.entries()) {
    if (Date.now() - session.timestamp > 300000) {
      agentSessions.delete(id)
    }
  }

  res.json({ sessionId })
})

/**
 * SSE endpoint for streaming Claude Agent responses with full event types
 */
app.get('/api/stream/agent/:sessionId', async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId
  const session = agentSessions.get(sessionId)

  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  const { prompt } = session
  agentSessions.delete(sessionId) // One-time use

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const templateId = process.env.E2B_TEMPLATE_ID
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

  if (!templateId || !oauthToken) {
    res.write(
      'event: error\ndata: {"error": "configuration", "message": "E2B_TEMPLATE_ID or CLAUDE_CODE_OAUTH_TOKEN not set"}\n\n'
    )
    res.end()
    return
  }

  try {
    const sandbox = await Sandbox.create(templateId, {
      timeoutMs: 120000,
    })

    await sandbox.commands.run(`export CLAUDE_CODE_OAUTH_TOKEN="${oauthToken}"`)

    // Enhanced Python streaming agent code with all event types
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

    // Line buffering for SSE
    let buffer = ''

    await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
      timeoutMs: 120000,
      onStdout: (data) => {
        buffer += data
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        lines.forEach((line) => {
          if (!line.trim()) return

          try {
            const event = JSON.parse(line)
            // Forward event to SSE client
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          } catch (e) {
            // Non-JSON output
            res.write(`event: raw\ndata: ${line}\n\n`)
          }
        })
      },
      onStderr: (data) => {
        res.write(`event: stderr\ndata: ${data}\n\n`)
      },
    })

    await sandbox.kill()
    res.write('event: done\ndata: success\n\n')
    res.end()
  } catch (error) {
    res.write(
      `event: error\ndata: ${JSON.stringify({ error: "exception", message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
    )
    res.end()
  }
})

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    e2b_configured: !!process.env.E2B_TEMPLATE_ID,
    claude_configured: !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
  })
})

/**
 * Start the server
 */
function startServer() {
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60))
    console.log('🚀 E2B Streaming API Server')
    console.log('='.repeat(60))
    console.log(`\n📡 Server running at: http://localhost:${PORT}`)
    console.log(`🏥 Health check: http://localhost:${PORT}/health`)
    console.log(`\n🌐 Open http://localhost:${PORT} in your browser to test\n`)
    console.log('Available endpoints:')
    console.log('  GET  /api/stream/command       - Stream shell command output')
    console.log('  GET  /api/stream/python        - Stream Python code execution')
    console.log('  GET  /api/stream/structured    - Stream structured data')
    console.log('  POST /api/stream/agent/init    - Initialize Claude agent session')
    console.log('  GET  /api/stream/agent/:id     - Stream Claude agent responses')
    console.log('\n' + '='.repeat(60) + '\n')
  })
}

// Start server if executed directly
if (require.main === module) {
  startServer()
}

export { app, startServer }
