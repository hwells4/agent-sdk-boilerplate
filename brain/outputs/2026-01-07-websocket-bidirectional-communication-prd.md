---
date: 2026-01-07
type: prd
status: draft
tags:
  - output/prd
  - status/draft
  - feature/websocket
  - feature/human-in-the-loop
---

# PRD: WebSocket Bidirectional Communication for E2B Claude Agent SDK

## Overview

### What We're Building

Add WebSocket support to the Claude Agent SDK that enables **bidirectional communication** between users and running agents. This allows:
- Users to **cancel or pause** running agents gracefully
- Users to **inject input** mid-execution (guidance, corrections, answers)
- Agents to **ask questions** and wait for user responses
- Optional **tool approval workflows** where agents pause before executing certain tools

### Why We're Building It

The current SSE implementation is one-way only (agent → client). Users cannot interact with agents once they start. This limits the SDK to "fire and forget" use cases.

Real-world agent applications need human-in-the-loop capabilities:
- **Supervision**: Users want to course-correct agents mid-task
- **Approval workflows**: Some actions (file deletions, API calls) need human approval
- **Collaborative iteration**: "Is this good?" → "Change X" → "Perfect, continue"
- **Long-running tasks**: Users need to pause, check progress, provide input over time

### Success Metrics

- Users can enable WebSocket with a single flag (`websocket: true`)
- Round-trip latency for user input < 100ms
- Agent can ask question → user responds → agent continues in < 500ms
- Graceful cancel completes within 5 seconds
- Auto-reconnect succeeds within 3 attempts on network interruption

---

## User Stories

### Primary Users

**Developer building an AI-powered application** who wants users to interact with agents in real-time.

### User Stories

1. **As a developer**, I want to enable WebSocket with minimal code changes, so I can add bidirectional features without rewriting my streaming implementation.

2. **As an end user**, I want to cancel a running agent, so I can stop tasks that are taking too long or going in the wrong direction.

3. **As an end user**, I want to provide additional input while an agent is running, so I can guide it without restarting from scratch.

4. **As an end user**, I want the agent to ask me questions when it's uncertain, so I can provide clarification before it makes mistakes.

5. **As a developer**, I want to optionally require approval for dangerous tools, so I can build supervised agent experiences for sensitive operations.

6. **As a developer**, I want to run multiple agents concurrently on a single WebSocket connection, so I can build multi-task UIs (taskbar-style with minimized agents).

7. **As an end user**, I want to pause an agent and resume it later, so I can multitask without losing progress.

---

## Features

### Feature 1: WebSocket Connection Management

**Description**: Single WebSocket connection that manages multiple concurrent agent sessions.

**Acceptance Criteria**:
- [ ] User can create WebSocket connection with `createAgentWebSocket(url, options)`
- [ ] Connection supports multiplexed sessions (multiple agents on one connection)
- [ ] Each session has a unique `sessionId` for routing messages
- [ ] Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- [ ] Reconnection restores active sessions automatically
- [ ] Connection emits events: `open`, `close`, `error`, `reconnecting`, `reconnected`
- [ ] Max 10 concurrent sessions per connection (configurable)

**API**:
```typescript
// Client-side
const ws = createAgentWebSocket('wss://api.example.com/agent', {
  autoReconnect: true,        // default: true
  maxReconnectAttempts: 5,    // default: 5
  maxConcurrentSessions: 10,  // default: 10
})

ws.on('open', () => console.log('Connected'))
ws.on('reconnecting', (attempt) => console.log(`Reconnecting... ${attempt}`))
ws.on('reconnected', () => console.log('Reconnected'))
```

---

### Feature 2: Simple WebSocket Flag for Agent Execution

**Description**: Enable WebSocket mode by adding a single flag to existing SDK functions.

**Acceptance Criteria**:
- [ ] `runPythonAgentStreaming({ websocket: true })` enables bidirectional mode
- [ ] All existing `onStream` callbacks continue to work
- [ ] New callbacks added: `onUserInputRequired`, `onApprovalRequired`
- [ ] Returns a `session` object with methods: `sendInput()`, `cancel()`, `pause()`, `resume()`
- [ ] TypeScript types fully updated

