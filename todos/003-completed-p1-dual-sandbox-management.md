---
status: completed
priority: p1
issue_id: "003"
tags: [code-review, architecture]
dependencies: []
---

# Dual State Management Creates Consistency Risks

## Problem Statement

The system has two independent code paths for sandbox management that are not integrated:
1. **SDK Layer** (`examples/lib/agent.ts`): Direct E2B sandbox creation/killing, no Convex involvement
2. **Convex Layer** (`convex/actions/startSandboxRun.ts`): Full state machine with Convex tracking

Sandboxes created via SDK functions bypass Convex entirely, causing cost tracking gaps and orphan potential.

## Findings

**SDK Path (No Tracking):**
- `runPythonAgent()` - Creates sandbox directly, no Convex record
- `runPythonAgentStreaming()` - Creates sandbox directly, no Convex record
- `runPythonAgentDetailed()` - Creates sandbox directly, no Convex record

**Convex Path (Full Tracking):**
- `startSandboxRun` action - Creates Convex record, then sandbox
- Cron job only cleans up Convex-tracked sandboxes

**Problems:**
1. SDK-created sandboxes are invisible to Convex
2. Cron job cannot clean up SDK-created orphans
3. Cost tracking gap (e2bCost never populated for SDK runs)
4. Confusion about which path to use

## Proposed Solutions

### Option 1: Unify on Convex-Managed Path (Recommended)
Modify SDK functions to optionally register with Convex.

```typescript
interface AgentConfig {
  // ... existing fields
  convex?: {
    workspaceId: Id<"workspaces">
    threadId: string
  }
}

export async function runPythonAgent(config: AgentConfig): Promise<string> {
  // If convex config provided, register sandbox run
  if (config.convex) {
    const sandboxRunId = await convexClient.action(api.actions.startSandboxRun, {
      ...config.convex,
      prompt: config.prompt,
    })
    // Use the managed sandbox
  } else {
    // Current ephemeral behavior
  }
}
```

**Pros:**
- Single code path for managed sandboxes
- Full cost and lifecycle tracking
- Backward compatible (convex config optional)

**Cons:**
- Requires Convex client in SDK
- More complex configuration

**Effort:** Medium
**Risk:** Medium

### Option 2: Remove Convex Sandbox Management
Delete the Convex layer, SDK handles all sandbox management.

**Pros:**
- Simpler architecture
- Single path

**Cons:**
- Loses persistence and multi-tenant features
- No cron cleanup

**Effort:** Large
**Risk:** High

### Option 3: Document as Separate Modes
Keep both paths but clearly document "ephemeral" vs "managed" modes.

**Pros:**
- No code changes
- Flexibility for different use cases

**Cons:**
- Still have orphan risk
- Cost tracking gap remains

**Effort:** Small
**Risk:** Low (but doesn't fix issues)

## Recommended Action

Option 1 - Add optional Convex integration to SDK functions. This provides unified tracking while maintaining backward compatibility.

## Technical Details

**Affected files:**
- `examples/lib/agent.ts`
- `examples/lib/sessions.ts`
- `convex/actions/startSandboxRun.ts`

**Acceptance Criteria:**
- [ ] SDK functions can optionally register runs with Convex
- [ ] All registered sandboxes are tracked and cleaned up
- [ ] Cost tracking works for managed sandboxes
- [x] Clear documentation on ephemeral vs managed modes

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during architecture review |
| 2026-01-10 | Resolved via Option 3 | Added "Sandbox Management Modes" section to CLAUDE.md and architecture comment to agent.ts |

## Resources

- `convex/actions/startSandboxRun.ts` - Existing managed path
- `examples/lib/agent.ts` - SDK functions to modify
