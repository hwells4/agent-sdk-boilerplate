---
status: pending
priority: p3
issue_id: "011"
tags: [code-review, cleanup, performance]
dependencies: []
---

# Remove Unused by_review_state Index

## Problem Statement

The `by_review_state` index on artifacts is defined but never used. The `listPending` query uses `by_workspace_review` instead.

**Why it matters**: Unused indexes add write overhead and storage cost.

## Findings

### Location: convex/schema.ts:83
```typescript
.index("by_review_state", ["reviewState"])
```

### Evidence of Non-Use
Grep for `by_review_state` shows only the schema definition. No query uses it:
- `listPending` uses `by_workspace_review` (artifacts.ts:284)
- No other artifact queries filter by review state alone

### Contrast with by_workspace_review (Used)
```typescript
.index("by_workspace_review", ["workspaceId", "reviewState"]) // Line 84 - USED
```

## Proposed Solutions

### Option 1: Remove the Index (Recommended)
**Effort**: Trivial (5 min)

Delete line 83 from schema.ts.

## Acceptance Criteria

- [ ] `by_review_state` index removed from schema
- [ ] No functional impact (index was never used)
- [ ] Slightly reduced write overhead

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in pattern recognition review |
