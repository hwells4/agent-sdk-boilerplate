---
status: pending
priority: p2
issue_id: "003"
tags: [code-review, security, cost-control]
dependencies: []
---

# No Rate Limiting on startSandboxRun Action

## Problem Statement

The `startSandboxRun` action has no rate limiting. A malicious or buggy client could create thousands of E2B sandboxes rapidly, causing significant cloud costs.

**Why it matters**: E2B charges per sandbox-second. Unrestricted sandbox creation is a cost attack vector.

## Findings

### Location: convex/actions/startSandboxRun.ts:25-124

The action only validates:
- Authentication (line 37-40)
- Workspace membership (line 43-49)
- Template ID exists (line 51-54)

No rate limiting on:
- Sandboxes per user per time window
- Sandboxes per workspace per time window
- Concurrent sandboxes per workspace

## Proposed Solutions

### Option 1: Application-Level Rate Limiting (Recommended)
**Pros**: Works within Convex, no external dependencies
**Cons**: Not as robust as dedicated rate limiter
**Effort**: Medium (2-4 hours)

Track recent sandbox creations and reject if limit exceeded:
```typescript
// Query recent sandbox runs for this user
const recentRuns = await ctx.runQuery(internal.sandboxRuns.countRecentByUser, {
  userId: identity.subject,
  sinceMs: 60 * 1000, // Last minute
});

if (recentRuns > 10) {
  throw new Error("Rate limit exceeded: max 10 sandboxes per minute");
}
```

### Option 2: Workspace-Level Concurrent Limit
Limit concurrent running sandboxes per workspace:
```typescript
const runningCount = await ctx.runQuery(internal.sandboxRuns.countRunning, {
  workspaceId: args.workspaceId,
});

if (runningCount >= 5) {
  throw new Error("Maximum concurrent sandboxes reached");
}
```

## Acceptance Criteria

- [ ] Rate limit on sandbox creation per user (e.g., 10/min)
- [ ] Limit on concurrent sandboxes per workspace (e.g., 5)
- [ ] Clear error messages for rate limit violations

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in security review |
