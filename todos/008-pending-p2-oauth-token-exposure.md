---
status: resolved
priority: p2
issue_id: "008"
tags: [code-review, security]
dependencies: []
resolved_date: 2026-01-10
resolution: "Documented the risk in code comments and CLAUDE.md (Option 4)"
---

# OAuth Token Passed to Sandboxes - Credential Exposure Risk

## Problem Statement

The OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) is passed as an environment variable to every E2B sandbox. If sandbox isolation fails or malicious code runs in the sandbox, the token could be exfiltrated.

## Findings

**Files affected:**
- `examples/lib/agent.ts:215-226`
- `examples/lib/agent.ts:461-472`
- `examples/lib/agent.ts:759-770`
- `examples/lib/sessions.ts:236`

```typescript
const envs: Record<string, string> = {
  CLAUDE_CODE_OAUTH_TOKEN: oauthToken,  // Production credential exposed
}
```

**Risks:**
1. Every sandbox has access to production Claude credentials
2. Malicious code could exfiltrate the token via network calls
3. If E2B isolation fails, token is exposed
4. Token could be logged if sandbox has verbose logging

## Proposed Solutions

### Option 1: Proxy Architecture (Recommended for Production)
Sandboxes call back to TypeScript server, which holds the token.

```typescript
// TypeScript server holds token
app.post('/api/proxy/claude', async (req, res) => {
  const response = await claudeApi.call({
    ...req.body,
    apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN
  })
  res.json(response)
})

// Sandbox calls proxy instead of Claude directly
const sandboxCode = `
import httpx
response = httpx.post('${proxyUrl}/api/proxy/claude', json={...})
`
```

**Pros:**
- Token never enters sandbox
- Can add additional validation on proxy
- Can implement per-sandbox rate limiting

**Cons:**
- Added latency
- More infrastructure complexity
- Requires network access from sandbox to proxy

**Effort:** Large
**Risk:** Medium (architectural change)

### Option 2: Short-Lived Scoped Tokens
If Claude API supports it, generate short-lived tokens per sandbox.

**Pros:**
- Limited blast radius
- Time-limited exposure

**Cons:**
- May not be supported by Claude API
- Token generation overhead

**Effort:** Medium
**Risk:** Low (if supported)

### Option 3: Egress Filtering
Configure E2B sandbox network to only allow Claude API endpoints.

**Pros:**
- Prevents exfiltration to arbitrary URLs
- No code changes needed

**Cons:**
- May break legitimate sandbox functionality
- Doesn't prevent logging/storage of token

**Effort:** Medium
**Risk:** Medium

### Option 4: Accept Risk with Documentation (Current State)
Document the risk and accept for development/demo use only.

**Pros:**
- No implementation effort

**Cons:**
- Risk remains
- Not suitable for production

**Effort:** Small
**Risk:** N/A (doesn't fix)

## Recommended Action

For demo/development: Option 4 with clear documentation
For production: Option 1 (proxy architecture)

## Technical Details

**Affected files:**
- `examples/lib/agent.ts`
- `examples/lib/sessions.ts`
- E2B network configuration

**Acceptance Criteria:**
- [ ] Production tokens never passed to sandboxes
- [ ] Sandboxes can still make Claude API calls via proxy
- [ ] Token exfiltration not possible from sandbox

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during security review |

## Resources

- E2B network configuration documentation
- Claude API token scoping (if available)
