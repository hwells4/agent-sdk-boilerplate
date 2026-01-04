# Claude Agent SDK Experiments

> TypeScript library for orchestrating Claude agents in isolated E2B sandboxes with full streaming support

This project provides a **TypeScript SDK** for running [Claude agents](https://platform.claude.com/docs/agent-sdk) in isolated [E2B sandboxes](https://e2b.dev/). Perfect for Next.js applications, API routes, and server-side agent orchestration.

## Features

- **🎯 TypeScript-First**: Native TypeScript SDK for seamless integration
- **🌊 Real-Time Streaming**: SSE and WebSocket support for live agent responses
- **🔒 Isolated Execution**: Run agents in secure E2B sandbox containers
- **🛠️ Full Tool Access**: Agents can use Read, Write, Edit, Glob, Grep, and Bash tools
- **📦 Reproducible**: Pre-built templates ensure consistent environments
- **⚡ Fast Startup**: Sandboxes spin up in seconds
- **🚀 Next.js Ready**: Drop-in support for App Router and Pages Router

## Why This Project?

This SDK lets you run Claude agents in isolated sandboxes from your TypeScript/Next.js applications with full streaming support. The agents run in E2B containers with complete tool access (file operations, bash, etc.) and stream results back in real-time.

**Architecture**: You write TypeScript code that orchestrates Python-based agents running in E2B sandboxes. The Python runtime is pre-configured and isolated - you never need to write Python code unless you're building custom templates.

| **What you write** | **What runs in sandbox** | **What you get** |
|-------------------|-------------------------|------------------|
| TypeScript (Next.js API routes, Express servers, Node.js scripts) | Python (Claude Agent SDK - pre-configured) | Full streaming, isolated execution, perfect web integration |

## Quick Start

```bash
# 1. Clone and enter the repository
git clone https://github.com/your-username/claude-agent-sdk-experiments.git
cd claude-agent-sdk-experiments

# 2. Run automated setup (handles everything!)
npm setup

# 3. Run your first agent!
npm run example
```

The `npm setup` command automatically:
- Installs all dependencies
- Authenticates with Claude (OAuth token)
- Authenticates with E2B (API key)
- Builds the E2B sandbox template
- Saves everything to `.env`

## Table of Contents

- [Why This Project?](#why-this-project)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Examples](#examples)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Resources](#resources)
- [License](#license)

## Installation

### Prerequisites

- **Node.js 18+** - For TypeScript runtime and dependencies
- **Claude Max subscription** - For OAuth token access
- **E2B account** - Free tier available at [e2b.dev](https://e2b.dev/)
- **Python 3.12+** (optional) - Only needed if you want to build custom E2B templates

### Setup Steps

**One command does it all:**

```bash
npm setup
```

This automated setup script will:
1. Install all npm dependencies
2. Guide you through Claude authentication (browser-based OAuth)
3. Guide you through E2B authentication
4. Auto-extract and save credentials to `.env`
5. Build the E2B sandbox template
6. Verify everything is ready

**Manual setup** (if you prefer):

<details>
<summary>Click to expand manual steps</summary>

1. Install dependencies: `npm install`
2. Get Claude token: `claude setup-token`
3. Get E2B key: `e2b auth login` (or from [e2b.dev/dashboard](https://e2b.dev/dashboard))
4. Create `.env` file with your credentials:
   ```bash
   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...
   E2B_API_KEY=e2b_...
   ```
5. Build template: `npm run build:template`

</details>

## Configuration

### Environment Variables

Create a `.env` file in the project root (use `.env.example` as a template):

```bash
# Claude OAuth Token (from: claude setup-token)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...

# E2B API Key (from: https://e2b.dev/dashboard)
E2B_API_KEY=e2b_...

# E2B Template ID (from running build script)
E2B_TEMPLATE_ID=your-template-id
```

### Getting Your Credentials

#### Claude OAuth Token

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Generate a setup token
claude setup-token

# Copy the token to your .env file
```

> **Note**: Requires an active Claude Max subscription

#### E2B API Key

1. Sign up at [e2b.dev](https://e2b.dev/)
2. Go to your [dashboard](https://e2b.dev/dashboard)
3. Copy your API key
4. Add it to your `.env` file

## Usage

### Basic Example

```typescript
import { runPythonAgent } from './examples/lib/agent'

const result = await runPythonAgent({
  prompt: 'What is 2 + 2?',
  timeout: 120,
  verbose: true
})

console.log(result)
```

### Run Examples

```bash
# Run the basic TypeScript example
npm run ts:example

# Run the streaming example (shows real-time agent output)
npx tsx examples/streaming_example.ts

# Run the SSE streaming server (perfect for web apps)
npx tsx examples/sse-streaming-api.ts
```

### Streaming Support

This SDK provides **real-time streaming** of agent responses, tool executions, and thinking processes:

```typescript
import { runPythonAgentStreaming } from './examples/lib/agent'

const result = await runPythonAgentStreaming({
  prompt: 'Analyze this codebase',
  timeout: 180,
  onStream: {
    onText: (text) => console.log('💬', text),
    onToolUse: (tool, input) => console.log('🔧', tool, input),
    onThinking: (thinking) => console.log('🤔', thinking),
    onResult: (result, duration, cost) => {
      console.log('✅', result)
      console.log(`Duration: ${duration}ms, Cost: $${cost}`)
    }
  }
})
```

### Next.js Integration

#### App Router (Next.js 13+)

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

#### Server-Sent Events (SSE)

For real-time streaming to the browser:

```typescript
// app/api/agent/stream/route.ts
import { Sandbox } from '@e2b/code-interpreter'

export async function POST(req: Request) {
  const { prompt } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sandbox = await Sandbox.create({
        template: process.env.E2B_TEMPLATE_ID
      })

      // ... run agent with streaming ...
      // controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

      await sandbox.kill()
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

See `examples/sse-streaming-api.ts` for a complete SSE implementation with a working web UI.

### Client-Side Usage

```typescript
// In your React component
const [result, setResult] = useState('')
const [streaming, setStreaming] = useState(false)

const runAgent = async () => {
  setStreaming(true)

  const eventSource = new EventSource('/api/agent/stream')

  eventSource.addEventListener('text', (e) => {
    setResult(prev => prev + e.data)
  })

  eventSource.addEventListener('complete', () => {
    setStreaming(false)
    eventSource.close()
  })
}
```

## Project Structure

```
claude-agent-sdk-experiments/
├── examples/                    # TypeScript examples and library
│   ├── lib/                     # Core TypeScript SDK
│   │   ├── agent.ts             # Agent orchestration functions
│   │   └── streaming.ts         # Streaming utilities
│   ├── basic_typescript.ts      # Simple usage examples
│   ├── streaming_example.ts     # Real-time streaming demo
│   ├── console_streaming_example.ts  # Console output streaming
│   ├── sse-streaming-api.ts     # Complete SSE server with web UI
│   └── nextjs-api-route.ts      # Next.js integration examples
├── agents/                      # E2B sandbox templates (Python-based)
│   ├── base/                    # Base template with Claude SDK
│   │   ├── template.py          # Template definition
│   │   ├── build_dev.py         # Development build script
│   │   ├── Dockerfile           # Container definition
│   │   └── e2b.toml             # E2B configuration
│   └── organizer/               # Example: Knowledge base organizer
│       ├── template.py          # Extended template
│       └── CLAUDE.md            # Agent instructions
├── .claude/                     # Claude Code configuration
│   ├── settings.json            # MCP servers and permissions
│   └── skills/                  # Custom skills
├── setup.sh                     # Automated setup script (run via: npm setup)
├── package.json                 # Node.js dependencies
├── tsconfig.json                # TypeScript configuration
├── .env.example                 # Environment template
├── CONTRIBUTING.md              # Contribution guidelines
├── SECURITY.md                  # Security policy
└── LICENSE                      # MIT License
```

**Note**: The `agents/` directory contains Python code that runs *inside* the E2B sandbox. You don't need to modify these unless you're building custom templates. All your application code is TypeScript.

## Examples

### 1. Basic Agent Execution

The simplest way to run an agent:

```bash
npm run ts:example
```

This runs `examples/basic_typescript.ts`:

```typescript
import { runPythonAgent } from './lib/agent'

const result = await runPythonAgent({
  prompt: 'Calculate the first 10 fibonacci numbers',
  timeout: 120,
  verbose: true
})

console.log(result)
```

### 2. Streaming Console Output

See real-time agent thinking, tool usage, and results:

```bash
npx tsx examples/console_streaming_example.ts
```

This provides colored, real-time output showing:
- 🔧 Tool executions (Bash, Read, Write, etc.)
- 💬 Agent text responses
- 🤔 Extended thinking processes
- ✅ Final results with cost and duration

```typescript
import { runPythonAgentStreaming } from './lib/agent'

const result = await runPythonAgentStreaming({
  prompt: 'Analyze the package.json file',
  timeout: 180,
  verbose: true,
  onStream: {
    onToolUse: (id, name, input) => {
      console.log(`🔧 Using tool: ${name}`)
    },
    onText: (text) => {
      console.log(`💬 ${text}`)
    },
    onResult: (result, duration, cost) => {
      console.log(`✅ Done in ${duration}ms ($${cost})`)
    }
  }
})
```

### 3. Server-Sent Events (SSE) API

Build a production-ready streaming API with a web UI:

```bash
npx tsx examples/sse-streaming-api.ts
```

Then open http://localhost:3000 in your browser to see:
- Real-time streaming from E2B sandboxes
- Multiple streaming patterns (command, Python code, structured data, Claude agents)
- Interactive web interface for testing

Perfect for integrating into Next.js, Express, or any Node.js web framework.

### 4. Next.js Integration

See `examples/nextjs-api-route.ts` for complete patterns:

**App Router (Next.js 13+)**:
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

**Streaming Response**:
```typescript
export async function POST(req: Request) {
  const { prompt } = await req.json()

  const stream = new ReadableStream({
    async start(controller) {
      await runPythonAgentStreaming({
        prompt,
        onStream: {
          onText: (text) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`))
          }
        }
      })
      controller.close()
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  })
}
```

### 5. Advanced Streaming Patterns

The `examples/streaming_example.ts` demonstrates:
- Basic stdout/stderr streaming
- Python code execution with streaming
- Structured JSON event streaming
- Background process monitoring
- Parallel task execution
- Error handling

Run all examples:
```bash
npx tsx examples/streaming_example.ts
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Your TypeScript Application                │
│                                                             │
│  - Next.js API Routes                                       │
│  - Express Server                                           │
│  - Node.js Scripts                                          │
│  - @e2b/code-interpreter SDK                                │
│                                                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Creates sandbox
                         │ Manages lifecycle
                         │ Streams results
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    E2B Sandbox (Container)                  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Claude Agent SDK (Python Runtime)           │  │
│  │                                                       │  │
│  │  • Python 3.12+                                       │  │
│  │  • Claude Code CLI                                    │  │
│  │  • Full tool access (Read, Write, Edit, Bash, etc.)  │  │
│  │  • Custom agent instructions (CLAUDE.md)             │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  The sandbox environment is pre-built and isolated          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

