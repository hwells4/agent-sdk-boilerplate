---
status: pending
priority: p3
issue_id: "013"
tags: [code-review, documentation, security]
dependencies: []
---

# Document Security Contract for Internal Functions

## Problem Statement

Internal functions (`internalCreate`, `internalUpdate`, etc.) bypass authentication but rely on callers to have validated authorization. This contract is implicit and undocumented.

**Why it matters**: Future developers may misuse internal functions, creating security holes.

## Findings

### Pattern: Internal functions trust caller did auth
- `convex/sandboxRuns.ts:312` - `internalCreate` (no auth check)
- `convex/sandboxRuns.ts:358` - `internalUpdate` (no auth check)
- `convex/artifacts.ts:85` - `internalCreate` (no auth check)
- `convex/workspaceMembers.ts:190` - `internalGetMembership` (read-only, less critical)

### Current Documentation
No explicit documentation about the security model. The comment at line 304-305 mentions "bypasses auth for action use" but doesn't explain the caller's responsibility.

## Proposed Solutions

### Option 1: Add JSDoc Security Contract (Recommended)
**Effort**: Low (15 min)

```typescript
/**
 * Internal mutation - SECURITY CONTRACT:
 * - Caller MUST verify user has workspace membership before calling
 * - Authorization is NOT checked within this function
 * - Only use from actions that have already validated auth via internalGetMembership
 *
 * @internal
 */
export const internalCreate = internalMutation({...})
```

### Option 2: Add lib/SECURITY.md
Document the overall security model for the Convex backend.

## Acceptance Criteria

- [ ] All internal functions have JSDoc explaining security requirements
- [ ] Callers' responsibilities clearly documented
- [ ] New developers understand the pattern

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in architecture review |
