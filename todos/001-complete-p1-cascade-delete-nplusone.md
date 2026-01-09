---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, performance, critical]
dependencies: []
---

# N+1 Query Pattern in Workspace Cascade Delete

## Problem Statement

The `workspaces.remove` mutation performs N+1 artifact queries - one query per sandbox run. With 1,000 sandbox runs, this generates 1,000 parallel database queries, risking timeout and memory exhaustion.

**Why it matters**: This is a boilerplate - users will copy this pattern. A workspace with many runs will fail to delete.

## Findings

### Location: convex/workspaces.ts:133-140
```typescript
// 2. Query all artifacts in parallel (one query per run)
const artifactsByRun = await Promise.all(
  sandboxRuns.map((run) =>
    ctx.db
      .query("artifacts")
      .withIndex("by_run", (q) => q.eq("sandboxRunId", run._id))
      .collect()
  )
);
```

### Impact at Scale
| Sandbox Runs | Artifact Queries | Likely Outcome |
|--------------|------------------|----------------|
| 100 | 100 | Works |
| 1,000 | 1,000 | May timeout |
| 5,000 | 5,000 | Will timeout |

## Proposed Solutions

### Option 1: Add by_workspace Index on Artifacts (Recommended)
**Pros**: Single query for all artifacts, O(1) lookup
**Cons**: Index already exists (`by_workspace_review`), but not a simple `by_workspace`
**Effort**: Low (30 min)
**Risk**: Low

```typescript
// In schema.ts, add:
.index("by_workspace", ["workspaceId"])

// In workspaces.ts:
const artifacts = await ctx.db
  .query("artifacts")
  .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
  .collect();
```

### Option 2: Use Existing by_workspace_review Index with Multiple States
Query artifacts by workspace for each review state (3 queries instead of N).

## Acceptance Criteria

- [ ] Workspace deletion uses O(1) queries for artifacts
- [ ] Deletion of workspace with 1,000+ sandbox runs completes successfully
- [ ] No in-memory joins or N+1 patterns

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in performance review |
