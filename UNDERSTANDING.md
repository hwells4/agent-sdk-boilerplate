# Understanding This Project

A complete guide to what this TypeScript SDK does and why.

## The Problem

Claude is really smart, but it can't:
- Actually run code
- Read/write real files
- Execute bash commands
- Install packages
- Do anything that affects the real world

**Example conversation without this project:**

```
You: "Can you analyze my sales.csv file?"
Claude: "I can't actually read files. But I can tell you HOW to do it:
         1. Open the file in Excel
         2. Create a pivot table
         3. ..."
```

Not very helpful for automation!

## The Solution

This **TypeScript SDK** gives Claude actual superpowers by:

1. **Creating a sandbox** - A temporary Linux container where code can safely run
2. **Installing Claude Agent SDK** - Special version of Claude that can use tools
3. **Giving it tools** - Read files, write files, run bash, edit code, etc.
4. **Streaming results** - Real-time updates as the agent works
5. **Cleaning up** - Destroys the sandbox when done

**Same conversation WITH this project:**

```typescript
await runPythonAgent({
  prompt: "Can you analyze my sales.csv file?"
})

Claude Agent (in sandbox):
  ✓ Reads sales.csv using Python
  ✓ Runs pandas to analyze data
  ✓ Creates visualizations
  ✓ Writes report.pdf

Returns: "Here are your Q4 sales insights with 3 key trends..."
```

## What Actually Happens

Let's trace through a simple example: `"What is 2 + 2?"`

### Step 1: You trigger it with TypeScript

```typescript
import { runPythonAgent } from './examples/lib/agent'

const result = await runPythonAgent({
  prompt: "What is 2 + 2?",
  timeout: 120,
  verbose: true
})

console.log(result) // "4"
```

### Step 2: E2B creates a sandbox

```
┌─────────────────────────────────────┐
│  E2B Cloud Infrastructure           │
│                                     │
│  Spins up a fresh Linux container:  │
│  - Ubuntu base                      │
│  - Python 3.12 installed            │
│  - Claude Agent SDK installed       │
│  - All development tools ready      │
│                                     │
│  This happens in ~2-3 seconds       │
└─────────────────────────────────────┘
```

### Step 3: Agent code is injected

The TypeScript SDK writes this Python code into the sandbox:

```python
# This file is created: /home/user/agent.py

import asyncio
from claude_agent_sdk import query

async def main():
    result = None
    async for msg in query(prompt="What is 2 + 2?"):
        if hasattr(msg, "result"):
            result = msg.result
    if result:
        print(result)

asyncio.run(main())
```

### Step 4: The agent runs

Inside the sandbox, Python executes:

```bash
python3 /home/user/agent.py
```

The Claude Agent SDK:
- Connects to Claude's API using your OAuth token
- Sends the prompt: "What is 2 + 2?"
- Claude thinks and decides it needs to calculate
- Returns: "4"

### Step 5: Result streams back to TypeScript

```
Sandbox stdout: "4"
  ↓
E2B SDK captures it
  ↓
TypeScript receives it
  ↓
You see: "4"
```

### Step 6: Cleanup

```bash
Sandbox is destroyed
All files deleted
Clean slate for next run
```

## The Architecture

This is a **TypeScript-first** project with a simple architecture:

```
┌──────────────────────────────────────┐
│   Your TypeScript Application       │
│   - Next.js API routes               │
│   - Express servers                  │
│   - Node.js scripts                  │
│   - runPythonAgent() function        │
└─────────────┬────────────────────────┘
              │
              │ "Create sandbox and run this task"
              ↓
┌──────────────────────────────────────┐
│         E2B Cloud Service            │
│   Spins up container in ~2 seconds   │
└─────────────┬────────────────────────┘
              │
              ↓
┌──────────────────────────────────────┐
│      E2B Sandbox (Python)            │
│   ┌──────────────────────────────┐   │
│   │  Claude Agent SDK (Python)   │   │
│   │  - Full tool access          │   │
│   │  - Runs your prompt          │   │
│   │  - Streams results back      │   │
│   └──────────────────────────────┘   │
└─────────────┬────────────────────────┘
              │
              │ Returns result
              ↓
┌──────────────────────────────────────┐
│   Your TypeScript Application       │
│   Receives: "4"                      │
└──────────────────────────────────────┘
```

## Key Point: You Only Write TypeScript

**What you write:**
```typescript
// All your code is TypeScript
await runPythonAgent({ prompt: "Your task" })
```

