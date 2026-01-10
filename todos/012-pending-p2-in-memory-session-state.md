---
status: resolved
priority: p2
issue_id: "012"
tags: [code-review, architecture]
dependencies: ["003"]
resolved_at: 2026-01-10
resolution: "Implemented Option 2 - Added TTL (30 min) and periodic cleanup (every 60s) with lastActivityAt tracking"
---

# Session Management Uses In-Memory State with No Cleanup

## Problem Statement

`activeSessions` is stored in a module-level `Map` with no automatic cleanup, expiration, or persistence. Sessions accumulate indefinitely, process restart loses all sessions, and orphaned sandboxes remain if the process crashes.

## Findings

**File:** `examples/lib/sessions.ts:39`

```typescript
const activeSessions = new Map<string, ConversationSession>()
```

**Problems:**
1. **Memory leak:** Sessions accumulate indefinitely if `endSession()` not called
2. **No persistence:** Process restart loses all active sessions
3. **No coordination:** Multiple server instances cannot share session state
4. **Orphaned sandboxes:** If TypeScript process crashes, persistent sandboxes remain running

## Proposed Solutions

### Option 1: Integrate with Convex (Recommended)
Create a `sessions` table in Convex, track session-to-sandbox mapping.

```typescript
// In schema.ts
sessions: defineTable({
  sessionId: v.string(),
  workspaceId: v.id("workspaces"),
  sandboxRunId: v.optional(v.id("sandboxRuns")),
  status: v.union(v.literal("active"), v.literal("ended")),
  createdAt: v.number(),
  lastActivityAt: v.number(),
  turnCount: v.number(),
})
```

**Pros:**
- Persistent across restarts
- Cron job can clean up orphaned sessions
- Multi-instance safe

**Cons:**
- Significant refactoring
- Latency for session operations

**Effort:** Large
**Risk:** Medium

### Option 2: Add TTL and Cleanup
Keep in-memory but add expiration and periodic cleanup.

```typescript
const SESSION_TTL_MS = 30 * 60 * 1000  // 30 minutes

// Cleanup interval
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of activeSessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      endSession(id)
    }
  }
}, 60 * 1000)
```

**Pros:**
- Simple implementation
- Reduces memory leak

**Cons:**
- Still loses state on restart
- Still single-instance only

**Effort:** Small
**Risk:** Low

### Option 3: Delete sessions.ts (Per Simplification Review)
The simplification review identified sessions.ts as YAGNI - full implementation for "planned" feature that's barely used.

**Pros:**
- Removes 374 lines of unused code
- No maintenance burden

**Cons:**
- Lose multi-turn conversation capability

**Effort:** Small
**Risk:** Low

## Recommended Action

If sessions ARE needed: Option 1 (integrate with Convex)
If sessions NOT critical: Option 3 (delete file)

This depends on product requirements - are multi-turn conversations a core feature?

## Technical Details

**Affected files:**
- `examples/lib/sessions.ts`
- `convex/schema.ts` (if Option 1)
- `examples/multi_turn_conversation.ts` (example using sessions)

**Acceptance Criteria:**
- [ ] Sessions either integrated with Convex OR removed
- [ ] No orphaned sandboxes on process crash
- [ ] Clear documentation on session lifecycle

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during architecture review |
| 2026-01-10 | Resolved | Implemented Option 2: TTL + periodic cleanup |

## Resources

- `convex/schema.ts` - existing schema patterns
- `examples/multi_turn_conversation.ts` - only consumer of sessions
