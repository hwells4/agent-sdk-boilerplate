---
status: completed
priority: p2
issue_id: "011"
tags: [code-review, performance]
dependencies: []
---

# Repeated Console Handler Creation per Event

## Problem Statement

A new `consoleHandler` is created for every single streaming event inside the line-buffered handler callback, causing hundreds of function allocations per execution.

## Findings

**File:** `examples/lib/agent.ts:746-756`

```typescript
// Inside the forEach callback - runs for EVERY event
const consoleHandler = createConsoleStreamHandler({
  ...onStream,
  onResult: (result, durationMs, cost) => {
    finalResult = result
    if (onStream?.onResult) {
      onStream.onResult(result, durationMs, cost)
    }
  },
})
consoleHandler(line)
```

**Impact:**
- 500 events = 500 function allocations
- GC pressure increases proportionally
- Memory fragmentation over time

**Complexity:** O(n) allocations where n = events

## Proposed Solutions

### Option 1: Hoist Handler Creation (Recommended)
```typescript
// Create once, outside the callback
const consoleHandler = createConsoleStreamHandler({
  ...onStream,
  onResult: (result, durationMs, cost) => {
    finalResult = result
    if (onStream?.onResult) {
      onStream.onResult(result, durationMs, cost)
    }
  },
})

const streamHandler = createLineBufferedHandler((line) => {
  const event = parseStreamEvent(line)
  if (!event) {
    process.stdout.write(line + '\n')
    return
  }
  events.push(event)
  logEventToSpan(event)
  consoleHandler(line)  // Reuse same handler
})
```

**Pros:**
- Single allocation
- Eliminates GC pressure
- Simpler code

**Cons:**
- Minor refactoring

**Effort:** Small (15 minutes)
**Risk:** None

## Recommended Action

Option 1 - Hoist handler creation outside the loop.

## Technical Details

**Affected files:**
- `examples/lib/agent.ts` (runPythonAgentStreaming)

**Acceptance Criteria:**
- [x] Console handler created once per streaming call
- [x] Same functionality preserved
- [x] Reduced memory allocations verified

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during performance review |
| 2026-01-10 | Completed | Hoisted consoleHandler creation outside callback |

## Resources

- JavaScript closure and allocation patterns