1. **TypeScript Orchestration**: You write all your application code in TypeScript. The SDK handles sandbox creation, code execution, and result streaming.

2. **Python Runtime**: The E2B sandbox contains a Python environment with the Claude Agent SDK. This runs inside the container and is managed by your TypeScript code.

3. **Pre-built Templates**: The `agents/base` directory defines an E2B template with all dependencies pre-installed. This makes sandbox creation fast (< 2 seconds).

4. **Streaming Communication**: Your TypeScript code receives real-time updates via stdout/stderr streaming, with structured JSON events for agent activities.

### Execution Flow

1. **Template Building** (one-time setup):
   ```bash
   npm run build:template
   ```
   This creates an E2B template with:
   - Ubuntu base image
   - Python 3.12+
   - Claude Code CLI
   - Claude Agent SDK
   - Development tools (git, ripgrep, etc.)

2. **TypeScript Agent Execution**:
   ```typescript
   const result = await runPythonAgent({
     prompt: 'Your task',
     timeout: 120
   })
   ```

   This:
   - Creates a sandbox from the pre-built template
   - Injects your prompt (safely JSON-escaped)
   - Streams results back in real-time
   - Automatically cleans up the sandbox

3. **Agent Capabilities**: Inside the sandbox, agents can:
   - Read and write files
   - Execute bash commands
   - Search code with grep/glob
   - Edit files in place
   - Install packages
   - Access the internet
   - Use all Claude Code tools

