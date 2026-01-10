---
status: in_progress
priority: p1
issue_id: "004"
tags: [code-review, patterns, maintainability]
dependencies: []
---

# Massive Python Code Duplication in agent.ts

## Problem Statement

The Python agent code is embedded as template strings in 4 locations with ~70 lines duplicated each time. This creates maintenance burden, inconsistency risk, and prevents proper testing of the Python code.

## Findings

**Files affected:**
- `examples/lib/agent.ts:113-208` (runPythonAgent)
- `examples/lib/agent.ts:383-456` (runPythonAgentDetailed)
- `examples/lib/agent.ts:585-676` (runPythonAgentStreaming)
- `examples/lib/sessions.ts:164-224` (executeTurn)

**Duplicated elements:**
- Import statements (identical across all 4)
- ClaudeAgentOptions configuration (identical)
- Braintrust initialization logic (nearly identical)
- Result extraction patterns (similar with variations)

**Example of duplication:**
```python
# Appears identically in 4 locations
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"],
    permission_mode="bypassPermissions",
    cwd="/home/user",
)
```

**Impact:**
- ~280 lines of duplicate Python code
- Bug fixes must be applied in 4 places
- No IDE/linting support for embedded Python
- Cannot unit test Python agent independently

## Proposed Solutions

### Option 1: Extract Python Templates Module (Recommended)
```typescript
// examples/lib/python-templates.ts
interface PythonAgentOptions {
  streaming?: boolean
  braintrustEnabled?: boolean
  includePartialMessages?: boolean
}

export function generatePythonAgentCode(
  prompt: string,
  options: PythonAgentOptions
): string {
  const imports = `
import asyncio
import json
import sys
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, ResultMessage
${options.streaming ? 'from claude_agent_sdk import TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock' : ''}
${options.braintrustEnabled ? 'import braintrust' : ''}
`
  // Single source of truth for Python generation
}
```

**Pros:**
- Single source of truth
- Composable options for different modes
- Can add Python linting in separate .py files

**Cons:**
- Requires refactoring 4 functions

**Effort:** Medium (4-6 hours)
**Risk:** Medium (affects core functionality)

### Option 2: Deploy Python Scripts to E2B Template
Put Python agent code in the E2B template, write prompts to file.

**Pros:**
- Python code gets proper IDE support
- Can test Python independently

**Cons:**
- Requires template rebuild
- Less flexibility at runtime

**Effort:** Large
**Risk:** High

## Recommended Action

Option 1 - Extract Python template generator. Immediately reduces duplication and enables proper testing.

## Technical Details

**Affected files:**
- `examples/lib/agent.ts` (3 functions)
- `examples/lib/sessions.ts` (1 function)
- New: `examples/lib/python-templates.ts`

**Acceptance Criteria:**
- [x] Single `generatePythonAgentCode()` function generates all variants
- [ ] All 4 calling sites use the generator (1/4 done - runPythonAgent migrated)
- [ ] Python code behavior unchanged
- [ ] Tests pass

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during pattern recognition review |
| 2026-01-10 | Started | Created `examples/lib/python-templates.ts` with generator function. Migrated `runPythonAgent` as proof of concept. |

## Resources

- `examples/lib/agent.ts` - Current implementations to consolidate
- `examples/lib/python-templates.ts` - New centralized template generator
