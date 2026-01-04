# TypeScript Quick Start Guide

This guide shows how to use **TypeScript** to orchestrate **Python-based** Claude agents running in E2B sandboxes.

## Why This Hybrid Approach?

| Component | Language | Why? |
|-----------|----------|------|
| **Your App** | TypeScript/Next.js | Modern web framework, great DX |
| **E2B Orchestration** | TypeScript | Native integration with your app |
| **Agent Sandbox** | Python | Better Claude SDK docs, stable tooling |
| **Claude Agent SDK** | Python | Most mature and well-documented version |

**Bottom line**: You get TypeScript web integration + Python's mature Claude SDK.

## Setup

### 1. Prerequisites

Make sure you've run the Python setup first (builds the E2B template):

```bash
./setup.sh
npm run build:template  # Builds Python-based E2B template
```

This creates a Python sandbox template that you'll trigger from TypeScript.

### 2. Install TypeScript Dependencies

```bash
npm install
```

This installs:
- `@e2b/code-interpreter` - E2B TypeScript SDK
- `dotenv` - Environment variable management
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution

### 3. Environment Variables

Your `.env` should already have these from the Python setup:

```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...
E2B_API_KEY=e2b_...
E2B_TEMPLATE_ID=your-template-id  # From build:template
```

## Usage Examples

### Basic TypeScript Script

```bash
npm run ts:example
```

This runs `examples/basic_typescript.ts` which demonstrates:
- Simple agent execution
- Detailed results with exit codes
- File operations in sandboxes
- Code generation
- Sequential task execution

### Programmatic Usage

```typescript
import 'dotenv/config'
import { runPythonAgent } from './examples/lib/agent'

async function main() {
  const result = await runPythonAgent({
    prompt: 'Calculate the factorial of 10',
    timeout: 120,
    verbose: true
  })

  console.log('Result:', result)
}

main()
```

### Next.js Integration

#### Step 1: Copy the agent library to your Next.js project

```bash
# In your Next.js project
mkdir -p lib
cp examples/lib/agent.ts lib/agent.ts
```

#### Step 2: Create an API route

```typescript
// app/api/agent/route.ts (Next.js 13+ App Router)
import { runPythonAgent } from '@/lib/agent'

export async function POST(req: Request) {
  try {
    const { prompt, timeout = 120 } = await req.json()

    const result = await runPythonAgent({
      prompt,
      timeout,
      verbose: false
    })

    return Response.json({ success: true, result })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

#### Step 3: Call from your React component

```typescript
'use client'

import { useState } from 'react'

export default function AgentChat() {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const runAgent = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, timeout: 180 })
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.result)
      } else {
        setResult(`Error: ${data.error}`)
      }
    } catch (error) {
      setResult(`Request failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      <h1>Claude Agent Demo</h1>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter your prompt..."
        className="w-full p-2 border rounded"
        rows={4}
      />

      <button
        onClick={runAgent}
        disabled={loading || !prompt}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Running Agent...' : 'Run Agent'}
      </button>

      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h2 className="font-bold">Result:</h2>
          <pre className="whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  )
}
```

## How It Works

### Architecture Flow

```
┌─────────────────────────────────────┐
│  Your Next.js App (TypeScript)      │
│  - React components                 │
│  - API routes                       │
│  - E2B TypeScript SDK               │
└──────────────┬──────────────────────┘
               │
               │ Sandbox.create()
               │ (TypeScript SDK call)
               │
               v
┌─────────────────────────────────────┐
│  E2B Cloud                          │
│  - Spins up container               │
│  - Uses your template ID            │
└──────────────┬──────────────────────┘
               │
               v
┌─────────────────────────────────────┐
│  E2B Sandbox Container (Python)     │
│  ┌───────────────────────────────┐  │
│  │  Your Python agent code       │  │
│  │  - Claude Agent SDK (Python)  │  │
│  │  - Full tool access           │  │
│  │  - Runs your prompt           │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ Returns stdout/stderr
               │
               v
┌─────────────────────────────────────┐
│  Your Next.js App                   │
│  - Receives result                  │
│  - Displays to user                 │
└─────────────────────────────────────┘
```

### What Happens When You Call `runPythonAgent()`?

1. **TypeScript function is called** in your Next.js app
2. **E2B TypeScript SDK** creates a sandbox from your template
3. **Python environment** spins up inside the container
4. **Python agent code** is written to `/home/user/agent.py`
5. **Python executes**: `python3 /home/user/agent.py`
6. **Claude Agent SDK** (Python) processes your prompt
7. **Result returns** through E2B SDK back to TypeScript
8. **Sandbox is destroyed** (cleanup)

## Common Patterns

### Pattern 1: Simple Query

```typescript
const answer = await runPythonAgent({
  prompt: 'What is 2 + 2?',
  timeout: 60
})
```

### Pattern 2: Code Generation

```typescript
const code = await runPythonAgent({
  prompt: 'Write a Python function to sort a list using quicksort',
  timeout: 120
})
```

### Pattern 3: File Operations

```typescript
const result = await runPythonAgent({
  prompt: 'Create a CSV file with sample user data and show me the first 5 rows',
  timeout: 90
})
```

### Pattern 4: Detailed Execution

```typescript
import { runPythonAgentDetailed } from './lib/agent'

const execution = await runPythonAgentDetailed({
  prompt: 'Your task',
  verbose: true
})

if (execution.exitCode === 0) {
  console.log('Success:', execution.stdout)
} else {
  console.error('Failed:', execution.stderr)
}
```

## Troubleshooting

### "E2B_TEMPLATE_ID not set"

You need to build the Python template first:

```bash
npm run build:template
```

### "Module not found: @e2b/code-interpreter"

Install TypeScript dependencies:

```bash
npm install
```

### "Invalid OAuth token"

Regenerate your Claude token:

```bash
claude setup-token
# Copy to .env
```

### Template builds are slow

First build is slow (installs everything). Subsequent builds use caching.

### Sandbox creation times out

Increase the timeout:

```typescript
await runPythonAgent({
  prompt: 'Your task',
  timeout: 300  // 5 minutes
})
```

## Next Steps

- See `examples/nextjs-api-route.ts` for complete Next.js examples
- Check `examples/lib/agent.ts` to customize the agent library
- Read the main README.md for Python examples and template building

## FAQ

**Q: Can I use the TypeScript Claude Agent SDK instead?**

A: Yes, but the Python SDK has better docs and is more stable. This hybrid approach gives you the best of both.

**Q: Do I need Python installed locally to run TypeScript code?**

A: No! Python only runs **inside the E2B sandbox**. Your local machine just needs Node.js.

**Q: Can I modify the Python agent code?**

A: Yes! Edit `examples/lib/agent.ts` and change the `pythonAgentCode` variable.

**Q: How do I add Python dependencies to the sandbox?**

A: Rebuild the template with your dependencies in `agents/base/Dockerfile`.

**Q: Can I use this in production?**

A: Yes, but consider:
- Error handling for sandbox failures
- Rate limiting on your API routes
- Monitoring sandbox usage/costs
- Timeout management for long tasks
