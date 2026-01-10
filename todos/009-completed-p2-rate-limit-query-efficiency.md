---
status: completed
priority: p2
issue_id: "009"
tags: [code-review, performance]
dependencies: []
---

# Rate Limiting Query Collects All Results Into Memory

## Problem Statement

`internalCountRecentByUser` uses `.collect()` which loads all matching documents into memory just to count them. For power users with many runs, this causes unnecessary memory usage.

## Findings

**File:** `convex/sandboxRuns.ts:511-518`

```typescript
const recentRuns = await ctx.db
  .query("sandboxRuns")
  .withIndex("by_createdBy_startedAt", (q) =>
    q.eq("createdBy", args.userId).gt("startedAt", cutoff)
  )
  .collect();  // Loads all documents!

return recentRuns.length;  // Only need count
```

**Impact:**
- Power user with 50 runs/minute: 50 full documents loaded
- Each document ~500 bytes = 25KB per rate limit check
- Rate limit checked on every sandbox creation

**Complexity:** O(k) memory where k = runs in window (should be O(1) for counting)

## Proposed Solutions

### Option 1: Use .take() with Threshold (Recommended)
```typescript
const RATE_LIMIT = 10
const recentRuns = await ctx.db
  .query("sandboxRuns")
  .withIndex("by_createdBy_startedAt", (q) =>
    q.eq("createdBy", args.userId).gt("startedAt", cutoff)
  )
  .take(RATE_LIMIT + 1);  // Only load max needed

return recentRuns.length;  // >= 11 means over limit
```

**Pros:**
- Constant memory regardless of user's run count
- Minimal code change
- Same functionality

**Cons:**
- Doesn't give exact count (not needed for rate limiting)

**Effort:** Small (5 minutes)
**Risk:** None

### Option 2: Separate Counter Table
Maintain a counter document per user, increment on create.

**Pros:**
- O(1) lookup
- Exact counts

**Cons:**
- Counter drift risk
- More complex implementation

**Effort:** Medium
**Risk:** Medium (consistency)

## Recommended Action

Option 1 - Use `.take(RATE_LIMIT + 1)` instead of `.collect()`. Simple, effective, no downsides.

## Technical Details

**Affected files:**
- `convex/sandboxRuns.ts` (internalCountRecentByUser)

**Acceptance Criteria:**
- [x] Query never loads more than RATE_LIMIT + 1 documents
- [x] Rate limiting behavior unchanged
- [x] Memory usage constant regardless of user's history

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during performance review |
| 2026-01-10 | Completed | Implemented .take(RATE_LIMIT + 1) instead of .collect() |

## Resources

- Convex query documentation
- `.take()` API reference
