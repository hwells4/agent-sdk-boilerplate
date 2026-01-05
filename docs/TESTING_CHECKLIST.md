# Braintrust Integration - Testing Checklist

> Comprehensive test plan for validating the Braintrust observability integration

**Last Updated:** 2026-01-04
**Integration Version:** Phase 2 Complete

---

## Prerequisites

Before running tests, verify:

- [ ] `.env` file exists with required variables:
  ```bash
  E2B_TEMPLATE_ID=<your-template-id>
  CLAUDE_CODE_OAUTH_TOKEN=<your-oauth-token>
  BRAINTRUST_API_KEY=<your-api-key>  # Optional for graceful degradation tests
  BRAINTRUST_PROJECT_NAME=claude-agent-sdk  # Optional
  ```
- [ ] Dependencies installed: `npm install`
- [ ] E2B template built: `npm run build:template`
- [ ] Braintrust account accessible at https://braintrust.dev/

---

## Phase 1: Basic Observability

### Test 1.1: Basic Agent Execution with Tracing

**Command:**
```bash
npm run example
```

**Expected Results:**
- [ ] ✅ "Braintrust observability enabled" message appears
- [ ] Agent executes successfully (returns `4` for math example)
- [ ] Cost breakdown displays:
  - [ ] Prompt tokens (may be 0)
  - [ ] Completion tokens (may be 0)
  - [ ] Claude total cost
  - [ ] E2B duration and CPU count
  - [ ] E2B total cost
  - [ ] Grand total
- [ ] "Braintrust traces flushed successfully" message at exit
- [ ] Exit code: 0

**Verify in Braintrust Dashboard:**
- [ ] Navigate to https://braintrust.dev/app/claude-agent-sdk
- [ ] Find trace with name "run_agent"
- [ ] Trace contains:
  - [ ] Input metadata (prompt substring)
  - [ ] Output (agent result)
  - [ ] Metrics (exitCode: 0, durationMs, tokens, costs)
  - [ ] Cost breakdown in metadata

---

### Test 1.2: Graceful Degradation (No Braintrust)

**Setup:**
```bash
# Temporarily remove Braintrust API key
mv .env .env.backup
grep -v BRAINTRUST .env.backup > .env
```

**Command:**
```bash
npm run example
```

**Expected Results:**
- [ ] ⚠️ "BRAINTRUST_API_KEY not set - observability disabled" warning appears
- [ ] Agent executes successfully (same functionality)
- [ ] Cost breakdown still displays
- [ ] Exit code: 0
- [ ] NO "Braintrust traces flushed" message

**Cleanup:**
```bash
mv .env.backup .env
```

---

### Test 1.3: Cost Tracking Accuracy

**Command:**
```bash
npm run example
```

**Verify:**
- [ ] E2B cost calculation:
  ```
  Expected: duration_seconds * (2 CPUs) * $0.000014 per vCPU/second
  Example: 28.5s * 2 * 0.000014 = $0.000798 ≈ $0.0008
  ```
- [ ] Claude cost calculation (if tokens > 0):
  - [ ] Prompt tokens at correct rate ($3/MTok for Sonnet 4.5)
  - [ ] Completion tokens at correct rate ($15/MTok)
  - [ ] Cached tokens discounted (25% of prompt cost)
- [ ] Total = Claude + E2B

**Cross-reference with Braintrust:**
- [ ] Costs in Braintrust match console output

---

## Phase 2: Streaming Observability

### Test 2.1: Streaming with Batch Mode (Default)

**Command:**
```bash
npm run test:observability
```

**Expected Results (Test 1 - Batch Mode):**
- [ ] "Test 1: Batch Mode (default)" section runs
- [ ] Console shows streaming events:
  - [ ] 🚀 Starting agent...
  - [ ] 🔧 Tool: [tool names]
  - [ ] 💬 Text output (if any)
  - [ ] ✅ Complete with duration and cost
- [ ] "[Batch] Tool:" callbacks fire
- [ ] "[Batch] Duration/Cost:" callback fires
- [ ] Result displays (first 100 chars)

**Verify in Braintrust:**
- [ ] Find trace named "run_agent_streaming"
- [ ] Trace contains:
  - [ ] All tool_use events (buffered, uploaded at end)
  - [ ] All tool_result events
  - [ ] Thinking events (if any, truncated to 500 chars)
  - [ ] Final metrics: eventCount, durationMs, tokens, costs
  - [ ] observabilityMode: "batch"

---

### Test 2.2: Streaming with Real-time Mode