**API**:
```typescript
const session = await runPythonAgentStreaming({
  prompt: 'Analyze this codebase and suggest improvements',
  websocket: true,
  timeout: 300,
  onStream: {
    onText: (text) => updateUI(text),
    onToolUse: (id, name, input) => showToolExecution(name),
    onUserInputRequired: (question, options) => showQuestionModal(question, options),
    onResult: (result) => showFinalResult(result),
  }
})

// Returns immediately - agent runs async
// Use session methods to interact:
session.sendInput('Yes, proceed with that approach')
session.cancel()  // Graceful stop
```

---

### Feature 3: User Input Injection

**Description**: Send messages to a running agent mid-execution.

**Acceptance Criteria**:
- [ ] `session.sendInput(message)` sends text to the running agent
- [ ] Agent receives input via the built-in `ask_user` tool response mechanism
- [ ] Input is queued if agent isn't waiting (delivered when agent next pauses)
- [ ] Configurable timeout for agent to acknowledge input (default: 30s)
- [ ] `onInputAcknowledged` callback fires when agent processes input

**API**:
```typescript
session.sendInput('Use TypeScript instead of JavaScript')

// With callback
session.sendInput('Proceed', {
  onAcknowledged: () => console.log('Agent received input'),
  timeout: 30000,  // 30 seconds
})
```

---

### Feature 4: Agent-Initiated Questions

**Description**: Agent can pause execution and ask user questions via the Claude Agent SDK's built-in `ask_user` tool.

**Acceptance Criteria**:
- [ ] When agent calls `ask_user` tool, execution pauses
- [ ] `onUserInputRequired(question, options, respond)` callback fires
- [ ] `question` is the agent's question text
- [ ] `options` is optional array of suggested responses
- [ ] `respond(answer)` function sends the answer back
- [ ] Configurable timeout (default: 5 minutes, max: 30 minutes)
- [ ] If timeout expires: configurable behavior (error, default answer, or continue)
- [ ] Agent can ask multiple questions in sequence

**API**:
```typescript
onUserInputRequired: (question, options, respond) => {
  // Show UI to user
  showModal({
    question,              // "Should I use PostgreSQL or SQLite?"
    options,               // ["PostgreSQL", "SQLite", "Let me decide"]
    onAnswer: (answer) => respond(answer)
  })
}

// Timeout configuration
runPythonAgentStreaming({
  websocket: true,
  userInputTimeout: 300000,  // 5 minutes
  userInputTimeoutBehavior: 'error',  // 'error' | 'default' | 'continue'
  userInputDefaultAnswer: 'Proceed with your best judgment',
})
```

---

### Feature 5: Graceful Cancel with State Preservation

**Description**: Cancel running agents gracefully, preserving state for potential resume.

**Acceptance Criteria**:
- [ ] `session.cancel()` initiates graceful shutdown
- [ ] Current tool execution completes (max 30s wait)
- [ ] Agent state is checkpointed (conversation history, partial results)
- [ ] `onCancelled(state)` callback fires with preserved state
- [ ] State stored in-memory (server-side) for session duration
- [ ] `session.resume()` continues from checkpoint
- [ ] Force cancel available: `session.cancel({ force: true })` for immediate termination

**API**:
```typescript
// Graceful cancel
await session.cancel()

// Force cancel (immediate, no state preservation)
await session.cancel({ force: true })

// Resume from checkpoint
await session.resume()

// Check if resumable
if (session.canResume) {
  await session.resume()
}

// Callback
onCancelled: (state) => {
  console.log('Cancelled at step:', state.currentStep)
  console.log('Partial result:', state.partialResult)
  // Optionally save state for later
}
```

---

### Feature 6: Pause/Resume for Long-Running Tasks

**Description**: Pause agents to free up resources, resume later.

**Acceptance Criteria**:
- [ ] `session.pause()` pauses execution at next safe point
- [ ] Sandbox is kept alive but agent loop pauses
- [ ] `session.resume()` continues from pause point
- [ ] `onPaused()` and `onResumed()` callbacks fire
- [ ] Paused sessions timeout after configurable period (default: 10 minutes)
- [ ] State is in-memory only (lost on server restart)