**What the SDK handles for you:**
- Creating the sandbox
- Injecting Python agent code (you never see this)
- Running the agent
- Streaming results back
- Cleaning up

**You never need to write Python!** Unless you want to customize the E2B template.

## The Two Parts

### Part 1: The E2B Template (Built Once)

**Location:** `agents/base/`

This is a Docker container that gets built **one time** and reused forever.

**Build it:**
```bash
npm run build:template
```

**What it contains:**
- Ubuntu Linux
- Python 3.12 with Claude Agent SDK
- Development tools (git, curl, etc.)

**When you build it:**
- Creates template ID: `abc123-def456-...`
- Saved to your `.env` file
- Used by all future agent runs

**You don't touch this** unless you want custom tools in the sandbox.

### Part 2: The TypeScript SDK (What You Use)

**Location:** `examples/lib/agent.ts`

This is the TypeScript library you import into your projects.

**Three main functions:**

```typescript
// 1. Simple: Just get the result
const result = await runPythonAgent({
  prompt: "Your task"
})

// 2. Detailed: Get stdout, stderr, exit codes
const execution = await runPythonAgentDetailed({
  prompt: "Your task"
})

// 3. Streaming: Get real-time updates
const result = await runPythonAgentStreaming({
  prompt: "Your task",
  onStream: {
    onText: (text) => console.log(text),
    onToolUse: (tool) => console.log(`Using ${tool}`)
  }
})
```

## What Can Claude Agent SDK Actually Do?

Inside the sandbox, Claude has these **tools**:

### 1. **Read** - Read any file
```
You: "What's in config.json?"
Claude: *Uses Read tool*
Claude: "Your config has 3 settings: debug=true, port=8080..."
```

### 2. **Write** - Create new files
```
You: "Create a README.md"
Claude: *Uses Write tool*
Claude: "Created README.md with project overview"
```

### 3. **Edit** - Modify existing files
```
You: "Change the port to 3000"
Claude: *Uses Edit tool*
Claude: "Updated config.json, port is now 3000"
```

### 4. **Bash** - Execute shell commands
```
You: "Install pandas"
Claude: *Uses Bash tool: pip install pandas*
Claude: "Installed pandas 2.1.0"
```

### 5. **Glob** - Find files by pattern
```
You: "Find all TypeScript files"
Claude: *Uses Glob tool: **/*.ts*
Claude: "Found 15 TypeScript files"
```

### 6. **Grep** - Search file contents
```
You: "Find where we define the API key"
Claude: *Uses Grep tool*
Claude: "API_KEY defined in config.ts line 15"
```

## Real-World Use Cases

### Use Case 1: Next.js API Route

```typescript
// app/api/agent/route.ts
import { runPythonAgent } from '@/lib/agent'

export async function POST(req: Request) {
  const { prompt } = await req.json()

  const result = await runPythonAgent({
    prompt,
    timeout: 180
  })

  return Response.json({ result })
}
```

**Frontend:**
```typescript
const response = await fetch('/api/agent', {
  method: 'POST',
  body: JSON.stringify({
    prompt: 'Analyze the latest sales data'
  })
})

const { result } = await response.json()
```

### Use Case 2: Streaming to Browser

```typescript
// app/api/agent/stream/route.ts
import { runPythonAgentStreaming } from '@/lib/agent'

export async function POST(req: Request) {
  const { prompt } = await req.json()

  const stream = new ReadableStream({
    async start(controller) {
      await runPythonAgentStreaming({
        prompt,
        onStream: {
          onText: (text) => {
            const event = `data: ${JSON.stringify({ type: 'text', text })}\n\n`
            controller.enqueue(new TextEncoder().encode(event))
          },
          onResult: (result) => {
            const event = `data: ${JSON.stringify({ type: 'done', result })}\n\n`
            controller.enqueue(new TextEncoder().encode(event))
            controller.close()
          }
        }
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  })
}
```

**Frontend:**
```typescript
const eventSource = new EventSource('/api/agent/stream')

eventSource.addEventListener('message', (e) => {
  const { type, text, result } = JSON.parse(e.data)

  if (type === 'text') {
    setOutput(prev => prev + text)
  } else if (type === 'done') {
    setFinalResult(result)
    eventSource.close()
  }
})
```

### Use Case 3: Code Analysis

```typescript
const result = await runPythonAgent({
  prompt: "Analyze all TypeScript files and tell me which ones have security issues"
})
```

Claude will:
- Use Glob to find all .ts files
- Use Read to examine each file
- Use Grep to search for unsafe patterns
- Return a security report

