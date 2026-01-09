---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, security, authorization]
dependencies: []
---

# Any Workspace Member Can Cancel Any Sandbox Run

## Problem Statement

The `cancelSandboxRun` action allows any workspace member to cancel any sandbox run in that workspace. There's no check that the user is the run's creator or has elevated permissions.

**Why it matters**: A regular member could disrupt another user's work by canceling their sandboxes.

## Findings

### Location: convex/actions/cancelSandboxRun.ts:45-51
```typescript
// Step 3: Verify the user has access to the workspace
const membership = await ctx.runQuery(internal.workspaceMembers.internalGetMembership, {
  workspaceId: sandboxRun.workspaceId,
  userId: identity.subject,
});
if (membership === null) {
  throw new Error("Unauthorized: must be a workspace member to cancel this sandbox run");
}
// No check for: identity.subject === sandboxRun.createdBy || membership.role !== "member"
```

## Proposed Solutions

### Option 1: Restrict to Creator or Admin/Owner (Recommended)
**Pros**: Clear permission model, protects user work
**Cons**: May be overly restrictive for small teams
**Effort**: Low (15 min)

```typescript
// Only allow creator, admins, or owners to cancel
if (sandboxRun.createdBy !== identity.subject && membership.role === "member") {
  throw new Error("Unauthorized: only the creator or admins can cancel this sandbox run");
}
```

### Option 2: Add "canCancel" Permission Flag
More flexible but more complex.

## Acceptance Criteria

- [ ] Regular members can only cancel their own sandbox runs
- [ ] Admins and owners can cancel any sandbox run in their workspace
- [ ] Clear error message for unauthorized cancellation attempts

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in security review |