**API**:
```typescript
session.pause()   // Pause at next safe point
session.resume()  // Continue execution

// Configure pause timeout
runPythonAgentStreaming({
  websocket: true,
  pauseTimeout: 600000,  // 10 minutes max pause duration
})
```

---

### Feature 7: Optional Tool Approval Workflow

**Description**: Optionally require user approval before executing certain tools.

**Acceptance Criteria**:
- [ ] Disabled by default (permissive mode)
- [ ] Enable via `requireApproval: true` or `requireApproval: ['Bash', 'Write']`
- [ ] When enabled, `onApprovalRequired(tool, input, approve, reject)` fires
- [ ] `approve()` allows tool to execute
- [ ] `reject(reason?)` skips tool and sends reason to agent
- [ ] Approval timeout: configurable (default: 2 minutes)
- [ ] Timeout behavior: configurable (reject, approve, or error)

**API**:
```typescript
runPythonAgentStreaming({
  websocket: true,
  requireApproval: ['Bash', 'Write', 'Edit'],  // Only these tools need approval
  approvalTimeout: 120000,  // 2 minutes
  approvalTimeoutBehavior: 'reject',  // 'reject' | 'approve' | 'error'
  onStream: {
    onApprovalRequired: (tool, input, approve, reject) => {
      showApprovalModal({
        tool,   // "Bash"
        input,  // { command: "rm -rf /tmp/test" }
        onApprove: () => approve(),
        onReject: (reason) => reject(reason || 'User rejected')
      })
    }
  }
})

// Fully permissive (default)
runPythonAgentStreaming({
  websocket: true,
  requireApproval: false,  // Default - all tools run without approval
})
```

---

### Feature 8: Multi-Session UI Support (Taskbar Pattern)

**Description**: Run multiple agents concurrently, with UI pattern support for minimized/expanded agents.

**Acceptance Criteria**:
- [ ] Single WebSocket supports multiple concurrent sessions
- [ ] Each session has unique `sessionId`
- [ ] Sessions can be in states: `running`, `paused`, `waiting_input`, `completed`, `cancelled`
- [ ] `ws.getSessions()` returns all active sessions with their states
- [ ] `ws.getSession(sessionId)` returns specific session
- [ ] Events scoped to sessions: `ws.on('session:text', (sessionId, text) => {})`
- [ ] UI helper: `session.getStatus()` returns `{ state, currentStep, lastActivity }`

**API**:
```typescript
// Start multiple agents
const session1 = await ws.startAgent({ prompt: 'Task 1' })
const session2 = await ws.startAgent({ prompt: 'Task 2' })

// Get all sessions
const sessions = ws.getSessions()
// [{ id: 'abc', state: 'running' }, { id: 'def', state: 'waiting_input' }]

// Listen to all sessions
ws.on('session:text', (sessionId, text) => {
  updateTaskbar(sessionId, text)
})

ws.on('session:state', (sessionId, state) => {
  if (state === 'waiting_input') {
    highlightTask(sessionId)  // Show notification
  }
})

// Get session status for UI
const status = session1.getStatus()
// { state: 'running', currentStep: 'Analyzing files', lastActivity: '2s ago' }
```

---

### Feature 9: Server-Side Helpers (Next.js + Express)

**Description**: Pre-built server handlers for Next.js and Express.

**Acceptance Criteria**:
- [ ] `createWebSocketHandler()` for Express with ws library
- [ ] `createNextWebSocketHandler()` for Next.js custom server
- [ ] Handles connection lifecycle, session management, message routing
- [ ] Integrates with existing `runPythonAgentStreaming` function
- [ ] TypeScript types for all handlers

