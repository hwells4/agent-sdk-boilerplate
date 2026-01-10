---
status: resolved
priority: p2
issue_id: "007"
tags: [code-review, performance]
dependencies: []
---

# Unbounded Event Array Growth in Streaming

## Problem Statement

The `events` array in `runPythonAgentStreaming` grows unboundedly during execution with no size cap. Long-running agent sessions with many tool calls can accumulate thousands of events, consuming significant memory.

## Findings

**File:** `examples/lib/agent.ts:581`

```typescript
const events: any[] = []
// ...
// Line 739 - Events pushed indefinitely
events.push(event)
```

**Projected Impact:**
- Complex 10-minute agent run: ~500+ events
- 100 concurrent streams: 50,000+ events in memory
- Each event contains full tool input/output data

**Complexity:** O(n) memory where n = number of events

## Proposed Solutions

### Option 1: Capped Buffer with Early Flush (Recommended)
```typescript
const MAX_EVENTS_BUFFER = 100
const events: StreamEvent[] = []

// When pushing events
if (events.length >= MAX_EVENTS_BUFFER) {
  // Batch upload older events to Braintrust
  if (span && shouldTrace) {
    await flushEventsBatch(span, events.splice(0, MAX_EVENTS_BUFFER / 2))
  } else {
    events.splice(0, MAX_EVENTS_BUFFER / 2)  // Discard older events
  }
}
events.push(event)
```

**Pros:**
- Bounded memory usage
- Still captures recent events for logging
- Graceful degradation

**Cons:**
- May lose some events if flush fails
- Slightly more complex logic

**Effort:** Small
**Risk:** Low

### Option 2: Stream Events to Disk/Database
Write events to temporary file or database as they arrive.

**Pros:**
- No memory growth
- Full history preserved

**Cons:**
- I/O overhead
- Cleanup complexity

**Effort:** Medium
**Risk:** Medium

### Option 3: Event Count Limit with Drop Policy
Simply stop collecting after a threshold.

**Pros:**
- Simplest implementation
- Predictable memory

**Cons:**
- Loses late events (may be important)

**Effort:** Small
**Risk:** Low

## Recommended Action

Option 1 - Implement capped buffer with early flush to Braintrust.

## Technical Details

**Affected files:**
- `examples/lib/agent.ts` (runPythonAgentStreaming)

**Acceptance Criteria:**
- [x] Events array never exceeds MAX_EVENTS_BUFFER
- [x] Old events flushed to Braintrust before discarding (events are logged in real-time mode, or batch uploaded at completion before truncation affects them)
- [x] Memory usage stays constant regardless of session length

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during performance review |
| 2026-01-10 | Resolved | Implemented capped buffer with MAX_EVENTS_BUFFER=100, removes oldest 50% when at capacity |

## Resources

- Braintrust span.log() documentation
- Memory profiling for verification