**Expected Results (Test 2 - Real-time Mode):**
- [ ] "Test 2: Real-time Mode" section runs
- [ ] Console shows streaming events (same as batch)
- [ ] "[Realtime] Tool:" callbacks fire
- [ ] "[Realtime] Duration/Cost:" callback fires
- [ ] Result displays

**Verify in Braintrust:**
- [ ] Find trace named "run_agent_streaming"
- [ ] Events logged in real-time (not batched)
- [ ] observabilityMode: "realtime"
- [ ] All events present

**Performance Check:**
- [ ] Real-time mode overhead < 10% vs batch mode
- [ ] Compare durationMs between Test 1 (batch) and Test 2 (realtime)

---

### Test 2.3: Streaming Event Completeness

**Manual Verification:**

Run a streaming agent that uses multiple tools:
```bash
npm run streaming
```

**Expected Events:**
- [ ] `start` - Agent initialization
- [ ] `tool_use` - For each tool call (Bash, Read, Write, etc.)
- [ ] `tool_result` - For each tool output
- [ ] `thinking` - Extended thinking blocks
- [ ] `text` - Agent text responses
- [ ] `result` - Final result with cost/duration
- [ ] `complete` - Completion status

**Verify Each Event Type:**
- [ ] Tool names are correct
- [ ] Tool inputs are logged (may be truncated)
- [ ] Tool results captured (truncated to 500 chars in Braintrust)
- [ ] Thinking captured (truncated to 500 chars)
- [ ] Final cost and duration accurate

---

## Phase 3: Multi-Turn Conversations

### Test 3.1: Context Persistence Across Turns

**Command:**
```bash
npm run multi-turn
```

**Expected Results:**
- [ ] "Starting multi-turn conversation with context..." message
- [ ] Session ID displayed
- [ ] Sandbox ID displayed (one sandbox for entire session)

**Turn 1:**
- [ ] Question: "What is the capital of France?"
- [ ] Response: "Paris" (or equivalent)

**Turn 2:**
- [ ] Question: "What is the population of that city?"
- [ ] Response: Contains Paris population **← CRITICAL: Must reference Paris, not ask "which city?"**
- [ ] Context maintained ✅

**Turn 3:**
- [ ] Question: "What are the top 3 tourist attractions there?"
- [ ] Response: Lists Paris attractions **← CRITICAL: Must reference Paris, not ask "where?"**
- [ ] Context maintained ✅

**Session Cleanup:**
- [ ] "Conversation complete (3 turns)" message
- [ ] "Sandbox terminated" message
- [ ] Exit code: 0

**Verify in Braintrust:**
- [ ] Find conversation trace with name "conversation"
- [ ] Conversation metadata:
  - [ ] sessionId present
  - [ ] createdAt timestamp
  - [ ] turnCount: 3
  - [ ] conversationLength: 3
- [ ] Find 3 turn traces (turn-1, turn-2, turn-3)
- [ ] Each turn has metadata:
  - [ ] sessionId (same across all turns)
  - [ ] conversationTraceId (links to parent)
  - [ ] turnId / turnNumber
  - [ ] hasHistory (false for turn 1, true for turns 2-3)
- [ ] Turn 2 and 3 inputs contain previous conversation history

---

### Test 3.2: Session Lifecycle Management

**Create a custom test:**

```typescript
import { createSession, executeTurn, endSession, getSession, getActiveSessions } from './lib/sessions'

async function testSessionLifecycle() {
  // Create session
  const session = await createSession()
  console.log('Session created:', session.sessionId)

  // Verify session exists
  const retrieved = getSession(session.sessionId)
  console.assert(retrieved !== undefined, 'Session should exist')
  console.assert(getActiveSessions().length === 1, 'Should have 1 active session')

  // Execute a turn
  await executeTurn(session.sessionId, 'Say hello')
  console.assert(session.turnCount === 1, 'Turn count should be 1')
  console.assert(session.conversationHistory.length === 1, 'History should have 1 entry')

  // End session
  await endSession(session.sessionId)
  console.assert(getSession(session.sessionId) === undefined, 'Session should be removed')
  console.assert(getActiveSessions().length === 0, 'Should have 0 active sessions')

  console.log('✅ Session lifecycle test passed')
}
```

**Expected:**
- [ ] Session creation succeeds
- [ ] Session retrieval works
- [ ] Active sessions tracked correctly
- [ ] Turn execution updates session state
- [ ] Session cleanup removes from active sessions

---

