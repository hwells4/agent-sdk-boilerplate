# Autonomous Agent

An autonomous coding loop that ships features while you're AFK.

## How It Works

```
prompt.md    → Workflow + verification gates (what to DO)
prd.json     → Stories + acceptance criteria (what to BUILD and TEST)
progress.txt → Accumulated patterns (what was LEARNED)
```

Loop: pick story → implement → verify → commit → repeat

## Quick Start

```bash
# 1. Edit prd.json with your stories
# 2. Test one iteration
./autonomous-once.sh

# 3. Run AFK
./autonomous.sh 25
```

## Writing Good Stories

**Acceptance criteria carry the test burden.** Don't explain testing in the prompt—specify tests in criteria:

```json
{
  "id": "US-001",
  "title": "Add email validation",
  "acceptanceCriteria": [
    "Function validates email format",
    "Test: rejects 'invalid'",
    "Test: accepts 'user@domain.com'",
    "npm test passes",
    "typecheck passes"
  ]
}
```

The agent MUST write those specific tests to pass.

## Verification Gates

Every iteration must pass ALL before marking done:

1. **Typecheck** - `npm run typecheck` or equivalent
2. **Tests** - `npm test` or equivalent
3. **UBS** - `ubs` must pass with no critical bugs

If any fail → agent fixes before proceeding.

## Commit Format

Commits must be detailed:

```
feat: US-001 - Add email validation

- Added validateEmail() function with regex pattern
- Created test file with 5 test cases
- Handles edge cases: empty string, missing @, missing domain
```

## Key Principles

- **One story per iteration** - Fresh context each time
- **Small stories** - Must fit in one context window
- **Explicit criteria** - Agent can't fake what's specified
- **Verification before completion** - All gates must pass
- **Learnings compound** - progress.txt accumulates patterns

## When NOT to Use

- Exploratory work
- Major refactors without clear criteria
- Security-critical code
- Tasks needing human review
