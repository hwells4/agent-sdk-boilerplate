---
status: resolved
priority: p2
issue_id: "010"
tags: [code-review, performance, data-integrity]
dependencies: []
---

# Missing Composite Index for threadId + workspaceId Queries

## Problem Statement

`listByThread` query loads ALL runs for a thread, then filters by workspace membership in memory. This is inefficient for shared threads with many runs across workspaces.

## Findings

**File:** `convex/sandboxRuns.ts:281-296`

```typescript
const [runs, memberships] = await Promise.all([
  ctx.db
    .query("sandboxRuns")
    .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
    .collect(),  // Loads ALL runs for thread
  // ...
]);

// Filter in memory
return runs.filter((run) => memberWorkspaceIds.has(run.workspaceId.toString()));
```

**Impact:**
- Shared thread with 1000 runs across 10 workspaces
- User belongs to 1 workspace
- Loads 1000 documents, returns 100 (10% efficiency)

**Complexity:** O(n) where n = all runs for thread (should be O(k) where k = user's runs)

## Proposed Solutions

### Option 1: Add Composite Index (Recommended)
```typescript
// In schema.ts, add index:
sandboxRuns: defineTable({...})
  .index("by_thread_workspace", ["threadId", "workspaceId"])

// In query:
const memberWorkspaceIds = memberships.map(m => m.workspaceId)

// Query per workspace (parallel)
const runsByWorkspace = await Promise.all(
  memberWorkspaceIds.map(workspaceId =>
    ctx.db.query("sandboxRuns")
      .withIndex("by_thread_workspace", q =>
        q.eq("threadId", args.threadId).eq("workspaceId", workspaceId)
      )
      .collect()
  )
)
return runsByWorkspace.flat()
```

**Pros:**
- Efficient filtering at index level
- Scales with user's workspace count, not total runs

**Cons:**
- Multiple queries (one per workspace)
- Schema migration needed

**Effort:** Small-Medium
**Risk:** Low

### Option 2: Paginate and Filter
Keep current approach but paginate.

**Pros:**
- No schema change

**Cons:**
- Still loads unnecessary data
- More API calls

**Effort:** Small
**Risk:** Low

## Recommended Action

Option 1 - Add `by_thread_workspace` composite index.

## Technical Details

**Affected files:**
- `convex/schema.ts` (add index)
- `convex/sandboxRuns.ts` (update listByThread query)

**Acceptance Criteria:**
- [x] New composite index `by_thread_workspace` added
- [x] Query only loads runs for user's workspaces
- [x] Performance improved for shared threads

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during data integrity review |
| 2026-01-10 | Resolved | Added composite index and updated listByThread query |

## Resources

- Convex composite index documentation
- Requires `npx convex deploy` after schema change
