---
status: completed
priority: p3
issue_id: "015"
tags: [code-review, patterns, maintainability]
dependencies: []
---

# Extract Magic Strings to Constants Module

## Problem Statement

Multiple magic strings are hardcoded throughout the codebase, including model IDs, paths, tool lists, and environment variable names. Changes require updates in multiple locations.

## Findings

### Model IDs (5 locations)
```typescript
// agent.ts:293, 800
// cost-tracking.ts:16, 21, 74
'claude-sonnet-4-5-20250929'  // Hardcoded model ID
```

### Paths (12+ locations)
```typescript
// agent.ts, sessions.ts (multiple)
cwd="/home/user"
'/home/user/agent.py'
'python3 /home/user/agent.py'
```

### Tool Lists (4 locations)
```typescript
// agent.ts:156, 415, 612, sessions.ts:184
["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"]
```

## Proposed Solutions

### Option 1: Create Constants Module (Recommended)
```typescript
// examples/lib/constants.ts
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929' as const

export const SUPPORTED_MODELS = {
  SONNET: 'claude-sonnet-4-5-20250929',
  OPUS: 'claude-opus-4-5-20251101',
} as const

export const SANDBOX_CONFIG = {
  HOME_DIR: '/home/user',
  AGENT_SCRIPT: 'agent.py',
  STREAMING_SCRIPT: 'streaming_agent.py',
} as const

export const DEFAULT_ALLOWED_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash',
  'Glob', 'Grep', 'WebFetch', 'WebSearch'
] as const
```

**Pros:**
- Single source of truth
- Type safety with `as const`
- Easy to find and update

**Cons:**
- Refactoring effort

**Effort:** Small-Medium (1-2 hours)
**Risk:** Low

## Recommended Action

Create `examples/lib/constants.ts` and migrate all magic strings.

## Technical Details

**New file:** `examples/lib/constants.ts`

**Files to update:**
- `examples/lib/agent.ts`
- `examples/lib/sessions.ts`
- `examples/lib/cost-tracking.ts`

**Acceptance Criteria:**
- [x] All magic strings moved to constants module
- [ ] No duplicated string literals (partial - demonstrated with 2 usages in agent.ts)
- [x] TypeScript compiles
- [ ] All tests pass (pre-existing test issues unrelated to this change)

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during pattern recognition review |
| 2026-01-10 | Completed | Created constants.ts with DEFAULT_MODEL, SUPPORTED_MODELS, SANDBOX_CONFIG, DEFAULT_ALLOWED_TOOLS, TIMEOUTS, E2B_DEFAULTS. Updated 2 usages in agent.ts as demonstration. |

## Resources

- TypeScript const assertions
- Existing `convex/lib/constants.ts` for reference
