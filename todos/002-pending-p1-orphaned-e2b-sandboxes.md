---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, data-integrity, architecture]
dependencies: []
---

# Orphaned E2B Sandboxes on Partial Failure

## Problem Statement

When E2B sandbox creation succeeds but the subsequent Convex update fails, the sandbox continues running without a recorded `sandboxId` in Convex. These orphaned sandboxes cannot be cleaned up by the cron job and continue accumulating costs.

## Findings

**File:** `convex/actions/startSandboxRun.ts:74-136`

**Failure Scenario:**
```
1. Line 74: internalCreate succeeds -> sandboxRunId created with status "booting"
2. Line 86: Sandbox.create() succeeds -> E2B sandbox running
3. Line 97-102: internalUpdate FAILS (network issue, Convex down)
4. Line 127: sandbox.kill() may or may not succeed
5. Result: Convex record stuck in "booting" (no sandboxId), E2B sandbox orphaned
```

**Impact:**
- Orphaned sandboxes accumulate costs
- `internalFindStuckBooting` finds these records but they lack `sandboxId`
- `killSandboxSafely` cannot kill them (no sandboxId to connect to)

## Proposed Solutions

### Option 1: Store sandboxId Before Status Transition (Recommended)
```typescript
// Step 2: Create E2B sandbox
sandbox = await Sandbox.create(templateId, {...});

// Step 2.5: Store sandboxId immediately (still in booting state)
await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
  sandboxRunId,
  sandboxId: sandbox.sandboxId,  // Store this first!
  lastActivityAt: Date.now(),
});

// Step 3: Then transition to running
await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
  sandboxRunId,
  status: "running",
  lastActivityAt: Date.now(),
});
```

**Pros:**
- Ensures sandboxId is always recorded if sandbox exists
- Cron job can clean up stuck "booting" sandboxes with sandboxId
- Minimal code change

**Cons:**
- Extra mutation call

**Effort:** Small
**Risk:** Low

### Option 2: Return sandboxId in Sandbox.create metadata
Store sandboxId in E2B metadata, query E2B API in cleanup cron.

**Pros:**
- Doesn't require extra Convex mutation

**Cons:**
- Requires E2B API integration in cron job
- More complex implementation

**Effort:** Medium
**Risk:** Medium

## Recommended Action

Option 1 - Store sandboxId in a separate mutation immediately after sandbox creation.

## Technical Details

**Affected files:**
- `convex/actions/startSandboxRun.ts`

**Acceptance Criteria:**
- [ ] sandboxId is stored in Convex before status transitions to "running"
- [ ] Cron job can kill sandboxes stuck in "booting" that have sandboxId
- [ ] No orphaned E2B sandboxes on partial failures

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during data integrity review |

## Resources

- E2B Sandbox API documentation
- `convex/actions/killIdleSandboxes.ts` for cron job logic