### Test 3.3: Persistent Sandbox Performance

**Measure:**

Multi-turn with persistent sandbox:
```bash
time npm run multi-turn
```

Compare to 3 individual agent calls:
```bash
time npm run example  # Run 3 times
```

**Expected:**
- [ ] Persistent sandbox: ~3 turns worth of execution time
- [ ] Individual calls: ~3x (sandbox creation + execution + cleanup)
- [ ] Persistent approach saves ~2-5 seconds per turn (no sandbox creation overhead)

---

## Phase 4: Error Tracking

### Test 4.1: Environment Variable Errors

**Setup:**
```bash
# Remove E2B_TEMPLATE_ID temporarily
mv .env .env.backup
grep -v E2B_TEMPLATE_ID .env.backup > .env
```

**Command:**
```bash
npm run example 2>&1 | head -30
```

**Expected:**
- [ ] Error message displays:
  ```
  ❌ Agent Error (unknown)
     Missing required environment variables
     ...
  ```
- [ ] Error is formatted (not raw stack trace)
- [ ] Contains debugging info
- [ ] Exit code: 1

**Cleanup:**
```bash
mv .env.backup .env
```

---

### Test 4.2: Sandbox Creation Failure

**This is hard to test directly, but verify the code path exists:**

```bash
# Check error handling is present
grep -A 10 "Failed to create E2B sandbox" examples/lib/agent.ts
```

**Expected:**
- [ ] Error catch block exists around `Sandbox.create()`
- [ ] Calls `createAgentError('sandbox_error', ...)`
- [ ] Includes execution time in context

---

### Test 4.3: Agent Execution Failure

**Create a test that forces failure:**

```typescript
import { runPythonAgent } from './lib/agent'

async function testFailure() {
  try {
    await runPythonAgent({
      prompt: 'Run this bash command: exit 1',
      verbose: true
    })
  } catch (error: any) {
    console.log('Caught error:', error.message)
    // Verify error format
    console.assert(error.message.includes('❌ Agent Error'), 'Should be formatted error')
    console.assert(error.message.includes('Exit code:'), 'Should include exit code')
  }
}
```

**Expected:**
- [ ] Error is caught and formatted
- [ ] Error type categorized (likely 'unknown' or 'tool_error')
- [ ] Exit code included
- [ ] Stderr included
- [ ] Trace URL included (if Braintrust enabled)

**Verify in Braintrust:**
- [ ] Failed trace exists
- [ ] Error logged with full context
- [ ] Metrics include exitCode != 0

---

### Test 4.4: Error Categorization

**Verify categorization logic:**

```typescript
import { categorizeError } from './lib/error-tracking'

// Test timeout
console.assert(categorizeError(124, '') === 'timeout', 'Exit 124 should be timeout')

// Test API error
console.assert(categorizeError(1, 'API authentication failed') === 'api_error', 'API string should categorize as api_error')

// Test tool error
console.assert(categorizeError(127, 'command not found') === 'tool_error', 'Command not found should be tool_error')

// Test sandbox error
console.assert(categorizeError(1, 'sandbox connection failed') === 'sandbox_error', 'Sandbox string should categorize')

// Test unknown
console.assert(categorizeError(1, 'random error') === 'unknown', 'Unknown errors should categorize as unknown')

console.log('✅ Error categorization tests passed')
```

---

## Phase 5: Integration Tests

### Test 5.1: All Features Together

**Create a comprehensive test:**

```bash
# 1. Run basic example
npm run example

# 2. Run streaming test
npm run test:observability

# 3. Run multi-turn
npm run multi-turn
```

**Expected:**
- [ ] All 3 tests complete successfully
- [ ] Total execution time < 5 minutes
- [ ] All traces appear in Braintrust
- [ ] No crashes or hangs

---

### Test 5.2: Performance Overhead

**Baseline (without Braintrust):**
```bash
# Disable Braintrust
mv .env .env.backup
grep -v BRAINTRUST .env.backup > .env

# Measure
time npm run example
# Note the duration

# Re-enable
mv .env.backup .env
```

**With Braintrust:**
```bash
time npm run example
# Note the duration
```

**Calculate Overhead:**
```
Overhead = (With Braintrust - Baseline) / Baseline * 100%
```

**Expected:**
- [ ] Overhead < 10% for basic execution
- [ ] Overhead < 15% for streaming (real-time mode)
- [ ] Overhead < 5% for streaming (batch mode)

---

### Test 5.3: Backward Compatibility

