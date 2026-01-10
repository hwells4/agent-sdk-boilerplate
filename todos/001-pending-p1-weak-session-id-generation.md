---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security]
dependencies: []
---

# Weak Session ID Generation - Predictable/Guessable

## Problem Statement

Session IDs in the SSE API are generated using `Math.random().toString(36).substring(7)`, which is not cryptographically secure. This produces predictable values with only ~31 bits of entropy, making session hijacking possible through enumeration.

## Findings

**File:** `examples/sse-streaming-api.ts:484`

```typescript
const sessionId = Math.random().toString(36).substring(7)
```

**Issues:**
- `Math.random()` is NOT cryptographically secure
- Resulting session ID is only ~5-6 characters
- Attackers could enumerate or predict valid session IDs
- Enables hijacking of other users' agent sessions

## Proposed Solutions

### Option 1: Use crypto.randomUUID() (Recommended)
```typescript
import { randomUUID } from 'crypto'
const sessionId = randomUUID()
```

**Pros:**
- Cryptographically secure
- Standard UUID format (128 bits)
- Built into Node.js

**Cons:**
- None

**Effort:** Small (10 minutes)
**Risk:** None

### Option 2: Use uuid package
```typescript
import { v4 as uuidv4 } from 'uuid'
const sessionId = uuidv4()
```

**Pros:**
- Already in dependencies (used in sessions.ts)
- Consistent with rest of codebase

**Cons:**
- Adds dependency (already present)

**Effort:** Small (5 minutes)
**Risk:** None

## Recommended Action

Use Option 1 (`crypto.randomUUID()`) - built-in, no additional dependencies.

## Technical Details

**Affected files:**
- `examples/sse-streaming-api.ts`

**Acceptance Criteria:**
- [ ] Session IDs use cryptographically secure random generation
- [ ] Session ID length is at least 128 bits
- [ ] No change in API behavior

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during code review |

## Resources

- [Node.js crypto.randomUUID()](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