### Use Case 4: Data Processing

```typescript
const result = await runPythonAgent({
  prompt: "Read sales.csv, calculate monthly totals, create a chart"
})
```

Claude will:
- Use Read to load sales.csv
- Use Bash to: `pip install pandas matplotlib`
- Write Python code to process data
- Use Write to save chart.png
- Return summary statistics

## Common Questions

### Q: Do I need Python installed?

**A:** No! Python only runs inside the E2B sandbox (in the cloud). Your local machine just needs Node.js.

The only exception: If you want to build custom E2B templates, you need Python 3.12+ to run `npm run build:template`.

### Q: What's the Python code in agents/base/?

**A:** That's the E2B template definition. It tells E2B how to build the sandbox container. You build it once (`npm run build:template`) and never touch it again.

### Q: Why does the function say "Python" in the name?

**A:** `runPythonAgent()` means "run an agent in a Python sandbox". The sandbox uses Python internally, but you're calling it from TypeScript.

We could rename it to `runAgent()` if that's clearer!

### Q: Can I customize what's in the sandbox?

**A:** Yes! Edit `agents/base/Dockerfile` to add tools, then rebuild:

```bash
npm run build:template
```

For example, add Node.js to the sandbox:
```dockerfile
RUN apt-get install -y nodejs npm
```

### Q: How much does E2B cost?

**A:** E2B has a free tier. Paid plans are pay-per-second of sandbox runtime. Check [e2b.dev/pricing](https://e2b.dev/pricing).

### Q: Can I run this in production?

**A:** Yes! But consider:
- Add error handling for sandbox failures
- Implement rate limiting on API routes
- Monitor E2B usage and costs
- Set appropriate timeouts
- Handle long-running tasks appropriately

### Q: What about streaming?

**A:** This SDK has **full streaming support**:

```typescript
await runPythonAgentStreaming({
  prompt: "Your task",
  onStream: {
    onText: (text) => console.log(text),
    onToolUse: (tool) => console.log(`Using ${tool}`),
    onResult: (result, duration, cost) => {
      console.log(`Done: ${result}`)
      console.log(`${duration}ms, $${cost}`)
    }
  }
})
```

Perfect for:
- Next.js streaming responses
- Real-time UI updates
- Server-Sent Events (SSE)
- WebSocket connections

### Q: How is this different from the Claude API?

**A:**

| Feature | Claude API | This SDK |
|---------|-----------|----------|
| **Tool use** | Simulated | Real execution |
| **File access** | No | Yes |
| **Bash commands** | No | Yes |
| **Isolation** | N/A | Full sandbox |
| **Streaming** | Text only | Tools + text + thinking |
| **Multi-step** | Single turn | Multi-turn agent |

The Claude API can *suggest* tool calls. This SDK *actually executes* them.

## Quick Reference

### Installation
```bash
npm install
npm run build:template  # One-time setup
```

### Basic Usage
```typescript
import { runPythonAgent } from './examples/lib/agent'

const result = await runPythonAgent({
  prompt: "Your task here",
  timeout: 120,
  verbose: true
})
```

### Streaming Usage
```typescript
import { runPythonAgentStreaming } from './examples/lib/agent'

const result = await runPythonAgentStreaming({
  prompt: "Your task",
  onStream: {
    onText: (text) => console.log(text),
    onToolUse: (id, tool, input) => console.log(`🔧 ${tool}`),
    onResult: (result, duration, cost) => {
      console.log(`✅ ${result}`)
    }
  }
})
```

### Next.js Integration
```typescript
// app/api/agent/route.ts
import { runPythonAgent } from '@/lib/agent'

export async function POST(req: Request) {
  const { prompt } = await req.json()
  const result = await runPythonAgent({ prompt })
  return Response.json({ result })
}
```

### Examples
```bash
npm run example           # Basic TypeScript example
npm run streaming         # Streaming demo
npm run console-streaming # Colored console output
npm run sse-api          # Web UI with SSE streaming
```

## Summary

**This is a TypeScript SDK** that lets you:
- ✅ Run Claude agents with real tool access
- ✅ Get real-time streaming updates
- ✅ Integrate easily with Next.js/React
- ✅ Execute code in isolated sandboxes
- ✅ No Python knowledge required

**You write TypeScript.** The SDK handles everything else.

**Perfect for:**
- Next.js applications
- Express APIs
- Automated code analysis
- Data processing pipelines
- AI-powered developer tools

Still have questions? Check the examples in `examples/` or read the full [README.md](./README.md)!
