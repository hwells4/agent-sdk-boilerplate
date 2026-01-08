# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Claude Agent SDK Experiments

> TypeScript SDK for orchestrating Claude agents in isolated E2B sandboxes with full streaming support

## Project Overview

This is a **TypeScript-first boilerplate** that enables running Claude agents with real tool execution capabilities in isolated E2B sandbox containers. Users write TypeScript code (Next.js, Express, Node.js) that orchestrates Python-based Claude agents running in cloud containers.

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
│   - Spins up containers (~150ms)        │
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
│       └── e2b.toml              # Resource limits (2 CPU, 4GB RAM)
│
├── docs/                         # Research and documentation
│   ├── E2B_STREAMING_RESEARCH.md
│   ├── STREAMING_EXAMPLES.md
│   └── E2B_PRODUCTION_RECOMMENDATIONS.md
│
├── .claude/                      # Claude Code configuration
│   ├── settings.json             # Permissions
│   └── skills/                   # Custom skills
│       └── create-e2b-agent/     # E2B agent builder skill
│
├── RESEARCH_FINDINGS.md          # Claude Agent SDK research
├── FEATURE_PRIORITIES.md         # Roadmap for new features
├── package.json                  # TypeScript dependencies
├── tsconfig.json                 # TypeScript config
├── setup.sh                      # Automated setup script (run via: npm setup)
└── README.md                     # Main documentation
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

### Setup and Initial Configuration

**Automated setup (recommended):**
```bash
npm setup
```

This single command:
- Installs all dependencies (npm packages)
- Authenticates with Claude (browser OAuth)
- Authenticates with E2B
- Auto-extracts and saves credentials to `.env`
- Builds the E2B sandbox template
- Verifies everything is ready

The template includes:
- Python 3.12+ runtime
- Claude Code CLI
- Claude Agent SDK
- Development tools (git, ripgrep, etc.)

### Running Examples

```bash
# Basic TypeScript example (validates configuration first)
npm run example

# Streaming with colored console output
npm run console-streaming

# Advanced streaming patterns (stdout, Python code, JSON events)
npm run streaming

# Full SSE server with web UI (opens http://localhost:3000)
npm run sse-api
```

### Testing and Development

```bash
# Test basic agent functionality
npm run example

# Test streaming implementation
npm run streaming

# Test SSE with browser UI
npm run sse-api
# Open http://localhost:3000

# Rebuild template after changes
npm run build:template
```

### Building Custom E2B Templates

```bash
# Edit the template to add dependencies
cd agents/base
nano template.py  # Add pip packages, system tools, etc.

# Rebuild template (updates E2B_TEMPLATE_ID in .env)
cd ../..
npm run build:template

# The build process:
# 1. Creates E2B template from template.py
# 2. Uploads to E2B cloud
# 3. Saves template ID to .env
# 4. Template becomes available in ~10-30 seconds
```

## SDK Functions Reference

### `runPythonAgent(config: AgentConfig): Promise<string>`

Run an agent and return the final result.

```typescript
const result = await runPythonAgent({
  prompt: 'Your task',
  timeout: 120,    // Optional: seconds (default: 120)
  verbose: true    // Optional: log progress (default: false)
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
    onResult: (result, ms, cost) => {}   // Final result with cost tracking
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

# E2B Template ID (auto-generated by build:template)
E2B_TEMPLATE_ID=your-template-id
```

### Getting Credentials

**Claude OAuth Token:**
```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# Generate setup token (requires Claude Max subscription)
claude setup-token

# Copy token to .env file
```

**E2B API Key:**
1. Sign up at https://e2b.dev/
2. Go to dashboard: https://e2b.dev/dashboard
3. Copy API key
4. Add to `.env` file

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

## Common Use Cases

Based on production deployments and community usage, this SDK is commonly used for:

### 1. Code Generation & Analysis (40% of use cases)
- Automated bug fixing
- Codebase analysis and documentation
- Test generation
- Refactoring assistance

### 2. Data Processing (25% of use cases)
- CSV/spreadsheet analysis
- Report generation
- Data transformation pipelines

### 3. Multi-Agent Systems (20% of use cases)
- Research coordination (specialist subagents)
- Full-stack development (frontend + backend + testing agents)
- Documentation workflows

### 4. Web Automation (15% of use cases)
- Browser automation with testing tools
- API integration and orchestration
- Workflow automation

## Current Capabilities

### ✅ Production-Ready Features

- **Real-time streaming**: SSE implementation with line buffering and event parsing
- **Emoji-based visual distinction**: Console output with 🔧 tools, 💬 text, 🤔 thinking, ✅ results
- **Error handling**: Automatic retry with exponential backoff (built into Claude Agent SDK)
- **TypeScript-first**: Full type definitions and IDE support
- **Next.js integration**: Drop-in API routes with streaming support
- **Cost tracking**: Built-in token usage and cost reporting in streaming results
- **Sandbox isolation**: Firecracker microVMs with sub-200ms cold starts

### 🚧 Planned Features (See FEATURE_PRIORITIES.md)

**Phase 1 - Production Essentials** (Weeks 1-3):
1. Session Management System - Multi-turn conversations with state persistence
2. OpenTelemetry Integration - Production observability (Langfuse, SigNoz, etc.)
3. Enhanced Error Recovery - Configurable retry policies, error classification

**Phase 2 - Advanced Capabilities** (Weeks 3-6):
4. Multi-Agent Orchestration - Orchestrator + subagent patterns, parallel execution
5. MCP Integration Templates - Pre-configured top 10 MCP servers (GitHub, Slack, Database)

