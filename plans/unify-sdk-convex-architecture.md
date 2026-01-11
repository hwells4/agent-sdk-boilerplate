# Unify SDK and Convex Architecture

**Status**: In Progress (Phases 1-5 Complete)
**Priority**: P1 - Core Architecture
**Created**: 2025-01-10
**Updated**: 2026-01-10

## Problem Statement

The SDK currently has two completely separate architectures for sandbox management that don't communicate:

1. **Ephemeral Mode** (`examples/lib/agent.ts`) - Direct E2B SDK usage
2. **Managed Mode** (`convex/actions/`) - Convex-backed state machine

This contradicts the project's core value proposition: an **opinionated, no-boilerplate SDK** that utilizes E2B and Convex together. Instead, users must choose between:

- Simple SDK functions with no persistence/tracking
- Convex backend that tracks lifecycle but doesn't execute agents

## Current Architecture Analysis

### Ephemeral Mode (`agent.ts`)

**What it has:**
- Complete agent execution logic
- Real-time streaming with callbacks
- Cost tracking (Claude API + E2B compute)
- Observability (Braintrust tracing)
- Error categorization and handling
- Multi-turn session support
- Python code generation templates

**What it lacks:**
- No database persistence
- No audit trail
- No state machine
- No cron-based cleanup for orphans
- No rate limiting
- No multi-tenant workspace isolation

```typescript
// Current: Everything happens in memory, then disappears
const result = await runPythonAgent({ prompt: 'task' })
// No record this ever happened
```

### Managed Mode (`convex/actions/startSandboxRun.ts`)

**What it has:**
- Full state machine: `booting` → `running` → `succeeded/failed/canceled`
- Database persistence (`sandboxRuns` table)
- Workspace-based multi-tenancy
- Rate limiting (max runs per minute per user)
- Cron-based orphan cleanup
- Artifact storage schema

**What it lacks:**
- **No actual agent execution** - just creates sandbox and stops
- No streaming support
- No cost tracking integration
- No observability integration
- No Python agent code - users must implement their own

```typescript
// Current: Creates sandbox, returns IDs, does nothing else
const { sandboxRunId, sandboxId } = await startSandboxRun({
  threadId: 'thread-1',
  workspaceId: workspace._id,
  prompt: 'task',
})
// Now what? User must manually:
// 1. Connect to sandbox
// 2. Write Python agent code
// 3. Execute it
// 4. Handle streaming
// 5. Update Convex state
// 6. Calculate costs
// 7. Clean up
```

### The Gap

| Capability | Ephemeral Mode | Managed Mode |
|------------|----------------|--------------|
| Agent execution | ✅ Full | ❌ None |
| Streaming | ✅ Full | ❌ None |
| Cost tracking | ✅ Full | ❌ None |
| Observability | ✅ Braintrust | ❌ None |
| State persistence | ❌ None | ✅ Full |
| Audit trail | ❌ None | ✅ Full |
| Rate limiting | ❌ None | ✅ Full |
| Orphan cleanup | ❌ Manual | ✅ Cron |
| Multi-tenancy | ❌ None | ✅ Workspaces |

**Users cannot get both columns without significant custom integration work.**

## Proposed Unified Architecture

### Design Principles

1. **Convex is optional** - SDK works standalone, Convex adds persistence
2. **Single execution path** - One codebase for agent execution
3. **Progressive enhancement** - Add `workspaceId` to enable tracking
4. **Zero breaking changes** - Existing API continues to work

### New SDK Interface

```typescript
interface UnifiedAgentConfig {
  prompt: string
  timeout?: number
  verbose?: boolean

  // Observability (existing)
  observability?: {
    mode?: 'batch' | 'realtime'
    sample?: number
  }

  // Streaming (existing)
  onStream?: StreamCallbacks

  // NEW: Convex integration (optional)
  convex?: {
    client: ConvexClient           // Convex client instance
    workspaceId: Id<"workspaces">  // Workspace for multi-tenancy
    threadId?: string              // Thread grouping (auto-generated if omitted)
    persistArtifacts?: boolean     // Save files to Convex storage (default: false)
  }
}
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     runPythonAgent(config)                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ config.convex set?  │
                    └─────────────────────┘
                         │           │
                        YES          NO
                         │           │
                         ▼           │
         ┌───────────────────────┐   │
         │ Create sandboxRun     │   │
         │ status: 'booting'     │   │
         └───────────────────────┘   │
                         │           │
                         ▼           │
         ┌───────────────────────┐   │
         │ Rate limit check      │   │
         └───────────────────────┘   │
                         │           │
                         └─────┬─────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Create E2B Sandbox  │
                    └─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Update: 'running'   │◄── Only if Convex enabled
                    └─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Execute Python      │
                    │ Agent with          │
                    │ Streaming           │
                    └─────────────────────┘
                               │
                      ┌───────┴───────┐
                      │               │
                   Success         Failure
                      │               │
                      ▼               ▼
         ┌─────────────────┐  ┌─────────────────┐
         │ Update:         │  │ Update:         │
         │ 'succeeded'     │  │ 'failed'        │
         │ + cost metrics  │  │ + error details │
         └─────────────────┘  └─────────────────┘
                      │               │
                      └───────┬───────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Kill Sandbox        │
                   └─────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Return Result       │
                   └─────────────────────┘
```