**Verify existing code still works:**

```typescript
// Old API (Phase 0 - no observability)
import { runPythonAgent } from './lib/agent'

await runPythonAgent({
  prompt: 'What is 2+2?',
  timeout: 120,
  verbose: true
})

// Should still work identically
```

**Expected:**
- [ ] No TypeScript compilation errors
- [ ] No runtime errors
- [ ] Works with and without BRAINTRUST_API_KEY
- [ ] All original config options supported

---

## Phase 6: Braintrust Dashboard Verification

### Test 6.1: Trace Visibility

**Navigate to:** https://braintrust.dev/app/claude-agent-sdk

**Expected:**
- [ ] Project "claude-agent-sdk" exists (or your custom name)
- [ ] Multiple traces visible (from previous tests)
- [ ] Trace types:
  - [ ] run_agent (basic execution)
  - [ ] run_agent_streaming (streaming)
  - [ ] conversation (multi-turn parent)
  - [ ] turn-1, turn-2, turn-3 (multi-turn children)

---

### Test 6.2: Trace Content

**Click on a "run_agent" trace:**

**Expected:**
- [ ] Input section:
  - [ ] Contains prompt (or substring)
  - [ ] Contains metadata (if any)
- [ ] Output section:
  - [ ] Contains agent result
- [ ] Metrics section:
  - [ ] exitCode: 0
  - [ ] durationMs: <actual time>
  - [ ] promptTokens: <count>
  - [ ] completionTokens: <count>
  - [ ] cachedTokens: <count>
  - [ ] totalCost: <dollar amount>
  - [ ] claudeCost: <dollar amount>
  - [ ] e2bCost: <dollar amount>
- [ ] Metadata section:
  - [ ] costBreakdown: { claude: {...}, e2b: {...}, total: ... }

---

### Test 6.3: Streaming Trace Events

**Click on a "run_agent_streaming" trace:**

**Expected:**
- [ ] Multiple log entries (events)
- [ ] Events include:
  - [ ] event: "tool_use" with tool name and input
  - [ ] event: "tool_result" with output (truncated)
  - [ ] event: "thinking" with thinking content (truncated)
- [ ] Final log entry with:
  - [ ] output: <final result>
  - [ ] metrics: { eventCount, durationMs, tokens, costs, observabilityMode }

---

### Test 6.4: Multi-Turn Conversation Linking

**Find a "conversation" trace:**

**Expected:**
- [ ] Metadata contains sessionId
- [ ] Metadata contains turnCount
- [ ] Metadata contains conversationLength

**Find corresponding turn traces (turn-1, turn-2, turn-3):**

**Expected:**
- [ ] Each has metadata.sessionId matching parent
- [ ] Each has metadata.conversationTraceId
- [ ] Each has metadata.turnNumber (1, 2, 3)
- [ ] Turn 2 and 3 have metadata.hasHistory: true

**Verify linkage:**
- [ ] Can filter traces by sessionId to see full conversation
- [ ] Turn order is chronological

---

## Phase 7: Edge Cases

### Test 7.1: Empty Prompt

```typescript
await runPythonAgent({ prompt: '' })
```

**Expected:**
- [ ] Agent executes (may return empty or error)
- [ ] Trace logged to Braintrust
- [ ] No crash

---

### Test 7.2: Very Long Prompt

```typescript
const longPrompt = 'A'.repeat(10000)
await runPythonAgent({ prompt: longPrompt })
```

**Expected:**
- [ ] Agent executes
- [ ] Trace logs only first 100 chars in metadata
- [ ] Full prompt sent to agent (not truncated)
- [ ] No performance degradation

---

### Test 7.3: Concurrent Agent Executions

```typescript
const results = await Promise.all([
  runPythonAgent({ prompt: 'What is 1+1?' }),
  runPythonAgent({ prompt: 'What is 2+2?' }),
  runPythonAgent({ prompt: 'What is 3+3?' }),
])
```

**Expected:**
- [ ] All 3 agents complete successfully
- [ ] 3 separate traces in Braintrust
- [ ] No race conditions or conflicts
- [ ] Results are correct and distinct

---

### Test 7.4: Concurrent Sessions

```typescript
const [session1, session2] = await Promise.all([
  createSession(),
  createSession(),
])

await Promise.all([
  executeTurn(session1.sessionId, 'Hello from session 1'),
  executeTurn(session2.sessionId, 'Hello from session 2'),
])

await Promise.all([
  endSession(session1.sessionId),
  endSession(session2.sessionId),
])
```

