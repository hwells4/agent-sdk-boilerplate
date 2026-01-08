# Claude Agent SDK Research: Comprehensive Technical Guide

> Deep dive into Claude Agent SDK capabilities, integration patterns, and production requirements

**Research Date**: January 5, 2026
**Focus**: Understanding the Python SDK for optimal TypeScript integration via E2B sandboxes

---

## Table of Contents

1. [SDK Architecture & Core Concepts](#1-sdk-architecture--core-concepts)
2. [Available Tools & Capabilities](#2-available-tools--capabilities)
3. [Streaming Patterns & Event Types](#3-streaming-patterns--event-types)
4. [Session Management & State Persistence](#4-session-management--state-persistence)
5. [Token Usage & Cost Tracking](#5-token-usage--cost-tracking)
6. [Error Handling & Retry Strategies](#6-error-handling--retry-strategies)
7. [TypeScript-Python Integration Patterns](#7-typescript-python-integration-patterns)
8. [Production Deployment Patterns](#8-production-deployment-patterns)
9. [Common Missing Features](#9-common-missing-features)
10. [Implementation Recommendations](#10-implementation-recommendations)

---

## 1. SDK Architecture & Core Concepts

### 1.1 Execution Model

The Claude Agent SDK operates as a **long-running process** with persistent state:

```
┌─────────────────────────────────────────┐
│   Application Layer (TypeScript/Python) │
│   - query() or ClaudeSDKClient          │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Claude Code CLI (Node.js)             │
│   - IPC/WebSocket communication         │
│   - Session management                  │
│   - Tool execution orchestration        │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Claude API (Anthropic)                │
│   - Claude Sonnet/Opus/Haiku models     │
│   - Tool use suggestions                │
└─────────────────────────────────────────┘
```

**Key Characteristics**:
- Executes commands in persistent shell environment
- Manages file operations within working directory
- Handles tool execution with context from previous interactions
- Maintains conversation state across multiple turns

### 1.2 Python SDK API Patterns

The SDK provides two primary APIs:

#### Option 1: `query()` - Stateless Execution

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async for message in query(
    prompt="Your task",
    options=ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Bash"],
        permission_mode="acceptEdits",
        max_turns=10
    )
):
    # Process messages as they arrive
    print(message)
```

**When to use**:
- One-off tasks
- Independent executions
- No conversation history needed
- Simple automation scripts

**Limitations**:
- Creates new session each time
- No conversation continuity
- Cannot interrupt mid-execution
- No custom tools or hooks

#### Option 2: `ClaudeSDKClient` - Stateful Conversations

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async with ClaudeSDKClient(options) as client:
    # First turn
    await client.query("What's the capital of France?")
    async for msg in client.receive_response():
        print(msg)

    # Second turn - remembers context!
    await client.query("What's the population of that city?")
    async for msg in client.receive_response():
        print(msg)
```

**When to use**:
- Multi-turn conversations
- Interactive applications
- Custom tools and hooks
- Interruption support
- Response-driven logic

**Features**:
- Maintains conversation context
- Supports interrupts via `client.interrupt()`
- Custom MCP tools
- Lifecycle hooks
- File checkpointing

### 1.3 Communication Architecture

**Critical Insight**: The SDK uses **IPC or WebSocket**, NOT HTTP calls to Claude API.

This has important implications:
- Standard HTTP-based LLM monitoring tools won't work
- Must use OpenTelemetry for observability
- Network proxies need special configuration
- Token tracking requires parsing message events

---

## 2. Available Tools & Capabilities

### 2.1 Built-in Tools

The SDK includes a rich ecosystem of tools:

#### File Operations
- **Read**: Read files with pagination support, image loading, PDF parsing
- **Write**: Create/overwrite files with full UTF-8 support
- **Edit**: Exact string replacement with optional replace_all
- **Glob**: File pattern matching (e.g., `**/*.ts`)
- **Grep**: Regex search with context lines, file filtering

#### Code Execution
- **Bash**: Execute shell commands with timeout, background support
- **BashOutput**: Monitor background processes
- **KillBash**: Terminate background shells

#### Web & Data
- **WebSearch**: Search with domain filtering (US only)
- **WebFetch**: Fetch URLs with AI processing
- **NotebookEdit**: Edit Jupyter notebooks

#### Task Management
- **Task**: Delegate to specialized subagents
- **TodoWrite**: Manage task lists
- **ExitPlanMode**: Submit plans for user approval

#### MCP Integration
- **ListMcpResources**: List available MCP resources
- **ReadMcpResource**: Read MCP resource contents
- **Custom MCP Tools**: via `create_sdk_mcp_server()`

### 2.2 Tool Usage Patterns

#### Basic Tool Configuration

```python
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Edit", "Bash"],
    disallowed_tools=["WebSearch"],  # Explicitly block
    permission_mode="acceptEdits"  # Auto-approve file edits
)
```

#### Custom Tool Permissions

```python
async def custom_permission_handler(tool_name: str, input_data: dict, context: dict):
    # Block writes to system directories
    if tool_name == "Write" and input_data.get("file_path", "").startswith("/system/"):
        return {
            "behavior": "deny",
            "message": "System directory write not allowed",
            "interrupt": True
        }

    # Redirect sensitive operations
    if tool_name in ["Write", "Edit"] and "config" in input_data.get("file_path", ""):
        return {
            "behavior": "allow",
            "updatedInput": {**input_data, "file_path": f"./sandbox/{input_data['file_path']}"}
        }

    return {"behavior": "allow", "updatedInput": input_data}

options = ClaudeAgentOptions(
    can_use_tool=custom_permission_handler,
    allowed_tools=["Read", "Write", "Edit"]
)
```

### 2.3 Creating Custom MCP Tools

```python
from claude_agent_sdk import tool, create_sdk_mcp_server

@tool("calculate", "Perform mathematical calculations", {"expression": str})
async def calculate(args: dict[str, Any]) -> dict[str, Any]:
    try:
        result = eval(args["expression"], {"__builtins__": {}})
        return {
            "content": [{"type": "text", "text": f"Result: {result}"}]
        }
    except Exception as e:
        return {
            "content": [{"type": "text", "text": f"Error: {str(e)}"}],
            "is_error": True
        }

@tool("get_time", "Get current time", {})
async def get_time(args: dict[str, Any]) -> dict[str, Any]:
    from datetime import datetime
    return {
        "content": [{"type": "text", "text": f"Time: {datetime.now()}"}]
    }

# Create SDK MCP server
utilities = create_sdk_mcp_server(
    name="utilities",
    version="1.0.0",
    tools=[calculate, get_time]
)

# Use with agent
options = ClaudeAgentOptions(
    mcp_servers={"utils": utilities},
    allowed_tools=["mcp__utils__calculate", "mcp__utils__get_time"]
)
```

---

## 3. Streaming Patterns & Event Types

### 3.1 Streaming Input vs Single-Shot

**Streaming Input Mode** (Recommended):
- Interactive, low-latency UX
- Image attachments
- Dynamic message queueing
- Real-time interruptions
- Hook integration
- Natural multi-turn conversations

**Single-Shot Mode**:
- One-off queries
- Stateless environments (lambdas)
- No image attachments
- Session resumption for continuity

### 3.2 Message Types & Event Streaming

```python
from claude_agent_sdk import (
    AssistantMessage,
    UserMessage,
    SystemMessage,
    ResultMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock
)

async for message in query(prompt="Your task"):
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock):
                print(f"💬 Text: {block.text}")
            elif isinstance(block, ThinkingBlock):
                print(f"🤔 Thinking: {block.thinking}")
            elif isinstance(block, ToolUseBlock):
                print(f"🔧 Tool: {block.name}({block.input})")
            elif isinstance(block, ToolResultBlock):
                print(f"📦 Result: {block.content}")

    elif isinstance(message, ResultMessage):
        print(f"✅ Final: {message.result}")
        print(f"💰 Cost: ${message.total_cost_usd}")
        print(f"📊 Usage: {message.usage}")
```

### 3.3 Streaming Event Structure

When implementing streaming in TypeScript (via E2B), Python emits JSON events:

```python
# Python streaming code (running in E2B sandbox)
def emit(event_type: str, data: dict):
    event = {"type": event_type, "data": data}
    print(json.dumps(event), flush=True)

# Emit events
emit("text", {"text": "Hello"})
emit("tool_use", {"id": "123", "name": "Bash", "input": {...}})
emit("thinking", {"thinking": "I need to...", "signature": "..."})
emit("tool_result", {"tool_use_id": "123", "content": "output", "is_error": False})
emit("result", {
    "result": "Final answer",
    "duration_ms": 5000,
    "cost": 0.0015,
    "num_turns": 3,
    "usage": {
        "input_tokens": 1000,
        "output_tokens": 500,
        "cache_read_input_tokens": 2000
    }
})
```

**TypeScript Integration** (examples/lib/agent.ts):
```typescript
// Line buffering for partial JSON handling
const streamHandler = createLineBufferedHandler((line) => {
    const event = parseStreamEvent(line)
    if (!event) return

    switch (event.type) {
        case 'text':
            onStream?.onText?.(event.data.text)
            break
        case 'tool_use':
            onStream?.onToolUse?.(event.data.id, event.data.name, event.data.input)
            break
        case 'thinking':
            onStream?.onThinking?.(event.data.thinking)
            break
        case 'tool_result':
            onStream?.onToolResult?.(event.data.tool_use_id, event.data.content)
            break
        case 'result':
            onStream?.onResult?.(event.data.result, event.data.duration_ms, event.data.cost)
            break
    }
})
```

---

## 4. Session Management & State Persistence

### 4.1 Session Lifecycle

The SDK provides comprehensive session management:

```python
from claude_agent_sdk import query, ClaudeAgentOptions

# Initial query - creates session
session_id = None
async for message in query(prompt="Help me build an API"):
    if hasattr(message, 'subtype') and message.subtype == 'init':
        session_id = message.data.get('session_id')
        print(f"Session started: {session_id}")

# Resume session later
async for message in query(
    prompt="Continue building that API",
    options=ClaudeAgentOptions(resume=session_id)
):
    print(message)
```

### 4.2 Session Forking

Create branches from existing sessions:

```python
# Fork session to try different approach
async for message in query(
    prompt="Now redesign as GraphQL instead",
    options=ClaudeAgentOptions(
        resume=session_id,
        fork_session=True  # Creates NEW session ID
    )
):
    print(message)

# Original session remains unchanged
async for message in query(
    prompt="Add authentication to the REST API",
    options=ClaudeAgentOptions(resume=session_id)  # Original session
):
    print(message)
```

### 4.3 File Checkpointing

Track and revert file changes:

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async with ClaudeSDKClient(
    options=ClaudeAgentOptions(enable_file_checkpointing=True)
) as client:
    await client.query("Modify these files")
    async for msg in client.receive_response():
        if hasattr(msg, 'uuid'):
            checkpoint_uuid = msg.uuid

    # Later: revert files to that checkpoint
    await client.rewind_files(checkpoint_uuid)
```

### 4.4 Session Storage Considerations

**Known Gap**: Official documentation doesn't specify:
- Where sessions are stored (local vs remote)
- How to change storage backends
- How to programmatically replay agents to specific states

**Current Implementation** (E2B-based approach):
```typescript
// Our implementation (examples/lib/sessions.ts)
export interface ConversationSession {
  sessionId: string
  traceId?: string
  span?: any
  sandbox?: Sandbox  // Keep sandbox alive!
  createdAt: Date
  turnCount: number
  conversationHistory: Array<{turnId: number, prompt: string, response: string}>
}

const activeSessions = new Map<string, ConversationSession>()

// Create persistent sandbox for session
export async function createSession(timeout: number = 600): Promise<ConversationSession> {
  const session: ConversationSession = {
    sessionId: uuidv4(),
    createdAt: new Date(),
    turnCount: 0,
    conversationHistory: [],
  }

  // Persistent sandbox across turns
  session.sandbox = await Sandbox.create(templateId, {
    timeoutMs: timeout * 1000,
    metadata: { sessionId: session.sessionId }
  })

  activeSessions.set(session.sessionId, session)
  return session
}
```

---

## 5. Token Usage & Cost Tracking

### 5.1 Understanding Token Reporting

**Critical Rules**:

1. **Same Message ID = Same Usage**
   - All messages with same `id` report identical usage
   - When Claude sends text + multiple tool uses, they share one message ID
   - **Charge users ONCE per unique message ID**

2. **Token Types to Track**:
   ```python
   {
       "input_tokens": 1000,              # Base input
       "output_tokens": 500,              # Generated output
       "cache_creation_input_tokens": 50, # Created cache entries
       "cache_read_input_tokens": 2000    # Read from cache
   }
   ```

3. **Result Message is Authoritative**:
   - Final `ResultMessage` contains cumulative totals
   - Use for billing reconciliation

### 5.2 Cost Tracking Implementation

```python
from claude_agent_sdk import query, AssistantMessage, ResultMessage

class CostTracker:
    def __init__(self):
        self.processed_message_ids = set()
        self.step_usages = []

    def process_message(self, message):
        if not isinstance(message, AssistantMessage) or not hasattr(message, 'usage'):
            return

        message_id = getattr(message, 'id', None)
        if not message_id or message_id in self.processed_message_ids:
            return  # Skip duplicates

        self.processed_message_ids.add(message_id)
        self.step_usages.append({
            "message_id": message_id,
            "timestamp": datetime.now().isoformat(),
            "usage": message.usage,
            "cost_usd": self.calculate_cost(message.usage)
        })

    def calculate_cost(self, usage):
        # Claude Sonnet 4.5 pricing
        input_cost = usage.get("input_tokens", 0) * 0.000003
        output_cost = usage.get("output_tokens", 0) * 0.000015
        cache_read_cost = usage.get("cache_read_input_tokens", 0) * 0.0000003
        return input_cost + output_cost + cache_read_cost

# Usage
tracker = CostTracker()
async for message in query(prompt="Your task"):
    tracker.process_message(message)
    if isinstance(message, ResultMessage):
        print(f"Total cost: ${message.total_cost_usd:.4f}")
        print(f"Tracked steps: {len(tracker.step_usages)}")
```

### 5.3 Prompt Caching Strategy

```python
options = ClaudeAgentOptions(
    # SDK automatically uses prompt caching
    # Track these token types separately:
    # - cache_creation_input_tokens (1.25x base price for 5min cache)
    # - cache_read_input_tokens (0.1x base price)
)
```

**Cost Impact**:
- 5-min cache write: $3.75 per million tokens
- 1-hour cache write: $6 per million tokens
- Cache read: $0.30 per million tokens (90% savings!)

### 5.4 TypeScript Integration

Our implementation extracts usage from Python agent output:

```typescript
// In runPythonAgent() (examples/lib/agent.ts)
const pythonCode = `
# Extract usage from ResultMessage
async for msg in query(prompt=prompt):
    if hasattr(msg, "result"):
        usage_data = None
        if hasattr(msg, 'usage') and msg.usage:
            usage_data = {
                "input_tokens": int(msg.usage.get('input_tokens', 0)),
                "output_tokens": int(msg.usage.get('output_tokens', 0)),
                "cache_read_input_tokens": int(msg.usage.get('cache_read_input_tokens', 0))
            }

        output = {"result": result, "usage": usage_data}
        print(json.dumps(output))
`

// Parse in TypeScript
const output = JSON.parse(execution.stdout.trim())
const tokenUsage = {
    promptTokens: output.usage.input_tokens || 0,
    completionTokens: output.usage.output_tokens || 0,
    cachedTokens: output.usage.cache_read_input_tokens || 0,
}

const cost = calculateCost('claude-sonnet-4-5-20250929', tokenUsage, {
    durationSeconds,
    cpuCount: 2
})
```

---

## 6. Error Handling & Retry Strategies

### 6.1 SDK-Native Retry Logic

**Built-in**: The SDK handles retry logic automatically with exponential backoff:
- Max attempts: 3
- Backoff multiplier: 2
- Initial delay: 1000ms

This eliminated ~200 lines of custom retry code in typical implementations.

### 6.2 Error Types

```python
from claude_agent_sdk import (
    ClaudeSDKError,           # Base exception
    CLINotFoundError,         # Claude CLI not installed
    CLIConnectionError,       # Failed to connect to CLI
    ProcessError,             # CLI process failed
    CLIJSONDecodeError        # JSON parsing failed
)

try:
    async for message in query(prompt="Your task"):
        print(message)
except CLINotFoundError:
    print("Install: npm install -g @anthropic-ai/claude-code")
except ProcessError as e:
    print(f"Exit code: {e.exit_code}, stderr: {e.stderr}")
except CLIJSONDecodeError as e:
    print(f"Failed to parse: {e.line}")
except ClaudeSDKError as e:
    print(f"SDK error: {e}")
```

### 6.3 Application-Level Error Handling

```python
async def custom_permission_handler(tool_name: str, input_data: dict, context: dict):
    """Implement custom validation and error handling"""

    # Validate inputs
    if tool_name == "Bash":
        command = input_data.get("command", "")
        if len(command) > 10000:
            return {
                "behavior": "deny",
                "message": "Command too long (>10k chars)",
                "interrupt": True
            }

    # Rate limiting
    if is_rate_limited(tool_name):
        return {
            "behavior": "deny",
            "message": "Rate limit exceeded. Try again in 60s",
            "interrupt": False
        }

    return {"behavior": "allow"}
```

### 6.4 Error Classification

Our implementation categorizes errors for better handling:

```typescript
// From examples/lib/error-tracking.ts
export type AgentErrorType =
  | 'timeout'
  | 'permission_denied'
  | 'tool_error'
  | 'rate_limit'
  | 'network_error'
  | 'sandbox_error'
  | 'unknown'

export function categorizeError(exitCode: number, stderr: string): AgentErrorType {
  if (stderr.includes('timeout') || stderr.includes('timed out')) return 'timeout'
  if (stderr.includes('permission denied')) return 'permission_denied'
  if (stderr.includes('429') || stderr.includes('rate limit')) return 'rate_limit'
  if (exitCode === 137) return 'timeout'  // SIGKILL timeout
  if (exitCode === 143) return 'timeout'  // SIGTERM timeout
  return 'unknown'
}
```

---

## 7. TypeScript-Python Integration Patterns

### 7.1 Hybrid Architecture Pattern

**Our Approach** (TypeScript orchestration + Python execution):

```typescript
// TypeScript: Orchestration layer
export async function runPythonAgent(config: AgentConfig): Promise<string> {
  // 1. Create E2B sandbox
  const sandbox = await Sandbox.create(templateId, { timeoutMs: timeout * 1000 })

  // 2. Inject Python agent code
  const pythonCode = `
import asyncio
import json
from claude_agent_sdk import query

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})
    result = None

    async for msg in query(prompt=prompt):
        if hasattr(msg, "result"):
            result = msg.result

    print(json.dumps({"result": result}))

asyncio.run(main())
`

  // 3. Execute in sandbox
  await sandbox.files.write('/home/user/agent.py', pythonCode)
  const execution = await sandbox.commands.run('python3 /home/user/agent.py', {
    timeoutMs: timeout * 1000,
    envs: { CLAUDE_CODE_OAUTH_TOKEN: oauthToken }
  })

  // 4. Parse result
  const output = JSON.parse(execution.stdout.trim())
  return output.result
}
```

**Why This Works**:
- TypeScript: Native Next.js/Express integration, type safety, npm ecosystem
- Python: Mature Claude SDK, official support, all features available
- E2B: Secure sandbox isolation, fast startup (~150ms)

### 7.2 Metadata Passing Between Layers

**TypeScript → Python**:
```typescript
// Pass trace context to Python
const envs: Record<string, string> = {
  CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
  BRAINTRUST_API_KEY: process.env.BRAINTRUST_API_KEY,
  BRAINTRUST_TRACE_CONTEXT: JSON.stringify({
    traceId: span.id,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId
  })
}
```

**Python → TypeScript**:
```python
# Return structured data via JSON
output = {
    "result": result,
    "usage": {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_read_input_tokens": usage.cache_read_input_tokens
    },
    "metadata": {
        "num_turns": msg.num_turns,
        "duration_ms": msg.duration_ms
    }
}
print(json.dumps(output))
```

### 7.3 Observability Integration

**Braintrust Integration** (Dual-layer tracing):

```typescript
// TypeScript layer (examples/lib/observability.ts)
export async function traceAgentExecution<T>(
  name: string,
  metadata: Record<string, any>,
  fn: (span: any) => Promise<T>
): Promise<T> {
  const logger = getBraintrustLogger()
  if (!logger) return fn(null)

  return logger.traced(async (span) => {
    span.log({ input: metadata })
    const result = await fn(span)
    span.log({ output: result })
    return result
  }, { name })
}
```

```python
# Python layer (in sandbox)
import braintrust

braintrust.init(
    api_key=os.getenv('BRAINTRUST_API_KEY'),
    project=os.getenv('BRAINTRUST_PROJECT_NAME', 'claude-agent-sdk')
)

# Import parent trace context
context_json = os.getenv('BRAINTRUST_TRACE_CONTEXT')
if context_json:
    context = json.loads(context_json)
    # Context propagation (future enhancement)

with braintrust.start_span(name="agent_execution") as span:
    span.log(input=prompt)
    # ... agent execution ...
    span.log(output=result, metrics={...})
```

---

## 8. Production Deployment Patterns

### 8.1 Container Deployment Strategies

#### Pattern 1: Ephemeral Sessions (Most Common)
```typescript
// Create sandbox → Execute task → Destroy
const result = await runPythonAgent({ prompt: "Fix this bug" })
// Sandbox automatically destroyed
```

**Best for**:
- Bug fixes and one-off tasks
- Invoice processing
- Translation tasks
- Image/video processing

**Cost**: ~$0.05/hour (E2B) + token costs

#### Pattern 2: Long-Running Sessions
```typescript
// Create persistent sandbox
const session = await createSession(timeout: 3600) // 1 hour

// Multiple turns
await executeTurn(session.sessionId, "Build a todo app")
await executeTurn(session.sessionId, "Add authentication")
await executeTurn(session.sessionId, "Deploy to Vercel")

// Cleanup when done
await endSession(session.sessionId)
```

**Best for**:
- Email agents (continuous monitoring)
- Site builders (long-lived editing)
- High-frequency chat bots

**Cost**: Sandbox runs continuously (~$0.05/hour minimum)

#### Pattern 3: Hybrid Sessions
```typescript
// Hydrate from database/session store
const session = await resumeSession(sessionId)
await executeTurn(session.sessionId, "Continue research")
// Auto-cleanup after timeout
```

**Best for**:
- Personal project managers
- Deep research tasks
- Customer support agents

### 8.2 Security Best Practices

#### Permissions System
```python
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Edit"],
    disallowed_tools=["WebSearch"],
    permission_mode="default",  # or "acceptEdits", "plan", "bypassPermissions"
    can_use_tool=custom_permission_handler
)
```

#### Credential Management
```python
# DON'T: Pass credentials to agent
prompt = f"Deploy to AWS using key {aws_secret_key}"  # ❌

# DO: Use proxy pattern
async def deploy_handler(args):
    # Proxy injects credentials
    aws_client = boto3.client('s3',
        aws_access_key_id=os.getenv('AWS_KEY'),
        aws_secret_access_key=os.getenv('AWS_SECRET')
    )
    return aws_client.upload_file(args['file'], args['bucket'])
```

#### Sandbox Configuration
```python
from claude_agent_sdk import ClaudeAgentOptions, SandboxSettings

options = ClaudeAgentOptions(
    sandbox=SandboxSettings(
        enabled=True,
        autoAllowBashIfSandboxed=True,
        excludedCommands=["docker"],  # Always bypass sandbox
        network={
            "allowLocalBinding": True,
            "allowUnixSockets": ["/var/run/docker.sock"]
        }
    )
)
```

### 8.3 Monitoring & Observability

#### OpenTelemetry Integration
```bash
# Environment variables
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_EXPORTER_TYPE=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

**Supported Platforms**:
- Langfuse (OpenTelemetry tracing)
- SigNoz (Request volumes, latency)
- Arize Dev-Agent-Lens (LLM-specific metrics)
- MLflow (Prototype validation)

**Key Metrics to Track**:
1. **Cost & Usage**
   - Total tokens (input, output, cache)
   - Per-user/session costs
   - Cache hit rates
   - Tool execution frequency

2. **Performance**
   - End-to-end latency
   - Tool execution duration
   - Sandbox creation time
   - Stream event throughput

3. **Reliability**
   - Error rates by type
   - Retry attempts
   - Session success/failure rates
   - Tool failure patterns

### 8.4 Session Timeout Management

```python
options = ClaudeAgentOptions(
    max_turns=20,  # Prevent infinite loops
    # Note: Sessions don't auto-timeout
)
```

**Recommendation**: Set `max_turns` to prevent runaway agents.

---

## 9. Common Missing Features

Based on production deployments and community discussions:

### 9.1 Session Storage Backends

**Gap**: No built-in session persistence to Redis, S3, or databases.

**Current Workaround**:
```typescript
// Store session metadata externally
interface SessionMetadata {
  sessionId: string
  claudeSessionId: string  // From SDK
  userId: string
  createdAt: Date
  lastActive: Date
  conversationHistory: Message[]
}

// Redis storage
await redis.set(`session:${sessionId}`, JSON.stringify(metadata))

// Resume by loading metadata
const metadata = JSON.parse(await redis.get(`session:${sessionId}`))
await query(options: { resume: metadata.claudeSessionId })
```

### 9.2 Multi-Agent Orchestration Utilities

**Gap**: No standard patterns for orchestrator + subagent architectures.

**Current Approach**:
```typescript
// Manual orchestration
class AgentOrchestrator {
  async execute(task: string) {
    // 1. Analyze task
    const analysis = await this.analyzerAgent(task)

    // 2. Delegate to specialists (parallel)
    const results = await Promise.all([
      this.backendAgent(analysis.backend_tasks),
      this.frontendAgent(analysis.frontend_tasks),
      this.testAgent(analysis.test_tasks)
    ])

    // 3. Integrate results
    return this.integratorAgent(results)
  }
}
```

### 9.3 WebSocket Streaming

**Gap**: SDK uses stdout/IPC, no built-in WebSocket support.

**Current Approach**:
```typescript
// SSE workaround (examples/sse-streaming-api.ts)
app.get('/api/agent/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')

  await runPythonAgentStreaming({
    prompt: req.query.prompt,
    onStream: {
      onText: (text) => res.write(`data: ${JSON.stringify({type: 'text', text})}\n\n`),
      onToolUse: (id, name, input) => res.write(`data: ${JSON.stringify({type: 'tool_use', id, name, input})}\n\n`)
    }
  })

  res.end()
})
```

### 9.4 Token Budget Limits

**Gap**: No built-in budget enforcement.

**Current Approach**:
```typescript
class BudgetTracker {
  async runWithBudget(prompt: string, maxCostUSD: number) {
    let totalCost = 0

    // Track cost during execution
    const result = await runPythonAgentStreaming({
      prompt,
      onStream: {
        onResult: (result, durationMs, cost) => {
          totalCost += cost
          if (totalCost > maxCostUSD) {
            throw new Error(`Budget exceeded: $${totalCost} > $${maxCostUSD}`)
          }
        }
      }
    })

    return { result, cost: totalCost }
  }
}
```

### 9.5 Testing & Evaluation Framework

**Gap**: No built-in eval tools.

**Community Solutions**:
- **Promptfoo**: Claude Agent SDK integration for scenario testing
- **MLflow**: `@mlflow.anthropic.autolog()` for automatic instrumentation
- **Custom evals**: Rules-based feedback, E2E testing, benchmarks

---

## 10. Implementation Recommendations

### 10.1 For This Boilerplate (TypeScript + E2B)

#### Immediate Enhancements

1. **Enhanced Session Management**
   ```typescript
   // Implement pluggable storage
   interface SessionStorage {
     save(session: ConversationSession): Promise<void>
     load(sessionId: string): Promise<ConversationSession | null>
     delete(sessionId: string): Promise<void>
   }

   class RedisSessionStorage implements SessionStorage {
     // Implementation
   }
   ```

2. **Cost Budget Enforcement**
   ```typescript
   export interface AgentConfig {
     budget?: {
       maxCostUSD: number
       onBudgetExceeded: 'abort' | 'warn'
       onCostUpdate?: (cost: number) => void
     }
   }
   ```

3. **Multi-Agent Orchestrator**
   ```typescript
   class AgentOrchestrator {
     async executeParallel(tasks: AgentTask[]): Promise<AgentResult[]> {
       return Promise.all(tasks.map(task =>
         runPythonAgent({ prompt: task.prompt })
       ))
     }

     async executePipeline(tasks: AgentTask[]): Promise<AgentResult[]> {
       const results = []
       for (const task of tasks) {
         const result = await runPythonAgent({
           prompt: task.prompt,
           context: results  // Pass previous results
         })
         results.push(result)
       }
       return results
     }
   }
   ```

4. **WebSocket Streaming**
   ```typescript
   import { WebSocketServer } from 'ws'

   wss.on('connection', (ws) => {
     runPythonAgentStreaming({
       prompt: initialPrompt,
       onStream: {
         onText: (text) => ws.send(JSON.stringify({ type: 'text', text })),
         onToolUse: (id, name, input) => ws.send(JSON.stringify({ type: 'tool_use', id, name, input }))
       }
     })

     // Handle user interrupts
     ws.on('message', (msg) => {
       if (msg === 'INTERRUPT') {
         // SDK client.interrupt() equivalent
       }
     })
   })
   ```

### 10.2 Production Checklist

- [ ] **Observability**: OpenTelemetry integration with Braintrust/Langfuse
- [ ] **Cost Tracking**: Per-user token usage and budget enforcement
- [ ] **Error Handling**: Categorized errors with retry policies
- [ ] **Session Management**: Persistent storage with cleanup policies
- [ ] **Security**: Permission handlers, credential proxying
- [ ] **Monitoring**: Metrics dashboards for cost, latency, errors
- [ ] **Testing**: Eval scenarios with self-validation
- [ ] **Documentation**: API docs, deployment guides, troubleshooting

### 10.3 Architecture Recommendations

**Layered Approach**:
```
User Application (Next.js, Express, etc.)
    ↓
High-Level SDK (runPythonAgent, sessions)
    ↓
Middleware (observability, retries, budgets)
    ↓
Core E2B Integration
    ↓
Python Agent Runtime (in sandbox)
    ↓
Claude Code CLI → Claude API
```

**Design Principles**:
1. **Zero-config defaults**: Sensible defaults, progressive enhancement
2. **Pluggable architecture**: Swap storage/observability/MCP servers
3. **Backward compatible**: All new features optional
4. **TypeScript-first**: Strong types, IDE support
5. **Production-ready**: Observability, cost tracking, error handling built-in

---

## Sources

### Official Documentation
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK Python Reference](https://platform.claude.com/docs/en/agent-sdk/python)
- [Session Management](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Streaming Input Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
- [Cost Tracking](https://platform.claude.com/docs/en/agent-sdk/cost-tracking)
- [Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting)
- [Secure Deployment](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)

### Educational Resources
- [DataCamp Tutorial](https://www.datacamp.com/tutorial/how-to-use-claude-agent-sdk)
- [Claude Agent SDK Best Practices](https://skywork.ai/blog/claude-agent-sdk-best-practices-ai-agents-2025/)
- [Building Agents with Claude Code's SDK](https://blog.promptlayer.com/building-agents-with-claude-codes-sdk/)

### GitHub Repositories
- [anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python)
- [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [anthropics/claude-agent-sdk-demos](https://github.com/anthropics/claude-agent-sdk-demos)

### Observability
- [Langfuse Integration](https://langfuse.com/integrations/frameworks/claude-agent-sdk)
- [SigNoz Integration](https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/)
- [Arize Dev-Agent-Lens](https://arize.com/blog/claude-code-observability-and-tracing-introducing-dev-agent-lens/)

---

## Conclusion

The Claude Agent SDK provides a comprehensive framework for building AI agents with real tool execution capabilities. Key insights:

1. **Architecture**: Long-running process with persistent state, not stateless API calls
2. **Integration**: TypeScript orchestration + Python SDK execution works well via E2B
3. **Session Management**: Built-in but limited storage options (needs enhancement)
4. **Cost Tracking**: Comprehensive token reporting with message ID deduplication
5. **Streaming**: Rich event types for real-time UX, requires line buffering
6. **Error Handling**: SDK has built-in retry, applications need categorization
7. **Production**: Container patterns well-defined, observability requires OpenTelemetry

**Gaps to Address**:
- Session storage backends (Redis, S3, database)
- Multi-agent orchestration utilities
- WebSocket streaming support
- Token budget enforcement
- Testing/evaluation framework

This boilerplate is well-positioned to fill these gaps with production-ready TypeScript patterns.
