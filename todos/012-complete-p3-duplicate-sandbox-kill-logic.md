---
status: pending
priority: p3
issue_id: "012"
tags: [code-review, dry, maintainability]
dependencies: []
---

# Duplicated Sandbox Kill Logic in Two Actions

## Problem Statement

The sandbox killing logic (connect to E2B, kill, log if already dead) is duplicated between `killIdleSandboxes` and `cancelSandboxRun`.

**Why it matters**: DRY violation - changes must be made in two places.

## Findings

### Location 1: convex/actions/killIdleSandboxes.ts:56-67
```typescript
if (run.sandboxId) {
  try {
    const sandbox = await Sandbox.connect(run.sandboxId);
    await sandbox.kill();
  } catch (sandboxError) {
    console.log(
      `Sandbox ${run.sandboxId} may already be terminated: ${sandboxError}`
    );
  }
}
```

### Location 2: convex/actions/cancelSandboxRun.ts:55-65
```typescript
if (sandboxRun.sandboxId) {
  try {
    const sandbox = await Sandbox.connect(sandboxRun.sandboxId);
    await sandbox.kill();
  } catch (sandboxError) {
    console.log(
      `Sandbox ${sandboxRun.sandboxId} may already be terminated: ${sandboxError}`
    );
  }
}
```

Nearly identical code.

## Proposed Solutions

### Option 1: Extract killSandboxSafely Helper (Recommended)
**Effort**: Low (15 min)

```typescript
// convex/lib/e2b.ts
import { Sandbox } from "@e2b/code-interpreter";

export async function killSandboxSafely(sandboxId: string | undefined): Promise<boolean> {
  if (!sandboxId) return false;

  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.kill();
    return true;
  } catch (error) {
    console.log(`Sandbox ${sandboxId} may already be terminated: ${error}`);
    return false;
  }
}
```

## Acceptance Criteria

- [ ] Shared helper function for sandbox killing
- [ ] Both actions use the helper
- [ ] Consistent logging behavior

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in pattern recognition review |