**API**:
```typescript
// Express
import { createWebSocketHandler } from '@anthropic/claude-agent-sdk/server'
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ server })
wss.on('connection', createWebSocketHandler({
  onSession: async (session, ws) => {
    // Handle new agent session
    await runPythonAgentStreaming({
      prompt: session.prompt,
      websocket: ws,  // Pass WebSocket connection
      onStream: { /* callbacks */ }
    })
  }
}))

// Next.js (custom server)
// pages/api/agent/ws.ts
import { createNextWebSocketHandler } from '@anthropic/claude-agent-sdk/server'

export default createNextWebSocketHandler({
  onSession: async (session, connection) => {
    // Same pattern
  }
})
```

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (Browser/Node)                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  AgentWebSocket                                         ││
│  │  - Connection management                                 ││
│  │  - Auto-reconnect                                        ││
│  │  - Session multiplexing                                  ││
│  │  - Message serialization                                 ││
│  └──────────────────────┬──────────────────────────────────┘│
└─────────────────────────┼───────────────────────────────────┘
                          │ WebSocket (wss://)
                          │ JSON messages
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Server (Next.js / Express)                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  WebSocket Handler                                       ││
│  │  - Connection management                                 ││
│  │  - Session state (in-memory)                            ││
│  │  - Message routing                                       ││
│  └──────────────────────┬──────────────────────────────────┘│
│                         │                                    │
│  ┌──────────────────────┼──────────────────────────────────┐│
│  │  Session Manager     │                                   ││
│  │  - Session lifecycle ←───────────────────────────────┐  ││
│  │  - State checkpoints                                 │  ││
│  │  - Timeout handling                                  │  ││
│  └──────────────────────┬───────────────────────────────┼──┘│
└─────────────────────────┼───────────────────────────────┼───┘
                          │                               │
                          ↓                               │
┌─────────────────────────────────────────────────────────┼───┐
│  E2B Sandbox                                            │   │
│  ┌─────────────────────────────────────────────────────┐│   │
│  │  Claude Agent (Python)                              ││   │
│  │  - claude_agent_sdk.query()                         ││   │
│  │  - ask_user tool (built-in) ────────────────────────┼┘   │
│  │  - JSON events to stdout                            │    │
│  └─────────────────────────────────────────────────────┘│   │
└─────────────────────────────────────────────────────────────┘
```

### Message Protocol

All messages are JSON with this structure:

```typescript
interface WebSocketMessage {
  type: 'start' | 'input' | 'cancel' | 'pause' | 'resume' | 'approve' | 'reject'
       | 'text' | 'tool_use' | 'tool_result' | 'question' | 'approval_request'
       | 'state' | 'error' | 'result'
  sessionId: string
  data: any
  timestamp: number
}
```

**Client → Server messages**:
- `start`: Start new agent session
- `input`: Send user input
- `cancel`: Cancel session
- `pause`: Pause session
- `resume`: Resume session
- `approve`: Approve tool execution
- `reject`: Reject tool execution

**Server → Client messages**:
- `text`: Agent text output
- `tool_use`: Tool being executed
- `tool_result`: Tool output
- `question`: Agent asking for input (from `ask_user` tool)
- `approval_request`: Tool waiting for approval
- `state`: Session state change
- `error`: Error occurred
- `result`: Final result

### Integration with Claude Agent SDK

The Python `ask_user` tool in Claude Agent SDK:
1. Agent calls `ask_user("Should I proceed?")`
2. SDK pauses execution, emits JSON event to stdout
3. TypeScript handler receives event, fires `onUserInputRequired`
4. User responds via WebSocket
5. Response injected into sandbox stdin
6. Agent receives response, continues

### Session State Machine

```
                    ┌──────────────┐
                    │   created    │
                    └──────┬───────┘
                           │ start
                           ↓
              ┌────────────────────────┐
              │        running         │←─────────────┐
              └────────────┬───────────┘              │
                    ┌──────┴──────┐                   │
                    ↓             ↓                   │
         ┌──────────────┐  ┌──────────────┐          │
         │waiting_input │  │  paused      │          │
         └──────┬───────┘  └──────┬───────┘          │
                │ respond         │ resume            │
                └────────┬────────┘                   │
                         └────────────────────────────┘
                    ┌──────┴──────┐
                    ↓             ↓
         ┌──────────────┐  ┌──────────────┐
         │  completed   │  │  cancelled   │
         └──────────────┘  └──────────────┘
```

### File Structure

```
examples/lib/
├── agent.ts              # Existing - add websocket option
├── streaming.ts          # Existing - add WS message parsing
├── websocket/
│   ├── client.ts         # Client-side WebSocket wrapper
│   ├── server.ts         # Server-side handlers
│   ├── protocol.ts       # Message types and serialization
│   ├── session.ts        # Session state management
│   └── index.ts          # Public exports
└── server/
    ├── express.ts        # Express WebSocket handler
    └── nextjs.ts         # Next.js WebSocket handler
```

---

## Test Strategy

### Unit Tests

1. **Message Protocol**
   - Serialize/deserialize all message types
   - Handle malformed messages gracefully
   - Validate required fields

2. **Session State Machine**
   - State transitions are valid
   - Invalid transitions throw errors
   - Timeouts trigger correctly

3. **Client Reconnection**
   - Exponential backoff timing
   - Session restoration after reconnect
   - Max attempts respected

### Integration Tests

1. **Full Round-Trip**
   - Start session → agent runs → completes
   - Start session → send input → agent receives → continues
   - Start session → cancel → graceful stop

2. **Agent Questions**
   - Agent asks question → user responds → agent continues
   - Agent asks question → timeout → configured behavior triggers

3. **Multi-Session**
   - Multiple sessions on one connection
   - Correct message routing
   - Session isolation

### E2E Tests

1. **Express Server**
   - WebSocket connection lifecycle
   - Full agent execution with interactions

2. **Next.js Server**
   - Custom server WebSocket handling
   - Integration with existing SSE routes

---

## Edge Cases

### Network Interruption
- **Scenario**: WebSocket disconnects mid-execution
- **Handling**: Auto-reconnect, resume session if within timeout window
- **Fallback**: If reconnect fails, agent continues but client misses events

### User Abandonment
- **Scenario**: User closes browser while agent waiting for input
- **Handling**: Timeout fires, configured behavior (error/default/continue)
- **Cleanup**: Session marked as timed out, resources released

### Concurrent Modifications
- **Scenario**: User sends cancel while input is in-flight
- **Handling**: Cancel takes precedence, input is ignored
- **State**: Clear state machine prevents race conditions

### Sandbox Crash
- **Scenario**: E2B sandbox crashes mid-execution
- **Handling**: Error event sent, session marked as failed
- **Recovery**: User can start new session (no automatic retry)

### Very Long Questions
- **Scenario**: Agent asks question with large context
- **Handling**: Messages chunked if >64KB
- **Display**: Client assembles chunks before displaying

### Rapid State Changes
- **Scenario**: User spam-clicks pause/resume
- **Handling**: Debounce on client (500ms), queue on server
- **State**: Only final state applied after debounce

---

## Open Questions

1. **Should WebSocket work through Vercel/Cloudflare?**
   - Vercel's WebSocket support requires specific patterns
   - May need separate documentation for edge deployments
   - Consider: fallback to long-polling?

2. **How long should paused sessions stay alive?**
   - Currently: 10 minutes default
   - E2B cost implications for keeping sandboxes alive
   - Should there be a max?

3. **Should we support binary messages?**
   - Currently: JSON only
   - Binary could improve performance for large payloads
   - Added complexity may not be worth it for V1

4. **Rate limiting on user input?**
   - Prevent spam/abuse
   - How many messages per second?
   - Server-side or client-side enforcement?

---

## Implementation Notes

### Phase 1: Core WebSocket (Week 1)
- WebSocket client wrapper with reconnection
- Message protocol implementation
- Basic server handler (Express)
- `websocket: true` flag in SDK

### Phase 2: Interactions (Week 2)
- `sendInput()` implementation
- `ask_user` tool integration
- `cancel()` with graceful stop
- Session state machine

### Phase 3: Advanced Features (Week 3)
- Multi-session support
- Pause/resume
- Tool approval workflow
- Next.js handler

### Phase 4: Polish (Week 4)
- Comprehensive tests
- Documentation
- Example applications
- Performance optimization

---

## Dependencies

- **ws** (npm): WebSocket library for Node.js server
- **isomorphic-ws** (npm): Universal WebSocket client
- **E2B SDK**: Existing dependency, no changes needed
- **Claude Agent SDK** (Python): Uses built-in `ask_user` tool

---

## Non-Goals (Explicitly Out of Scope)

- **Database persistence**: Sessions are in-memory only. Persistent storage is a separate feature.
- **Multi-user collaboration**: Single user per session. Shared sessions are future work.
- **Agent-to-agent WebSocket**: Agents don't communicate with each other via WebSocket.
- **Custom authentication**: No auth middleware included. Users implement their own.
- **Offline support**: No service worker or offline queue. Requires active connection.