**Expected:**
- [ ] Both sessions created successfully
- [ ] Sessions have different IDs
- [ ] Turns execute in correct sessions
- [ ] No context leakage between sessions
- [ ] Both sessions clean up properly

---

## Phase 8: Documentation & Examples

### Test 8.1: README Accuracy

**Verify:**
- [ ] All example commands in README.md work
- [ ] Code snippets compile without errors
- [ ] API documentation matches actual interfaces
- [ ] Environment variable instructions are correct

---

### Test 8.2: Example Code

**Run each example:**
- [ ] `npm run example` - Works ✅
- [ ] `npm run streaming` - Works ✅
- [ ] `npm run console-streaming` - Works ✅
- [ ] `npm run sse-api` - Works (manual browser test) ✅
- [ ] `npm run multi-turn` - Works ✅
- [ ] `npm run test:observability` - Works ✅

---

### Test 8.3: TypeScript Types

**Verify all exports are typed:**

```typescript
import {
  runPythonAgent,
  runPythonAgentStreaming,
  runPythonAgentDetailed,
  AgentConfig,
  StreamingAgentConfig,
  AgentResult,
} from './lib/agent'

import {
  createSession,
  executeTurn,
  endSession,
  getSession,
  getActiveSessions,
  ConversationSession,
} from './lib/sessions'

import {
  createAgentError,
  formatAgentError,
  categorizeError,
  AgentError,
} from './lib/error-tracking'

import {
  StreamCallbacks,
  StreamEvent,
  parseStreamEvent,
  createConsoleStreamHandler,
  createLineBufferedHandler,
} from './lib/streaming'
```

**Expected:**
- [ ] No TypeScript errors
- [ ] All types properly exported
- [ ] IntelliSense works in IDE

---

## Test Summary Template

After running all tests, complete this summary:

```
# Braintrust Integration - Test Results

**Date:** YYYY-MM-DD
**Tester:** [Your Name]
**Environment:** [macOS/Linux/Windows]
**Node Version:** [node --version]
**Branch:** [git branch]

## Results

- Phase 1: Basic Observability: [ ] PASS / [ ] FAIL
- Phase 2: Streaming Observability: [ ] PASS / [ ] FAIL
- Phase 3: Multi-Turn Conversations: [ ] PASS / [ ] FAIL
- Phase 4: Error Tracking: [ ] PASS / [ ] FAIL
- Phase 5: Integration Tests: [ ] PASS / [ ] FAIL
- Phase 6: Braintrust Dashboard: [ ] PASS / [ ] FAIL
- Phase 7: Edge Cases: [ ] PASS / [ ] FAIL
- Phase 8: Documentation: [ ] PASS / [ ] FAIL

## Issues Found

1. [Issue description]
   - Steps to reproduce:
   - Expected:
   - Actual:
   - Severity: [Critical/High/Medium/Low]

## Performance Metrics

- Basic execution overhead: X%
- Streaming (batch) overhead: X%
- Streaming (realtime) overhead: X%
- Multi-turn context maintained: [ ] YES / [ ] NO

## Overall Status

[ ] READY FOR PRODUCTION
[ ] NEEDS FIXES
[ ] BLOCKED

**Notes:**
[Any additional observations]
```

---

## Automated Test Script (Future)

**TODO:** Create a test runner script:

```bash
#!/bin/bash
# test-braintrust-integration.sh

echo "Running Braintrust Integration Tests..."

# Phase 1
npm run example || exit 1

# Phase 2
npm run test:observability || exit 1

# Phase 3
npm run multi-turn || exit 1

echo "✅ All automated tests passed!"
```

---

## Notes for Testers

1. **Braintrust Dashboard Access**: Ensure you can access the dashboard before starting
2. **Clean State**: Run tests in a clean environment (no stale traces)
3. **Network**: Some tests require internet access for E2B and Braintrust
4. **Costs**: Tests will incur small E2B compute costs (~$0.01 total)
5. **Time**: Full test suite takes ~10-15 minutes to run manually

---

## Questions to Answer During Testing

- [ ] Are all traces appearing in Braintrust dashboard?
- [ ] Are costs calculated correctly?
- [ ] Is context maintained across multi-turn conversations?
- [ ] Do errors provide enough debugging information?
- [ ] Is performance overhead acceptable?
- [ ] Is the API intuitive and easy to use?
- [ ] Are error messages helpful?
- [ ] Does graceful degradation work (without Braintrust)?

---

**End of Testing Checklist**