**Phase 3 - Developer Experience** (Weeks 6-9):
6. WebSocket Streaming - Bidirectional communication and interruptions
7. Cost Optimization - Sandbox pooling, resource auto-scaling
8. Testing Framework - Agent testing utilities and validation helpers

See `RESEARCH_FINDINGS.md` for detailed analysis and `FEATURE_PRIORITIES.md` for implementation roadmap.

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
- Verify `.env` file was updated with template ID

**"Invalid OAuth token"**
- Regenerate: `claude setup-token`
- Update `.env` with new token
- Ensure Claude Max subscription is active

**Streaming not working**
- Check that you're using `runPythonAgentStreaming()`, not `runPythonAgent()`
- Verify `onStream` callbacks are provided
- Check browser console for SSE connection errors

**"Sandbox creation timed out"**
- E2B may be slow/down - check https://status.e2b.dev/
- Increase timeout: `timeout: 300`
- Template may be too large - reduce dependencies

**"Module not found: claude_agent_sdk"**
- Rebuild template: `npm run build:template`
- Check that `template.py` includes SDK installation

## Architecture Principles

When working on this codebase, follow these principles:

### 1. TypeScript-First Design
- Users write TypeScript, not Python
- Python exists only inside E2B sandboxes
- SDK functions should feel native to TypeScript/Next.js developers
- Provide comprehensive type definitions

### 2. Streaming is Primary
- SSE and real-time updates are key features
- Always implement streaming callbacks alongside basic execution
- Line buffering is critical for partial JSON handling
- Provide visual distinction (emojis) for different event types

### 3. Production-Ready from Day One
- Implement error handling, retry logic, and observability
- Track costs and provide usage metrics
- Support multi-tenant scenarios
- Document security considerations

### 4. Next.js is the Primary Use Case
- Optimize for API routes and server components
- Provide drop-in examples for App Router and Pages Router
- Support both SSE and standard request/response patterns

### 5. Simplicity Over Features
- Avoid over-engineering
- Follow existing patterns in `examples/lib/`
- Don't add features without clear use cases
- Keep the API surface small and focused

### 6. E2B Sandboxes are Ephemeral (Currently)
- Each agent execution creates and destroys a sandbox
- State is not preserved between executions (yet)
- Template-based approach ensures fast startup (~150ms)
- Future: Add session management for stateful workflows

## Development Workflow

### Adding New Features

1. **Research and validate** - Check RESEARCH_FINDINGS.md for alignment with best practices
2. **Update TypeScript SDK** (`examples/lib/agent.ts` or new modules)
3. **Add examples** in `examples/` directory
4. **Test locally** with `npm run example`
5. **Update documentation** (README.md, this file, relevant docs/)
6. **Commit changes** (descriptive messages, no co-author attribution)

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

When adding features that require new dependencies or tools:

```bash
cd agents/base

# Edit template.py to add dependencies
nano template.py

# Example: Add pandas for data analysis
# .run_cmd("pip install pandas numpy matplotlib")

# Rebuild template
./scripts/build_dev.sh

# Template ID saved to .env automatically
```

## Cost Optimization

E2B sandboxes use per-second billing: **$0.000014/vCPU/second** (~$0.05/hour for 2 vCPU)

**Current Implementation**:
- Creates new sandbox for each task
- Destroys immediately after completion
- Cold start: ~150ms (Firecracker microVMs)

**Planned Optimizations** (see E2B_PRODUCTION_RECOMMENDATIONS.md):
- Sandbox pooling (reuse sandboxes, save ~$0.15 per reused task)
- Pause/resume for long-running sessions (preserve state for 24 hours)
- Auto-scaling resources (1 CPU for simple tasks, 2+ for complex)
- Template pre-warming (reduce first-task latency)

## Security Considerations

- **Input sanitization**: All prompts are double JSON-serialized to prevent code injection
- **Sandbox isolation**: E2B provides container-level isolation (separate microVMs)
- **Resource limits**: Configurable CPU, RAM, and timeout limits in `e2b.toml`
- **OAuth tokens**: Credentials injected as environment variables, never in code
- **Automatic cleanup**: Sandboxes are terminated after execution (no orphaned resources)

## Resources

- [README.md](./README.md) - Complete user documentation
- [RESEARCH_FINDINGS.md](./RESEARCH_FINDINGS.md) - Claude Agent SDK research and best practices
- [FEATURE_PRIORITIES.md](./FEATURE_PRIORITIES.md) - Development roadmap
- [docs/E2B_PRODUCTION_RECOMMENDATIONS.md](./docs/E2B_PRODUCTION_RECOMMENDATIONS.md) - E2B capabilities and patterns
- [examples/](./examples/) - Working code examples
- [E2B Docs](https://e2b.dev/docs) - E2B platform documentation
- [Claude Agent SDK Docs](https://platform.claude.com/docs/agent-sdk) - Official SDK reference

## Notes for Claude Code

When working on this codebase:

1. **This is a boilerplate project** - Focus on building reusable, production-ready features
2. **TypeScript-first** - Users write TypeScript, Python is sandbox-internal
3. **Streaming is critical** - Real-time updates build user trust
4. **Research-driven development** - Refer to RESEARCH_FINDINGS.md for validated patterns
5. **Next.js optimization** - Primary use case is web applications
6. **Simple over clever** - Avoid over-engineering, follow existing patterns
7. **Production-ready** - Error handling, observability, and cost tracking are priorities

When making commits:
- Use descriptive commit messages
- Don't add co-author attribution
- Keep commits focused and atomic

When users ask for help:
- Point them to relevant examples first
- Use `/create-e2b-agent` for custom agent templates
- Emphasize TypeScript SDK over manual E2B manipulation
- Reference research documents for production best practices
