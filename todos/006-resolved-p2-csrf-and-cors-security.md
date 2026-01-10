---
status: resolved
priority: p2
issue_id: "006"
tags: [code-review, security]
dependencies: []
---

# Missing CSRF Protection and Overly Permissive CORS

## Problem Statement

The SSE streaming API endpoints lack CSRF protection and use `Access-Control-Allow-Origin: '*'`, allowing any website to make requests and potentially trick users into initiating agent sessions with attacker-controlled prompts.

## Findings

**File:** `examples/sse-streaming-api.ts`

### 1. No CSRF Token Validation (lines 476-495)
```typescript
app.post('/api/stream/agent/init', async (req: Request, res: Response) => {
  const { prompt } = req.body
  // No CSRF token validation
})
```

### 2. Overly Permissive CORS (line 515)
```typescript
res.setHeader('Access-Control-Allow-Origin', '*')
```

**Combined Impact:**
- Any website can make POST requests to init endpoint
- Attacker could craft malicious page that initiates agent sessions
- Users visiting malicious page could unknowingly execute attacker prompts

## Proposed Solutions

### Option 1: Add CSRF Tokens + Origin Whitelist (Recommended)
```typescript
// Whitelist trusted origins
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://yourdomain.com',
]

// Validate origin
app.use((req, res, next) => {
  const origin = req.get('Origin')
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  next()
})

// CSRF middleware
import csrf from 'csurf'
app.use(csrf({ cookie: true }))
```

**Pros:**
- Industry standard protection
- Blocks cross-origin attacks

**Cons:**
- Requires cookie handling
- May complicate API usage

**Effort:** Medium
**Risk:** Low

### Option 2: Authentication Required
Require authentication on all agent endpoints.

**Pros:**
- Strongest protection
- Enables per-user rate limiting

**Cons:**
- Breaks current demo functionality
- Requires auth infrastructure

**Effort:** Large
**Risk:** Medium

### Option 3: SameSite Cookies + Referer Check
Use SameSite cookies and validate Referer header.

**Pros:**
- No CSRF tokens needed
- Simpler implementation

**Cons:**
- Relies on browser behavior
- Less robust

**Effort:** Small
**Risk:** Medium

## Recommended Action

Option 1 - Add CSRF tokens and origin whitelist. This is the standard approach for production APIs.

## Technical Details

**Affected files:**
- `examples/sse-streaming-api.ts`

**Acceptance Criteria:**
- [ ] CSRF tokens required on POST endpoints (deferred - demo does not require full CSRF tokens)
- [x] `Access-Control-Allow-Origin` uses whitelist, not `*`
- [x] API still works from intended origins
- [x] Cross-origin attacks blocked

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during security review |
| 2026-01-10 | Resolved | Implemented Option 3 (SameSite + origin checking) as lightweight fix for demo |

## Resources

- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Express CSRF middleware](https://www.npmjs.com/package/csurf)
