---
status: completed
priority: p1
issue_id: "005"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# `any` Types Defeating TypeScript Strict Mode

## Problem Statement

Despite having `strict: true` in tsconfig.json, multiple `any` types undermine type safety throughout the codebase, particularly for critical types like `BraintrustSpan`, `StreamEvent.data`, and `events` array.

## Findings

### 1. BraintrustSpan typed as `any`
**File:** `examples/lib/observability.ts:11`
```typescript
type BraintrustSpan = any // The Span type from braintrust
```

### 2. StreamEvent.data typed as `any`
**File:** `examples/lib/streaming.ts:13-14`
```typescript
export interface StreamEvent {
  type: 'start' | 'text' | 'thinking' | ...
  data: any  // Accessed throughout with no type checking
}
```

### 3. Events array typed as `any[]`
**File:** `examples/lib/agent.ts:581`
```typescript
const events: any[] = []
```

### 4. Session span typed as `any`
**File:** `examples/lib/sessions.ts:23`
```typescript
span?: any  // Store span reference
```

### 5. Catch blocks with `err: any`
**Files:** Multiple locations
```typescript
} catch (err: any) {
  // Unsafe access to err.message
}
```

**Impact:**
- Runtime errors not caught at compile time
- IDE cannot provide proper autocomplete
- Defeats the purpose of strict TypeScript config

## Proposed Solutions

### Option 1: Define Proper Interfaces (Recommended)

```typescript
// observability.ts - Define or import BraintrustSpan
interface BraintrustSpan {
  id: string
  span_id: string
  trace_id?: string
  log(data: Record<string, unknown>): void
  end(): void
}

// streaming.ts - Use discriminated union
type StreamEvent =
  | { type: 'start'; data: { prompt: string } }
  | { type: 'text'; data: { text: string } }
  | { type: 'thinking'; data: { thinking: string; signature?: string } }
  | { type: 'tool_use'; data: { id: string; name: string; input: unknown } }
  | { type: 'tool_result'; data: { tool_use_id: string; content: string; is_error?: boolean } }
  | { type: 'error'; data: { error: string; message: string } }
  | { type: 'result'; data: { result: string; duration_ms: number; cost: number; usage?: TokenUsage } }
  | { type: 'complete'; data: { status: string; result?: string } }

// agent.ts - Type the events array
const events: StreamEvent[] = []

// catch blocks - Use unknown
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
}
```

**Pros:**
- Full type safety restored
- IDE autocomplete works
- Compile-time error detection

**Cons:**
- Requires defining multiple interfaces
- May need runtime validators

**Effort:** Medium (2-3 hours)
**Risk:** Low

### Option 2: Import Braintrust Types Directly
```typescript
import type { Span } from 'braintrust'
```

**Pros:**
- Uses official types
- Maintained by Braintrust

**Cons:**
- May not export all needed types

**Effort:** Small
**Risk:** Low

## Recommended Action

Option 1 for `StreamEvent` (discriminated union) + Option 2 for `BraintrustSpan` if available, else define interface.

## Technical Details

**Affected files:**
- `examples/lib/observability.ts`
- `examples/lib/streaming.ts`
- `examples/lib/agent.ts`
- `examples/lib/sessions.ts`

**Acceptance Criteria:**
- [x] No `any` types in SDK files
- [x] `StreamEvent` uses discriminated union
- [x] All catch blocks use `unknown` pattern
- [x] TypeScript compilation with no type errors (in modified files)

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during TypeScript review |
| 2026-01-10 | Completed | Implemented Option 1: BraintrustSpan interface, StreamEvent discriminated union, catch blocks with unknown pattern. Note: Better typing exposed 3 pre-existing type issues in agent.ts related to optional traceId metadata values. |

## Resources

- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [TypeScript Error Handling](https://devblogs.microsoft.com/typescript/announcing-typescript-4-4/#use-unknown-catch-variables)
