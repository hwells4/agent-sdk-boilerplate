# Claude Agent SDK Experiments

> TypeScript SDK for orchestrating Claude agents in isolated E2B sandboxes with full streaming support

## Project Overview

This is a **TypeScript-first SDK** that enables running Claude agents with real tool execution capabilities in isolated E2B sandbox containers. Users write TypeScript code (Next.js, Express, Node.js) that orchestrates Python-based Claude agents running in cloud containers.

### What This Project Does

- **Provides a TypeScript SDK** (`examples/lib/agent.ts`) for creating, running, and streaming Claude agents
- **Manages E2B sandboxes** - Isolated Linux containers where agents can safely execute code, read/write files, and run bash commands
- **Streams real-time results** - SSE (Server-Sent Events) and callback-based streaming for web applications
- **Perfect for Next.js** - Drop-in API routes with streaming support

### What Makes This Different

Unlike the Claude API which *suggests* tool calls, this SDK *actually executes* them:

| Feature | Claude API | This SDK |
|---------|-----------|----------|
| Tool execution | Simulated | Real (in sandbox) |
| File operations | No | Yes |
| Bash commands | No | Yes |
| Streaming | Text only | Tools + text + thinking |
| Isolation | N/A | Full container isolation |

## Architecture

```
┌─────────────────────────────────────────┐
│   Your TypeScript Application          │
│   - Next.js API routes                  │
│   - Express servers                     │
│   - Node.js scripts                     │
│   - runPythonAgent() SDK function       │
└──────────────┬──────────────────────────┘
               │
               │ Creates & manages sandboxes
               ↓
┌─────────────────────────────────────────┐
│   E2B Cloud (Sandbox Provider)         │
│   - Spins up containers (~2 seconds)    │
│   - Manages lifecycle                   │
│   - Streams stdout/stderr               │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   E2B Sandbox (Python Runtime)          │
│   ┌─────────────────────────────────┐   │
│   │  Claude Agent SDK (Python)      │   │
│   │  - Read/Write/Edit tools        │   │
│   │  - Bash execution               │   │
│   │  - File search (Glob/Grep)      │   │
│   │  - Multi-turn reasoning         │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Key Point**: Users only write TypeScript. The Python runtime exists inside E2B sandboxes and is managed automatically by the SDK.

## Project Structure

```
claude-agent-sdk-experiments/
├── examples/                     # TypeScript SDK and examples
│   ├── lib/                      # Core SDK (what you import)
│   │   ├── agent.ts              # Main SDK functions
│   │   └── streaming.ts          # Streaming utilities
│   ├── basic_typescript.ts       # Simple usage examples
│   ├── streaming_example.ts      # Streaming demos
│   ├── console_streaming_example.ts  # Colored console output
│   ├── sse-streaming-api.ts      # Complete SSE server + web UI
│   └── nextjs-api-route.ts       # Next.js integration patterns
│
├── agents/                       # E2B template definitions
│   └── base/                     # Base Python template
│       ├── template.py           # E2B template config
│       ├── build_dev.py          # Template builder
│       ├── Dockerfile            # Container definition
│       └── e2b.toml              # Resource limits
│
├── docs/                         # Documentation
│   ├── E2B_STREAMING_RESEARCH.md
│   └── STREAMING_EXAMPLES.md
│
├── .claude/                      # Claude Code configuration
│   ├── settings.json             # Permissions
│   └── skills/                   # Custom skills
│       └── create-e2b-agent/     # E2B agent builder skill
│
├── package.json                  # TypeScript dependencies
├── tsconfig.json                 # TypeScript config
├── setup.sh                      # Credential setup script
├── README.md                     # Main documentation
├── UNDERSTANDING.md              # Conceptual guide
└── TYPESCRIPT.md                 # TypeScript quick start
```

## Available Skills

### `/create-e2b-agent`

**Purpose**: Create new E2B sandbox agents through an adaptive interview process.

**Use when**: You want to create a custom E2B agent template with specific tools, permissions, or MCP servers.

**What it does**:
- Conducts intelligent interview to gather requirements
- Generates all necessary files (template.py, CLAUDE.md, settings.json, etc.)
- Creates build scripts for development and production
- Provides usage examples

**Example**:
```
User: /create-e2b-agent
Claude: I'll help you create an E2B agent. What problem should this agent solve?
User: I need an agent that analyzes CSV files and generates reports
Claude: *Creates complete agent template with pandas, data analysis tools*
```

## Common Development Tasks

### 1. Running Examples

```bash
# Basic TypeScript example
npm run example

# Streaming with colored console output
npm run console-streaming

# Full SSE server with web UI
npm run sse-api
```

### 2. Building Custom E2B Templates

```bash
# Edit the template
cd agents/base
nano Dockerfile  # Add your custom tools/packages

# Rebuild template
npm run build:template

# Template ID is saved to .env automatically
```

### 3. Testing Streaming Locally

```typescript
import { runPythonAgentStreaming } from './examples/lib/agent'

