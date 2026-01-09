---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, performance, index]
dependencies: []
---

# Missing Composite Index for internalFindStuckBooting Query

## Problem Statement

The `internalFindStuckBooting` query fetches all sandboxes with status "booting" then filters in memory by `startedAt`. This is inefficient compared to `internalFindIdle` which uses a composite index.

**Why it matters**: During traffic spikes, many sandboxes may be booting simultaneously. The cron job will load all of them to find just the stuck ones.

## Findings

### Location: convex/sandboxRuns.ts:454-464
```typescript
// Get all booting sandboxes
const bootingSandboxes = await ctx.db
  .query("sandboxRuns")
  .withIndex("by_status", (q) => q.eq("status", "booting"))
  .collect();

// Filter to sandboxes that have been booting too long
return bootingSandboxes.filter((run) => {
  return run.startedAt < cutoffTime;
});
```

### Contrast with internalFindIdle (correct pattern)
```typescript
// Uses by_status_activity composite index for filtering at DB level
.withIndex("by_status_activity", (q) =>
  q.eq("status", "running").lt("lastActivityAt", cutoffTime)
)
```

## Proposed Solutions

### Option 1: Add by_status_startedAt Composite Index (Recommended)
**Effort**: Low (15 min)
**Risk**: Low

```typescript
// In schema.ts:
.index("by_status_startedAt", ["status", "startedAt"])

// In sandboxRuns.ts:
const stuckBootingSandboxes = await ctx.db
  .query("sandboxRuns")
  .withIndex("by_status_startedAt", (q) =>
    q.eq("status", "booting").lt("startedAt", cutoffTime)
  )
  .collect();
```

## Acceptance Criteria

- [ ] Composite index exists for status + startedAt
- [ ] internalFindStuckBooting uses index-level filtering
- [ ] No in-memory filtering on timestamp fields

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in performance review |
