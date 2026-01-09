---
status: pending
priority: p3
issue_id: "009"
tags: [code-review, cleanup, simplicity]
dependencies: []
---

# Delete backfillWorkspaceId Migration Mutation

## Problem Statement

The `backfillWorkspaceId` mutation is migration code that should have been run and removed. It's dead code in a boilerplate.

**Why it matters**: Boilerplates should be minimal. Users copying this code get confusion about when/why to use this mutation.

## Findings

### Location: convex/artifacts.ts:223-259
```typescript
/**
 * Backfill workspaceId for existing artifacts that don't have it set.
 * Run this after schema migration to populate denormalized workspaceId field.
 * ...
 */
export const backfillWorkspaceId = internalMutation({
  // ... 37 lines of migration code
});
```

### Issues
1. One-time migration code in production codebase
2. No indication if it's been run
3. Uses type assertion hack: `(artifact as { workspaceId?: unknown })`
4. N+1 query pattern (fetches sandboxRun per artifact)

## Proposed Solutions

### Option 1: Delete Entirely (Recommended for Boilerplate)
**Effort**: Trivial (5 min)

Since this is a boilerplate, new users will start fresh with the schema that already includes `workspaceId`. No migration needed.

### Option 2: Move to migrations/ Directory
If keeping for reference, move to a `convex/migrations/` directory with clear documentation that it's historical.

## Acceptance Criteria

- [ ] backfillWorkspaceId mutation removed from artifacts.ts
- [ ] File is 30 lines shorter
- [ ] No dead code confusing users

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in simplicity review |
