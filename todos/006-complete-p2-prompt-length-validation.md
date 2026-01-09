---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, security, validation]
dependencies: []
---

# No Prompt Length Validation in startSandboxRun

## Problem Statement

The `startSandboxRun` action accepts a `prompt: v.string()` with no length limit. Users could submit extremely long prompts (megabytes), causing memory issues and unexpected behavior.

**Why it matters**: Large prompts could exhaust memory in the action, cause E2B metadata errors, or be used for DoS.

## Findings

### Location: convex/actions/startSandboxRun.ts:29
```typescript
args: {
  threadId: v.string(),
  workspaceId: v.id("workspaces"),
  prompt: v.string(),  // No length validation
  maxDurationMs: v.optional(v.number()),
},
```

### Current Usage
- Prompt is truncated for E2B metadata (line 78): `prompt: args.prompt.substring(0, 100)`
- But the full prompt is still received and processed

## Proposed Solutions

### Option 1: Add Prompt Length Validator (Recommended)
**Effort**: Low (15 min)

```typescript
// In lib/constants.ts
export const MAX_PROMPT_LENGTH = 50000; // 50KB reasonable limit

// In startSandboxRun action
import { MAX_PROMPT_LENGTH } from "../lib/constants";

if (args.prompt.length > MAX_PROMPT_LENGTH) {
  throw new Error(`Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
}
```

## Acceptance Criteria

- [ ] Prompt length validated before processing
- [ ] Clear error message with limit details
- [ ] Limit documented in CLAUDE.md or API docs

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in security review |