### Usage Examples

#### Standalone (No Convex) - Existing Behavior

```typescript
import { runPythonAgent } from './examples/lib/agent'

// Works exactly as before - no changes needed
const result = await runPythonAgent({
  prompt: 'Create a hello world script',
  timeout: 120,
  verbose: true,
})
```

#### With Convex Persistence

```typescript
import { runPythonAgent } from './examples/lib/agent'
import { ConvexClient } from 'convex/browser'

const convex = new ConvexClient(process.env.CONVEX_URL!)

const result = await runPythonAgent({
  prompt: 'Create a hello world script',
  timeout: 120,
  verbose: true,
  convex: {
    client: convex,
    workspaceId: 'k17abc123...' as Id<"workspaces">,
    threadId: 'conversation-456',  // Groups related runs
    persistArtifacts: true,        // Save created files
  },
  onStream: {
    onText: (text) => console.log(text),
    onToolUse: (id, name, input) => {
      // Stream events still work
    },
  },
})

// Result is the same, but now also:
// - sandboxRuns table has full execution record
// - Cost metrics stored for analytics
// - Artifacts saved to Convex storage
// - Rate limiting was enforced
// - Orphan cleanup will catch any failures
```

#### Streaming with Real-time State Updates

```typescript
const result = await runPythonAgentStreaming({
  prompt: 'Build a REST API',
  convex: {
    client: convex,
    workspaceId: workspace._id,
  },
  onStream: {
    onToolUse: async (id, name, input) => {
      // Convex automatically updates lastActivityAt
      // UI subscribed to sandboxRun sees real-time activity
    },
  },
})
```

## Implementation Plan

### Phase 1: Core Unification ✅ COMPLETE

**Goal**: Single execution path with optional Convex persistence

1. **Add Convex client injection to agent.ts** ✅
   - Accept optional `ConvexClient` in config
   - Create sandboxRun record if client provided
   - Update state machine during execution
   - Store final metrics on completion

2. **Extract shared execution logic** ✅
   - Move Python agent generation to shared module (already done: `python-templates.ts`)
   - Create unified error handling that works with/without Convex
   - Ensure cost tracking writes to Convex if available

3. **Create convex-integration.ts module** ✅ (NEW)
   - Typed helpers: createSandboxRunRecord, markSandboxRunning, markSandboxSucceeded, markSandboxFailed
   - Heartbeat support for long-running tasks
   - String truncation for Convex storage limits
   - Constants synced between SDK and Convex

4. **Sessions Convex integration** ✅ (NEW)
   - Multi-turn sessions tracked as single sandbox runs
   - Activity updates on each turn prevent orphan cleanup
   - SessionConfig with optional convex field

5. **Deprecate standalone Convex actions** (TODO)
   - Mark `startSandboxRun` as deprecated
   - Provide migration guide
   - Keep cron cleanup (still needed)

### Phase 2: SDK Functions Integration ✅ COMPLETE

**Goal**: SDK functions integrated with Convex tracking

1. **runPythonAgent Convex integration** ✅
   - Optional convex field in AgentConfig
   - Create sandbox run record on start
   - Update state on success/failure
   - Persist cost data

2. **runPythonAgentStreaming Convex integration** ✅
   - Heartbeat support for long-running tasks
   - Cost data persistence on completion

### Phase 3: Sessions Integration ✅ COMPLETE

**Goal**: Multi-turn sessions tracked in Convex

1. **SessionConfig with Convex field** ✅
   - Sessions create sandbox run records
   - Activity updates prevent orphan cleanup
   - Success/failure tracked on session end

### Phase 4: Artifact Persistence ✅ COMPLETE

**Goal**: Capture and persist sandbox artifacts

1. **Convex storage integration** ✅
   - convex/storage.ts with upload URL generation
   - Blob upload to Convex storage

2. **Artifact capture helpers** ✅
   - captureArtifacts() in convex-integration.ts
   - File type and MIME type inference
   - Size limits and exclusion patterns

3. **Integration in execution flow** ✅
   - Artifacts captured before sandbox.kill()
   - Controlled by persistArtifacts config flag
   - Works in agent.ts and sessions.ts

### Phase 5: Analytics & Trace Correlation ✅ COMPLETE

**Goal**: Full analytics and Braintrust trace linking

1. **Trace correlation** ✅
   - getByTraceId query for Braintrust->Convex lookup
   - by_braintrustTraceId index for O(1) trace lookups
   - Enables correlation from Braintrust dashboard to Convex records

2. **Cost analytics** ✅
   - getCostAnalytics query aggregates workspace costs
   - Total Claude/E2B costs, token usage, duration metrics
   - Time-period filtering for reporting