### Security

- **Input Sanitization**: All prompts are double JSON-serialized to prevent code injection
- **Sandbox Isolation**: E2B provides container-level isolation (separate VMs)
- **Resource Limits**: Configurable CPU, RAM, and timeout limits in `e2b.toml`
- **OAuth Tokens**: Credentials are injected as environment variables, never in code
- **Automatic Cleanup**: Sandboxes are terminated after execution

See [SECURITY.md](SECURITY.md) for detailed security information.

## Troubleshooting

### "E2B_TEMPLATE_ID not set"

**Solution**: Build the template first:

```bash
npm run build:template
```

The template ID will be printed and automatically added to your `.env` file.

### "Invalid OAuth token"

**Solution**: Regenerate your token:

```bash
claude setup-token
# Copy the new token to .env
```

Ensure you have an active Claude Max subscription.

### "Sandbox creation timed out"

**Possible causes**:
- E2B API is slow/down
- Template is too large
- Network issues

**Solutions**:
- Increase timeout in your code: `timeout: 300`
- Check E2B status: https://status.e2b.dev/
- Rebuild template with fewer dependencies

### "Module not found: claude_agent_sdk"

**Solution**: Rebuild the template to include the SDK:

```bash
npm run build:template
```

### TypeScript import errors

**Solution**: Install TypeScript dependencies:

