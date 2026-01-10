# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript SDK for running Claude agents in isolated E2B sandboxes with real-time streaming. Users write TypeScript (Next.js, Express, Node.js) that orchestrates Python-based Claude agents running in cloud containers.

**Key insight**: Unlike the Claude API which *suggests* tool calls, this SDK *actually executes* them in sandboxes with full file system, bash, and web access.

## Architecture

```
TypeScript Application → SDK (examples/lib/) → E2B Sandbox (Python) → Claude Agent → Real Tools
```

**Data flow**:
1. TypeScript calls `runPythonAgent()` with a prompt
2. SDK creates E2B sandbox from template
3. Python agent executes with ClaudeSDKClient inside sandbox
4. Agent uses real tools (Read, Write, Edit, Bash, Glob, Grep, WebFetch)
5. Results stream back via stdout JSON events
6. Sandbox is killed, result returned to TypeScript

## Commands

```bash
# Setup (first time)
npm setup                    # Automated: installs deps, auth, builds template

# Run examples
npm run example              # Basic agent execution
npm run streaming            # Streaming patterns demo
npm run console-streaming    # Colored console output
npm run sse-api              # Full SSE server + web UI at localhost:3000

# Development
npm run build:template       # Rebuild E2B template after changes
npx convex dev               # Start Convex backend dev server
npx convex deploy            # Deploy Convex to production
```

## Project Structure

```
examples/lib/           # Core TypeScript SDK
  agent.ts              # Main functions: runPythonAgent, runPythonAgentStreaming, runPythonAgentDetailed
  streaming.ts          # Event parsing, line buffering, console handlers
  observability.ts      # Braintrust integration
  cost-tracking.ts      # Claude + E2B cost calculation
  error-tracking.ts     # Error categorization

examples/               # Usage examples
  basic_typescript.ts   # Simple examples
  sse-streaming-api.ts  # Complete SSE server with web UI

convex/                 # Real-time backend
  schema.ts             # Database: workspaces, workspaceMembers, sandboxRuns, artifacts
  sandboxRuns.ts        # State machine: booting → running → succeeded/failed/canceled
  actions/              # startSandboxRun, cancelSandboxRun, killIdleSandboxes
  lib/                  # Authorization, validation, state machine helpers

agents/base/            # E2B template definition
  template.py           # Python environment (Claude Agent SDK, tools)
  e2b.toml              # Resource limits (2 CPU, 4GB RAM)
```

## SDK Functions

```typescript
// Basic execution - returns final result
const result = await runPythonAgent({
  prompt: 'Your task',
  timeout: 120,
  verbose: true
})

// Streaming - real-time events with callbacks
const result = await runPythonAgentStreaming({
  prompt: 'Your task',
  onStream: {
    onText: (text) => {},
    onToolUse: (id, name, input) => {},
    onThinking: (thinking) => {},
    onResult: (result, durationMs, cost) => {}
  }
})

// Detailed - includes stdout, stderr, exitCode
const { stdout, stderr, exitCode } = await runPythonAgentDetailed({ prompt: 'Your task' })
```

## Environment Variables

```bash
# Required
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...  # From: claude setup-token
E2B_API_KEY=e2b_...                     # From: e2b.dev/dashboard
E2B_TEMPLATE_ID=...                     # Auto-set by npm run build:template

# Optional - Observability
BRAINTRUST_API_KEY=bt_...               # Auto-traces executions
BRAINTRUST_PROJECT_NAME=claude-agent-sdk
BRAINTRUST_SAMPLE_RATE=1.0              # 0.0-1.0, production: use 0.1
```

## Convex State Machine

Sandbox runs follow strict state transitions:
- `booting` → `running` | `failed` | `canceled`
- `running` → `succeeded` | `failed` | `canceled`
- Terminal states have no outgoing transitions

Idle cleanup cron runs every 30 seconds, killing:
- Sandboxes idle > 15 minutes
- Sandboxes stuck in `booting` > 5 minutes

## Security Model

- **Prompt sanitization**: Double JSON-serialization prevents injection
- **Sandbox isolation**: Separate Firecracker microVMs per execution
- **Resource limits**: Configurable CPU, RAM, timeout in `e2b.toml`
- **Automatic cleanup**: Sandboxes killed after execution + cron cleanup
- **No persistent state**: Each execution is ephemeral (stateful sessions planned)

## Common Tasks

### Adding SDK Features
1. Edit `examples/lib/agent.ts` for core functions
2. Edit `examples/lib/streaming.ts` for event handling
3. Test with `npm run example` or `npm run streaming`

### Modifying E2B Template
1. Edit `agents/base/template.py` to add Python packages or system tools
2. Run `npm run build:template`
3. New template ID auto-saved to `.env`

### Adding Convex Features
1. Edit `convex/schema.ts` for data model changes
2. Run `npx convex dev` to sync schema
3. Add mutations/queries in appropriate files
4. Follow patterns in `convex/lib/authorization.ts` for auth

## Known Issues

**Rate Limiting Bug** (`convex/sandboxRuns.ts:internalCountRecentByUser`):
- Only checks `running` status, misses `booting`
- Loads all sandboxes into memory (O(n) issue)
- Needs composite index `by_user_startedAt`

**Unimplemented Schema Fields**:
- `sandboxRuns.e2bCost` - Never populated
- `artifacts.previewText` - Never generated

## Skills

### `/create-e2b-agent`
Creates custom E2B agent templates through an adaptive interview. Generates all files (template.py, CLAUDE.md, settings.json) and build scripts.

## UBS Quick Reference

Run `ubs <changed-files>` before commits. Exit 0 = safe.

```bash
ubs file.ts file2.py                    # Specific files (< 1s)
ubs $(git diff --name-only --cached)    # Staged files
ubs .                                   # Whole project
```
