---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, performance, optimization]
dependencies: []
---

# getArtifactAccess Fetches Unnecessary sandboxRun

## Problem Statement

The `getArtifactAccess` helper fetches the sandboxRun document to get the workspaceId, but artifacts now have `workspaceId` denormalized. This extra query is unnecessary.

**Why it matters**: Every artifact access check makes an extra DB read that could be avoided.

## Findings

### Location: convex/lib/authorization.ts:140-160
```typescript
export async function getArtifactAccess(...): Promise<ArtifactAccess | null> {
  const artifact = await ctx.db.get(artifactId);
  if (artifact === null) return null;

  const sandboxRun = await ctx.db.get(artifact.sandboxRunId);  // UNNECESSARY
  if (sandboxRun === null) return null;

  const membership = await getUserMembership(ctx, sandboxRun.workspaceId);  // Could use artifact.workspaceId
  // ...
}
```

### Schema Shows Denormalized Field
```typescript
// schema.ts:67
workspaceId: v.id("workspaces"), // Denormalized for efficient workspace+review queries
```

## Proposed Solutions

### Option 1: Use artifact.workspaceId Directly (Recommended)
**Effort**: Low (15 min)

```typescript
export async function getArtifactAccess(...): Promise<ArtifactAccess | null> {
  const artifact = await ctx.db.get(artifactId);
  if (artifact === null) return null;

  // Use denormalized workspaceId directly
  const membership = await getUserMembership(ctx, artifact.workspaceId);
  if (membership === null) return null;

  // Only fetch sandboxRun if caller actually needs it
  const sandboxRun = await ctx.db.get(artifact.sandboxRunId);

  return { artifact, sandboxRun, membership };
}
```

**Impact**: Saves 1 DB read per artifact access. For a page with 50 artifacts, saves 50 reads.

## Acceptance Criteria

- [ ] getArtifactAccess uses artifact.workspaceId for membership check
- [ ] Return type still includes sandboxRun (for callers that need it)
- [ ] No functional changes to authorization behavior

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in performance/architecture review |