3. **Execution analytics** ✅
   - getExecutionTrends query for time-series data
   - Configurable bucket size (hourly, daily, etc.)
   - Success/failure rates, average duration, costs over time

4. **Error analytics** ✅
   - getErrorAnalytics query groups errors by code
   - Count, last occurrence, sample message per error type
   - Sorted by frequency for quick issue identification

### Phase 6: Advanced Features (TODO)

**Goal**: Production-ready multi-tenant platform

1. **Billing integration**
   - Per-workspace usage tracking
   - Usage-based billing support
   - Cost alerts and limits

2. **Enhanced rate limiting**
   - Per-workspace limits
   - Burst allowances
   - Priority queuing

3. **Audit logging**
   - Who ran what, when
   - Prompt history (with retention policies)
   - Compliance reporting

## Schema Changes

### sandboxRuns Table Updates

```typescript
sandboxRuns: defineTable({
  // Existing fields...
  threadId: v.string(),
  workspaceId: v.id("workspaces"),
  createdBy: v.string(),
  sandboxId: v.optional(v.string()),
  status: sandboxStatusValidator,
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  lastActivityAt: v.number(),
  error: v.optional(v.object({ ... })),

  // NEW: Execution metadata
  prompt: v.optional(v.string()),           // Stored prompt (truncated)
  promptHash: v.optional(v.string()),       // For deduplication

  // NEW: Cost tracking
  cost: v.optional(v.object({
    claudeInputTokens: v.number(),
    claudeOutputTokens: v.number(),
    claudeCachedTokens: v.number(),
    claudeCostUsd: v.number(),
    e2bDurationSeconds: v.number(),
    e2bCostUsd: v.number(),
    totalCostUsd: v.number(),
  })),

  // NEW: Execution stats
  stats: v.optional(v.object({
    toolCalls: v.number(),
    turnsCount: v.number(),
    filesCreated: v.number(),
    filesModified: v.number(),
  })),

  // NEW: Result summary
  result: v.optional(v.string()),           // Final result (truncated)
  resultHash: v.optional(v.string()),       // For result lookup
})
```

## Migration Path

### For Existing Ephemeral Mode Users

**No changes required.** Existing code continues to work:

```typescript
// This still works exactly as before
const result = await runPythonAgent({ prompt: 'task' })
```

### For Existing Convex Users

**Migrate from actions to SDK:**

```typescript
// Before (manual integration)
const { sandboxRunId } = await startSandboxRun({ ... })
// ... manual execution code ...
await updateSandboxRun({ sandboxRunId, status: 'succeeded' })

// After (unified SDK)
const result = await runPythonAgent({
  prompt: 'task',
  convex: { client, workspaceId },
})
// Everything handled automatically
```

## File Changes Summary

| File | Change | Status |
|------|--------|--------|
| `examples/lib/agent.ts` | Add Convex integration, state machine updates, artifact capture | ✅ Done |
| `examples/lib/convex-integration.ts` | NEW: Convex client wrapper + artifact capture helpers | ✅ Done |
| `examples/lib/sessions.ts` | Add Convex integration + artifact capture for multi-turn | ✅ Done |
| `examples/lib/constants.ts` | Add STRING_LIMITS, ARTIFACT_LIMITS, sync with Convex | ✅ Done |
| `convex/schema.ts` | Add cost, stats, result fields, braintrustTraceId index | ✅ Done (Phase 1, 5) |
| `convex/sandboxRuns.ts` | Add mutations + analytics queries (getCostAnalytics, getExecutionTrends, getErrorAnalytics, getByTraceId) | ✅ Done (Phase 1, 5) |
| `convex/storage.ts` | NEW: Storage upload URL generation for artifacts | ✅ Done (Phase 4) |
| `convex/artifacts.ts` | Artifact creation mutations (pre-existing) | ✅ Done (Phase 4) |
| `convex/lib/constants.ts` | Sync timeouts with SDK | ✅ Done (Phase 1) |
| `convex/actions/startSandboxRun.ts` | Deprecate, keep for backwards compat | TODO |
| `convex/actions/killIdleSandboxes.ts` | Keep as-is (still needed) | No change |
| `CLAUDE.md` | Update architecture documentation | TODO |

## Success Criteria

1. **Single API for all use cases** - Users don't choose between modes
2. **Zero breaking changes** - Existing code works without modification
3. **Optional persistence** - Convex enhances but isn't required
4. **Full feature parity** - Streaming, cost tracking, observability work with Convex
5. **Production ready** - Rate limiting, orphan cleanup, error handling

## Open Questions

1. **Convex client injection** - Should we accept a client instance or connection string?
2. **Real-time state updates** - How frequently should we update `lastActivityAt`?
3. **Prompt storage** - Store full prompt or just hash for privacy?
4. **Artifact streaming** - Sync vs async upload during execution?

## References

- Current agent.ts: `examples/lib/agent.ts`
- Current Convex schema: `convex/schema.ts`
- Current startSandboxRun: `convex/actions/startSandboxRun.ts`
- E2B SDK: https://e2b.dev/docs
- Convex: https://docs.convex.dev
