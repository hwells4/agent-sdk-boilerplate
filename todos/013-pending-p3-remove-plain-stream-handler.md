---
status: pending
priority: p3
issue_id: "013"
tags: [code-review, simplification]
dependencies: []
---

# Remove Duplicate createPlainStreamHandler Function

## Problem Statement

`createPlainStreamHandler` is nearly identical to `createConsoleStreamHandler` (~80% code overlap). Despite its name suggesting "plain" output, it still uses emojis and has the same structure. It's not used anywhere in the codebase.

## Findings

**File:** `examples/lib/streaming.ts:235-312`

**Comparison:**
| Aspect | createConsoleStreamHandler | createPlainStreamHandler |
|--------|---------------------------|-------------------------|
| Lines | 79-163 (84 lines) | 235-312 (77 lines) |
| Emojis | Yes | Yes (same) |
| Structure | Switch statement | Identical switch |
| Difference | `hasMore ? '...' : ''` | Always `'...'` |

**Usage:** Grep shows no imports or usage of `createPlainStreamHandler` anywhere.

## Proposed Solutions

### Option 1: Delete Function (Recommended)
Remove `createPlainStreamHandler` entirely since it's unused and nearly identical.

**Pros:**
- -77 lines of code
- No maintenance burden
- No behavior change

**Cons:**
- None (not used)

**Effort:** Small (5 minutes)
**Risk:** None

### Option 2: Refactor to Composition
Create single handler with `plain` option.

```typescript
export function createStreamHandler(options?: { plain?: boolean }) {
  const format = options?.plain ? (text: string) => `${text}...` : (text: string, hasMore: boolean) => `${text}${hasMore ? '...' : ''}`
  // Single implementation
}
```

**Pros:**
- DRY
- Flexibility preserved

**Cons:**
- Extra effort for unused feature

**Effort:** Medium
**Risk:** Low

## Recommended Action

Option 1 - Delete the function. It's not used, and if someone needs a plain handler in the future, they can add it then.

## Technical Details

**Affected files:**
- `examples/lib/streaming.ts`

**Lines to remove:** 235-312

**Acceptance Criteria:**
- [ ] `createPlainStreamHandler` function removed
- [ ] No broken imports (verify with grep)
- [ ] TypeScript compiles successfully

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during simplification review |

## Resources

- `examples/lib/streaming.ts` - source file
