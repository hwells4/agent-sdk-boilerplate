---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, performance, optimization]
dependencies: []
---

# Sequential Queries in listByThread Should Be Parallel

## Problem Statement

The `listByThread` query executes two independent database queries sequentially instead of in parallel, doubling the latency.

**Why it matters**: Easy performance win - parallel queries reduce latency by ~50%.

## Findings

### Location: convex/sandboxRuns.ts:280-292
```typescript
// Get all sandbox runs for this thread
const runs = await ctx.db
  .query("sandboxRuns")
  .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
  .collect();

// Get user's workspace memberships to filter accessible runs
const memberships = await ctx.db
  .query("workspaceMembers")
  .withIndex("by_user", (q) => q.eq("userId", identity.subject))
  .collect();
```

These queries are independent but executed sequentially.

## Proposed Solutions

### Option 1: Use Promise.all for Parallel Execution (Recommended)
**Effort**: Trivial (5 min)

```typescript
const [runs, memberships] = await Promise.all([
  ctx.db
    .query("sandboxRuns")
    .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
    .collect(),
  ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", identity.subject))
    .collect(),
]);
```

## Acceptance Criteria

- [ ] Both queries execute in parallel
- [ ] Query latency reduced by ~50%
- [ ] No functional changes to behavior

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in performance review |