```bash
npm install
```

### Streaming not working in browser

**Solution**: Ensure you're using Server-Sent Events (SSE) correctly:

```typescript
// Server: Set proper headers
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')

// Client: Use EventSource
const eventSource = new EventSource('/api/stream')
eventSource.addEventListener('message', (e) => {
  console.log(e.data)
})
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install dependencies
npm install

# Run examples to test your changes
npm run ts:example
npx tsx examples/streaming_example.ts
npx tsx examples/sse-streaming-api.ts

# Build custom templates
cd agents/base
python build_dev.py
```

## API Reference

### Core Functions

#### `runPythonAgent(config: AgentConfig): Promise<string>`

Run a Claude agent and return the final result.

```typescript
const result = await runPythonAgent({
  prompt: 'Your task here',
  timeout: 120,        // Optional: timeout in seconds (default: 120)
  verbose: true        // Optional: log progress (default: false)
})
```

#### `runPythonAgentDetailed(config: AgentConfig): Promise<AgentResult>`

Run an agent and get detailed execution results including stdout, stderr, and exit code.

```typescript
const execution = await runPythonAgentDetailed({
  prompt: 'Your task here',
  timeout: 120,
  verbose: true
})

console.log('Exit code:', execution.exitCode)
console.log('Output:', execution.stdout)
console.log('Errors:', execution.stderr)
```

#### `runPythonAgentStreaming(config: StreamingAgentConfig): Promise<string>`

Run an agent with real-time streaming of events.

```typescript
const result = await runPythonAgentStreaming({
  prompt: 'Your task here',
  timeout: 180,
  onStream: {
    onStart: () => console.log('Agent started'),
    onText: (text) => console.log('Text:', text),
    onThinking: (thinking) => console.log('Thinking:', thinking),
    onToolUse: (id, name, input) => console.log('Tool:', name, input),
    onToolResult: (toolUseId, content) => console.log('Result:', content),
    onError: (error, message) => console.error('Error:', error),
    onResult: (result, duration, cost) => {
      console.log('Final result:', result)
      console.log(`Duration: ${duration}ms, Cost: $${cost}`)
    }
  }
})
```

### Types

```typescript
interface AgentConfig {
  prompt: string
  timeout?: number    // Timeout in seconds
  verbose?: boolean   // Log progress to console
}

interface StreamingAgentConfig extends AgentConfig {
  onStream?: StreamCallbacks
}

interface StreamCallbacks {
  onStart?: () => void
  onText?: (text: string) => void
  onThinking?: (thinking: string, signature?: string) => void
  onToolUse?: (id: string, name: string, input: any) => void
  onToolResult?: (toolUseId: string, content: string, isError?: boolean) => void
  onError?: (error: string, message: string) => void
  onResult?: (result: string, durationMs: number, cost: number) => void
}

interface AgentResult {
  stdout: string
  stderr: string
  exitCode: number
}
```

## Resources

- [Claude Agent SDK Documentation](https://platform.claude.com/docs/agent-sdk)
- [E2B Documentation](https://e2b.dev/docs)
- [E2B TypeScript SDK](https://github.com/e2b-dev/e2b)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with the [Claude Agent SDK](https://www.anthropic.com/agent-sdk) by Anthropic
- Powered by [E2B](https://e2b.dev/) sandbox infrastructure
- Inspired by the need for reproducible, isolated agent environments

---

**Questions?** Open an issue or check out the [examples/](examples/) directory for more usage patterns.
