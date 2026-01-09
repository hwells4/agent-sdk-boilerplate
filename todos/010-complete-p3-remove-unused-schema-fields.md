---
status: pending
priority: p3
issue_id: "010"
tags: [code-review, cleanup, yagni]
dependencies: []
---

# Remove Unused/Speculative Schema Fields

## Problem Statement

Several schema fields are defined but never populated or used. This is YAGNI (You Aren't Gonna Need It) violation in a boilerplate.

**Why it matters**: Extra fields confuse users about what the boilerplate actually supports.

## Findings

### 1. previewText Field (artifacts)
**Location**: convex/schema.ts:75
```typescript
previewText: v.optional(v.string()),
```
**Issue**: No code generates or uses preview text.

### 2. e2bCost Field (sandboxRuns)
**Location**: convex/schema.ts:50
```typescript
e2bCost: v.optional(v.number()),
```
**Issue**: Nothing ever writes a cost value. E2B cost tracking would require API integration that doesn't exist.

### 3. Per-Run Timeout Fields
**Location**: convex/schema.ts:48-49
```typescript
maxDurationMs: v.optional(v.number()),
idleTimeoutMs: v.optional(v.number()),
```
**Issue**: These are stored per-run but the cron job uses global constants (`IDLE_TIMEOUT_MS`). The per-run values are never read for timeout decisions.

### 4. error.code and error.details
**Location**: convex/schema.ts:53-55
```typescript
error: v.optional(v.object({
  message: v.string(),
  code: v.optional(v.string()),
  details: v.optional(v.string()),
}))
```
**Issue**: Only `message` is ever populated. `code` and `details` are never set meaningfully.

## Proposed Solutions

### Option 1: Remove Unused Fields (Recommended for Boilerplate)
**Effort**: Low (30 min)

Remove:
- `previewText` from artifacts
- `e2bCost` from sandboxRuns
- Simplify `error` to just `v.optional(v.string())`

### Option 2: Add TODO Comments
If keeping for future use, add `// TODO: Implement cost tracking` comments.

### Option 3: Use Per-Run Timeouts (If Keeping)
Actually use `idleTimeoutMs` in `killIdleSandboxes`:
```typescript
const idleTimeoutMs = run.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
```

## Acceptance Criteria

- [ ] Unused fields removed or clearly documented as "planned"
- [ ] Schema accurately reflects actual functionality
- [ ] No speculative features confusing users

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in simplicity review |