await runPythonAgentStreaming({
  prompt: 'Your test task',
  onStream: {
    onText: (text) => console.log('Agent:', text),
    onToolUse: (id, name, input) => console.log('Tool:', name),
    onResult: (result, duration, cost) => {
      console.log('Done:', result)
      console.log(`${duration}ms, $${cost}`)
    }
  }
})
```

### 4. Integrating with Next.js

Copy `examples/lib/agent.ts` to your Next.js project:

```bash
# In your Next.js project
mkdir -p lib
cp examples/lib/agent.ts lib/
cp examples/lib/streaming.ts lib/
```

Create an API route:

```typescript
// app/api/agent/route.ts
import { runPythonAgent } from '@/lib/agent'

export async function POST(req: Request) {
  const { prompt } = await req.json()
  const result = await runPythonAgent({ prompt })
  return Response.json({ result })
}
```

## SDK Functions Reference

### `runPythonAgent(config: AgentConfig): Promise<string>`

Run an agent and return the final result.

```typescript
const result = await runPythonAgent({
  prompt: 'Your task',
  timeout: 120,    // Optional: seconds
  verbose: true    // Optional: log progress
})
```

### `runPythonAgentStreaming(config: StreamingAgentConfig): Promise<string>`

Run an agent with real-time event streaming.

```typescript
const result = await runPythonAgentStreaming({
  prompt: 'Your task',
  onStream: {
    onText: (text) => {},           // Agent text output
    onThinking: (thinking) => {},    // Extended thinking
    onToolUse: (id, name, input) => {},  // Tool execution
    onToolResult: (id, content) => {},   // Tool output
    onResult: (result, ms, cost) => {}   // Final result
  }
})
```

### `runPythonAgentDetailed(config: AgentConfig): Promise<AgentResult>`

Get detailed execution results including stdout, stderr, and exit codes.

```typescript
const execution = await runPythonAgentDetailed({
  prompt: 'Your task'
})

console.log(execution.exitCode)
console.log(execution.stdout)
console.log(execution.stderr)
```

## Environment Configuration

Required environment variables (`.env`):

```bash
# Claude OAuth Token (from: claude setup-token)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...

# E2B API Key (from: https://e2b.dev/dashboard)
E2B_API_KEY=e2b_...

# E2B Template ID (from running build:template)
E2B_TEMPLATE_ID=your-template-id
```

## Permissions

This project uses `.claude/settings.json` to manage permissions:

**Allowed operations**:
- `git` commands (status, commit, push, etc.)
- `python`, `pip`, `pytest` (for template building)
- `npm`, `npx` (for TypeScript development)
- `e2b` commands (sandbox management)
- All file operations (Read, Write, Edit)

**Denied operations**:
- `rm -rf` (safety)

## Development Workflow

### Adding New Features

1. **Update TypeScript SDK** (`examples/lib/agent.ts`)
2. **Add examples** in `examples/` directory
3. **Test locally** with `npm run example`
4. **Update documentation** (README.md, UNDERSTANDING.md)
5. **Commit changes** (no co-author attribution needed)

### Testing Changes

```bash
# Test basic functionality
npm run example

# Test streaming
npm run streaming

# Test SSE with browser UI
npm run sse-api
# Open http://localhost:3000
```

### Building New Templates

```bash
cd agents/base

# Edit Dockerfile to add dependencies
nano Dockerfile

# Rebuild template
source ../../.venv/bin/activate
python build_dev.py

# Template ID saved to .env automatically
```

## Debugging

### Enable Verbose Logging

```typescript
await runPythonAgent({
  prompt: 'Your task',
  verbose: true  // Shows sandbox creation, execution, cleanup
})
```

### Check Sandbox Logs

When agents fail, examine the detailed execution:

```typescript
const execution = await runPythonAgentDetailed({
  prompt: 'Your task'
})

if (execution.exitCode !== 0) {
  console.error('Agent failed!')
  console.error('STDOUT:', execution.stdout)
  console.error('STDERR:', execution.stderr)
}
```

### Common Issues

**"E2B_TEMPLATE_ID not set"**
- Run: `npm run build:template`

**"Invalid OAuth token"**
- Regenerate: `claude setup-token`
- Update `.env` with new token

**Streaming not working**
- Check that you're using `runPythonAgentStreaming()`, not `runPythonAgent()`
- Verify `onStream` callbacks are provided

## Resources

- [README.md](./README.md) - Complete documentation
- [UNDERSTANDING.md](./UNDERSTANDING.md) - Conceptual guide
- [TYPESCRIPT.md](./TYPESCRIPT.md) - TypeScript quick start
- [examples/](./examples/) - Working code examples
- [E2B Docs](https://e2b.dev/docs) - E2B platform documentation
- [Claude Agent SDK Docs](https://platform.claude.com/docs/agent-sdk) - Agent SDK reference

## Notes for Claude

When working on this codebase:

1. **This is TypeScript-first** - Users write TypeScript, not Python
2. **Python is sandbox-internal** - Only exists inside E2B containers
3. **Focus on streaming** - SSE and real-time updates are key features
4. **Next.js is primary use case** - Optimize for web applications
5. **Don't add Python orchestration** - We removed that intentionally
6. **Keep it simple** - Avoid over-engineering, follow existing patterns

When making commits:
- Use descriptive commit messages
- Don't add co-author attribution
- Keep commits focused and atomic

When users ask for help:
- Point them to relevant examples first
- Use `/create-e2b-agent` for custom agent templates
- Emphasize TypeScript SDK over manual E2B manipulation
