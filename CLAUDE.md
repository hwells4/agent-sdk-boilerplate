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
npm run multi-turn           # Multi-turn conversation example
npm run test:observability   # Test Braintrust tracing

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
  sessions.ts           # Multi-turn conversation session management
  observability.ts      # Braintrust integration
  cost-tracking.ts      # Claude + E2B cost calculation
  error-tracking.ts     # Error categorization

examples/               # Usage examples
  basic_typescript.ts   # Simple examples and test suite
  streaming_example.ts  # Real-time streaming patterns
  console_streaming_example.ts  # Colored console output demo
  multi_turn_conversation.ts    # Multi-turn session example
  sse-streaming-api.ts  # Complete SSE server with web UI
  nextjs-api-route.ts   # Next.js App Router integration
  test_streaming_observability.ts  # Observability testing
  test_sampling.ts      # Sampling behavior tests

convex/                 # Real-time backend
  schema.ts             # Database: workspaces, workspaceMembers, sandboxRuns, artifacts
  sandboxRuns.ts        # State machine: booting → running → succeeded/failed/canceled
  crons.ts              # Scheduled jobs (idle cleanup every 30s)
  actions/              # startSandboxRun, cancelSandboxRun, killIdleSandboxes
  lib/
    authorization.ts    # Workspace membership checks
    stateMachine.ts     # Valid state transitions
    validators.ts       # Zod schemas for validation
    pagination.ts       # Convex pagination helpers
    constants.ts        # Timeouts, string limits
    e2b.ts              # E2B SDK helpers

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

// Multi-turn sessions - persistent sandbox across turns
import { createSession, sendMessage, endSession } from './examples/lib/sessions'
const session = await createSession({ timeout: 600 })
const response1 = await sendMessage(session.sessionId, 'Create a file called test.py')
const response2 = await sendMessage(session.sessionId, 'Now read that file back')  // Same sandbox!
await endSession(session.sessionId)
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

## Sandbox Management Modes

This SDK provides two independent modes for sandbox management, each suited for different use cases:

### Ephemeral Mode (Direct SDK)

Direct SDK functions create sandboxes on-demand and clean them up immediately after execution. No external state tracking is involved.

**Functions**: `runPythonAgent()`, `runPythonAgentStreaming()`, `runPythonAgentDetailed()`

**Characteristics**:
- Sandboxes are created directly via E2B SDK
- Automatic cleanup in `finally` block after execution
- No Convex database records created
- No visibility to cron cleanup jobs
- Best for: Simple scripts, CLI tools, single-execution tasks

**Trade-offs**:
- (+) Zero setup beyond E2B credentials
- (+) No database dependencies
- (-) No cost tracking persistence
- (-) Orphan risk if process crashes before cleanup

### Managed Mode (Convex-Backed)

Uses the Convex backend for full lifecycle tracking with database persistence and automated cleanup.

**Entry point**: `startSandboxRun` action in `convex/actions/`

**Characteristics**:
- Creates Convex `sandboxRuns` record before sandbox creation
- State machine tracks: `booting` -> `running` -> `succeeded`/`failed`/`canceled`
- Cron job cleans up orphaned sandboxes (idle > 15 min, stuck booting > 5 min)
- Full audit trail in database
- Best for: Production apps, multi-tenant systems, cost tracking

**Trade-offs**:
- (+) Complete lifecycle visibility
- (+) Automatic orphan cleanup via cron
- (+) Cost tracking and analytics ready (schema exists)
- (-) Requires Convex backend setup
- (-) Additional latency for database operations

### Choosing a Mode

| Use Case | Recommended Mode |
|----------|------------------|
| Local development / testing | Ephemeral |
| CLI tools / scripts | Ephemeral |
| Production web apps | Managed |
| Multi-tenant platforms | Managed |
| Cost tracking required | Managed |
| Quick prototyping | Ephemeral |

**Note**: These modes are currently independent. Sandboxes created via Ephemeral Mode are invisible to Managed Mode's cleanup cron. A future enhancement may unify these paths with optional Convex registration in SDK functions.

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
- **Session isolation**: Multi-turn sessions maintain isolated sandboxes with configurable timeouts

### Security Considerations

**OAuth Token Exposure in Sandboxes**

The `CLAUDE_CODE_OAUTH_TOKEN` is passed as an environment variable to E2B sandboxes. This is acceptable for development and demo use cases where E2B sandbox isolation is trusted and network egress is not a concern.

For production deployments, consider the following mitigations:

1. **Proxy Architecture** (Recommended): Sandboxes call back to a trusted server that holds the token, rather than accessing Claude API directly. This prevents token exposure inside sandboxes entirely.

2. **Short-Lived Scoped Tokens**: If available, generate short-lived tokens with minimal permissions for each sandbox execution.

3. **Egress Filtering**: Configure E2B network policies to only allow outbound connections to Claude API endpoints, preventing token exfiltration to arbitrary URLs.

See `todos/008-pending-p2-oauth-token-exposure.md` for detailed analysis and implementation options.

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
