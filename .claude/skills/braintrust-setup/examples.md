# Braintrust Setup Skill - Usage Examples

> Real-world examples of how this skill helps users set up and use Braintrust observability.

---

## Example 1: Complete First-Time Setup

**User:** "I want to set up Braintrust to monitor my agents"

**Skill Response:**

I'll guide you through setting up Braintrust observability in your Claude Agent SDK project. This will give you automatic tracing, cost tracking, and the ability to query execution data from Claude Code.

**Step 1: Get your Braintrust API Key**

1. Visit https://www.braintrust.dev/
2. Sign up or log in
3. Go to Settings → API Keys
4. Create a new API key
5. Copy the key (it starts with `bt_...`)

**Step 2: Add to Environment Variables**

```bash
# Open your .env file and add:
BRAINTRUST_API_KEY=bt_...  # Paste your key here
```

**Step 3: Test the Integration**

```bash
npm run example
```

**Expected output:**
```
✅ Braintrust observability enabled
Starting sandbox (template: your-template-id)...
Sandbox started. Running Python agent...
Agent completed successfully
💰 Cost Breakdown:
   Claude API: $0.0009
   E2B Sandbox: $0.0001
   Total: $0.0010
✅ Braintrust traces flushed successfully
```

**Step 4: View Your Traces**

Visit https://braintrust.dev/app and navigate to the `claude-agent-sdk` project (created automatically).

**Step 5: Set Up MCP Server (Optional but Recommended)**

This lets you query Braintrust from Claude Code using natural language:

```bash
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp
```

The first query will trigger OAuth authentication (opens browser automatically).

**Try it:**
```
Show me all agent executions from today
What's the average cost per execution?
```

That's it! Your agents are now automatically traced. Would you like me to help you set up project naming for different environments (dev/staging/prod)?

---

## Example 2: Using MCP to Debug Failed Executions

**User:** "I'm seeing errors in my agents. Can you help me debug?"

**Skill Response:**

I'll use the Braintrust MCP server to find and analyze failed executions.

**Query 1: Recent failures**

Let me query Braintrust for failed executions in the last 24 hours:

```
Show me all failed agent executions from the last 24 hours
```

**Results:**
```
Found 8 failed executions:

1. sess_abc123 (2 hours ago) - timeout error
2. sess_def456 (3 hours ago) - API rate limit
3. sess_ghi789 (5 hours ago) - sandbox creation failed
...
```

**Query 2: Get detailed trace**

Let me get the full trace for the most recent failure:

```
Get the trace for session sess_abc123
```

**Analysis:**

The error shows:
- **Error type:** timeout (exit code 124)
- **Duration:** 122.3 seconds (exceeded 120s timeout)
- **Tool executions:** 47 bash commands
- **Root cause:** Agent got stuck in a retry loop running `npm install`

**Recommendations:**

1. **Increase timeout** for npm-heavy tasks:
   ```typescript
   await runPythonAgent({
     prompt: 'Your task',
     timeout: 300  // 5 minutes
   })
   ```

2. **Check for retry loops** in agent logic

3. **Pre-install dependencies** in E2B template to avoid runtime installs

Would you like me to help you modify the E2B template to pre-install dependencies?

---

## Example 3: Cost Analysis and Optimization

**User:** "My Braintrust costs are getting high. How can I reduce them?"

**Skill Response:**

I'll analyze your agent costs and suggest optimizations.

**Step 1: Query current costs**

```
What's the total cost for agent executions this month?
```

**Results:**
```
Total cost this month: $245.67
- Claude API: $198.45 (81%)
- E2B Sandbox: $47.22 (19%)
- Executions: 10,847
- Average: $0.023 per execution
```

**Step 2: Identify expensive executions**

```
Show me the top 10 most expensive executions
```

**Results:**
```
1. sess_xyz123: $4.85 (retry loop - 18 attempts)
2. sess_abc456: $2.34 (extended thinking + large codebase)
3. sess_def789: $1.92 (multi-turn conversation, 45 turns)
...
```

**Step 3: Analyze patterns**

The data shows:
- **Retry loops** are your biggest cost driver (30% of total)
- **Extended thinking** adds ~40% per execution
- **Multi-turn conversations** can accumulate high costs

**Optimization Recommendations:**

**1. Enable Trace Sampling (Production)**

Reduce Braintrust observability costs by 90%:

```bash
# .env.production
BRAINTRUST_SAMPLE_RATE=0.1  # Sample 10% of traces
```

**Impact:** Braintrust costs drop from ~$50/month to ~$5/month
**Note:** Errors are always traced regardless of sample rate

**2. Add Retry Logic Limits**

Prevent runaway retry loops:

```typescript
await runPythonAgent({
  prompt: 'Your task',
  maxRetries: 3,  // Limit retries
  timeout: 120    // Fail fast
})
```

**Impact:** Eliminates $73/month from retry loops

**3. Optimize Extended Thinking Usage**

Only use extended thinking for complex tasks:

```typescript
// High-complexity task
await runPythonAgent({
  prompt: 'Design a complex system',
  extendedThinking: true  // Worth the extra cost
})

// Simple task
await runPythonAgent({
  prompt: 'List files',
  extendedThinking: false  // Save ~40%
})
```

**Impact:** Save ~$30/month on simple operations

**4. Session Management (Future)**

For multi-turn conversations, reuse sandboxes:

```typescript
// Instead of creating new sandbox per turn:
const session = await createSession()
await executeTurn(session.sessionId, 'Turn 1')
await executeTurn(session.sessionId, 'Turn 2')  // Reuses sandbox
await endSession(session.sessionId)
```

**Impact:** Reduce E2B costs by ~60% for conversations

**Projected Savings:**

```
Current: $245.67/month
After optimizations:
- Sampling (10%): -$45.00
- Retry limits: -$73.00
- Extended thinking optimization: -$30.00
Projected: $97.67/month (60% reduction)
```

Would you like me to help you implement any of these optimizations?

---

## Example 4: Multi-Environment Setup

**User:** "How should I organize Braintrust for dev/staging/prod?"

**Skill Response:**

I'll help you set up environment-based Braintrust projects for better organization and cost control.

**Recommended Structure:**

```
Development: claude-agent-dev (trace everything)
Staging: claude-agent-staging (sample 50%)
Production: claude-agent-prod (sample 10%)
```

**Step 1: Create environment-specific .env files**

```bash
# .env.local (development)
BRAINTRUST_PROJECT_NAME=claude-agent-dev
BRAINTRUST_SAMPLE_RATE=1.0

# .env.staging
BRAINTRUST_PROJECT_NAME=claude-agent-staging
BRAINTRUST_SAMPLE_RATE=0.5

# .env.production
BRAINTRUST_PROJECT_NAME=claude-agent-prod
BRAINTRUST_SAMPLE_RATE=0.1
```

**Step 2: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "dotenv -e .env.local npm run example",
    "staging": "dotenv -e .env.staging npm run example",
    "prod": "dotenv -e .env.production npm start"
  }
}
```

**Step 3: Install dotenv-cli**

```bash
npm install -D dotenv-cli
```

**Step 4: Document for team**

Create `docs/BRAINTRUST_ENV_SETUP.md`:

```markdown
# Braintrust Environment Configuration

All team members MUST use these project names:

| Environment | Project Name | Sample Rate |
|-------------|--------------|-------------|
| Development | `claude-agent-dev` | 100% |
| Staging | `claude-agent-staging` | 50% |
| Production | `claude-agent-prod` | 10% |

## Setup
```bash
# Development
cp .env.local .env
npm run dev

# Staging
cp .env.staging .env
npm run staging

# Production
cp .env.production .env
npm run prod
```

## Viewing Data

- Dev: https://braintrust.dev/app/claude-agent-dev
- Staging: https://braintrust.dev/app/claude-agent-staging
- Prod: https://braintrust.dev/app/claude-agent-prod
```
```

**Step 5: Verify configuration**

Create a validation script:

```typescript
// scripts/verify-braintrust-config.ts
import dotenv from 'dotenv'

dotenv.config()

const projectName = process.env.BRAINTRUST_PROJECT_NAME
const sampleRate = parseFloat(process.env.BRAINTRUST_SAMPLE_RATE || '1.0')

console.log('Braintrust Configuration:')
console.log(`  Project: ${projectName}`)
console.log(`  Sample Rate: ${sampleRate * 100}%`)

if (process.env.NODE_ENV === 'production' && sampleRate > 0.2) {
  console.warn('⚠️  WARNING: Production sample rate is high (>20%)')
  console.warn('   Consider reducing to 0.1 (10%) for cost optimization')
}
```

**Benefits of this setup:**

✅ **Cost optimization** - Production uses 10x less observability
✅ **Clear separation** - Easy to find dev vs prod traces
✅ **Team coordination** - Everyone uses same naming
✅ **Safety** - Can't accidentally pollute production with dev data

Would you like me to set up these files for you?

---

## Example 5: Troubleshooting Multiple Projects

**User:** "I have multiple projects in my Braintrust dashboard. How do I clean this up?"

**Skill Response:**

Let me help you consolidate your Braintrust projects.

**Step 1: List current projects**

Based on your question, you likely see something like:

```
Projects in dashboard:
- claude-agent-sdk (default)
- my-agent-project
- test-project
- agent-dev
- my-test
```

**Step 2: Identify why this happened**

Let me check your current configuration:

```bash
cat .env | grep BRAINTRUST_PROJECT_NAME
```

**Results:**
```
BRAINTRUST_PROJECT_NAME=claude-agent-sdk
```

**Diagnosis:**

The extra projects were likely created from:
1. **Typos** - e.g., `my-agent-projct` vs `my-agent-project`
2. **Old tests** - Before standardizing naming
3. **Team members** - Using different names locally

**Step 3: Choose your naming strategy**

**Option A: Keep it simple (single project)**
```bash
BRAINTRUST_PROJECT_NAME=my-company-agents
```

**Option B: Environment-based (recommended)**
```bash
BRAINTRUST_PROJECT_NAME=my-company-agents-dev
BRAINTRUST_PROJECT_NAME=my-company-agents-staging
BRAINTRUST_PROJECT_NAME=my-company-agents-prod
```

**Step 4: Update all .env files**

```bash
# Check all env files
ls -la | grep .env

# Update each one
# .env.local, .env.staging, .env.production
```

**Step 5: Archive unused projects**

For each project you don't need:

1. Go to https://braintrust.dev/app
2. Select the project (e.g., `test-project`)
3. Click **Settings** (gear icon)
4. Scroll to **Archive Project**
5. Click **Archive**

**Note:** Archived projects are hidden but data is retained. You can unarchive later if needed.

**Step 6: Verify with team**

Create a shared document:

```markdown
# Braintrust Project Naming Convention

**Official project names:**
- `my-company-agents-dev` - Development
- `my-company-agents-staging` - Staging
- `my-company-agents-prod` - Production

**Before making changes:**
1. Update your `.env` file
2. Test with `npm run example`
3. Verify traces go to correct project
4. Notify team in Slack

**Questions?** Ask in #engineering
```

**Step 7: Add CI/CD validation**

Prevent future inconsistencies:

```yaml
# .github/workflows/validate-config.yml
name: Validate Braintrust Config

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check project names
        run: |
          # Ensure production doesn't use default
          if grep -q "BRAINTRUST_PROJECT_NAME=claude-agent-sdk" .env.production; then
            echo "❌ Production should not use default project name!"
            exit 1
          fi

          # Ensure consistent naming pattern
          if ! grep -qE "BRAINTRUST_PROJECT_NAME=my-company-agents-(dev|staging|prod)" .env.*; then
            echo "⚠️  Project names should follow: my-company-agents-{environment}"
          fi
```

**Summary:**

✅ Standardize on `my-company-agents-{environment}`
✅ Archive unused projects: `test-project`, `my-test`
✅ Update all `.env` files
✅ Add CI/CD validation
✅ Document for team

Would you like me to help you set up the validation script?

---

## Example 6: Understanding What Gets Logged

**User:** "What exactly does Braintrust log from my agents?"

**Skill Response:**

Great question! Let me show you exactly what Braintrust captures automatically.

**Automatic Logging (No Code Required)**

Once you set `BRAINTRUST_API_KEY`, every agent execution logs:

**1. Input/Output**
```json
{
  "input": {
    "prompt": "Create a file called test.txt with 'Hello, World!'"
  },
  "output": "I've created the file test.txt with the content 'Hello, World!'"
}
```

**2. Token Usage**
```json
{
  "metrics": {
    "prompt_tokens": 245,
    "completion_tokens": 12,
    "cached_tokens": 50,
    "total_tokens": 257
  }
}
```

**3. Cost Breakdown**
```json
{
  "metrics": {
    "claude_cost": 0.0009,
    "e2b_cost": 0.0001,
    "total_cost": 0.0010
  },
  "metadata": {
    "cost_breakdown": {
      "claude": {
        "prompt_tokens": 245,
        "prompt_cost": 0.0007,
        "completion_tokens": 12,
        "completion_cost": 0.0002,
        "total": 0.0009
      },
      "e2b": {
        "duration_seconds": 3.2,
        "cpus": 2,
        "cost": 0.0001
      }
    }
  }
}
```

**4. Tool Executions**
```json
{
  "metadata": {
    "tools_used": [
      { "name": "Write", "file": "/home/user/test.txt" },
      { "name": "Bash", "command": "ls -la" }
    ]
  }
}
```

**5. Errors (When They Occur)**
```json
{
  "error": "Sandbox creation failed",
  "metadata": {
    "error_type": "sandbox_error",
    "error_category": "infrastructure",
    "exit_code": 1,
    "stderr": "Failed to create sandbox: resource limit exceeded"
  }
}
```

**6. Execution Metadata**
```json
{
  "metadata": {
    "duration_ms": 3245,
    "exit_code": 0,
    "template_id": "your-template-id",
    "sandbox_id": "sandbox-abc123",
    "environment": "development"
  }
}
```

**What Does NOT Get Logged**

❌ **Sensitive data** (unless in your prompts/results)
❌ **API keys** (SDK strips these)
❌ **File contents** (only file paths)
❌ **Environment variables** (except BRAINTRUST_*)

**Example Real Trace**

Here's what a complete trace looks like in Braintrust:

```
📊 Trace: run_agent_basic
├─ Input: "List all Python files in the project"
├─ Duration: 2.3 seconds
├─ Status: ✅ Success
├─ Cost: $0.0008
├─ Tokens:
│  ├─ Prompt: 156
│  ├─ Completion: 23
│  └─ Cached: 45
├─ Tools Used:
│  ├─ Bash: "find . -name '*.py'"
│  └─ Read: "/home/user/setup.py"
└─ Output: "Found 12 Python files: setup.py, agent.py, ..."
```

**Viewing Traces**

**Option 1: Web UI**
- Visit https://braintrust.dev/app
- Navigate to your project
- Click any trace to see full details

**Option 2: MCP Server (from Claude Code)**
```
Show me the last 10 agent executions
Get the trace for session sess_abc123
```

**Privacy Considerations**

Since Braintrust logs prompts and results:

1. **Don't put secrets in prompts**
   ```typescript
   // ❌ Bad
   await runPythonAgent({
     prompt: `Use API key: ${apiKey}`
   })

   // ✅ Good
   await runPythonAgent({
     prompt: 'Use the API key from environment variable API_KEY'
   })
   ```

2. **Redact sensitive data** in results if needed
   ```typescript
   // Custom redaction (if needed)
   const result = await runPythonAgent({ prompt })
   const redacted = result.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
   ```

3. **Use environment-based projects** to separate production data

Would you like to see a live trace from your project?

---

## Example 7: MCP Query Reference

**User:** "What can I query with the Braintrust MCP server?"

**Skill Response:**

The Braintrust MCP server gives you 7 powerful tools for querying your agent data. Here's a complete reference:

**Tool 1: search_docs**
```
"How do I create a custom scorer?"
"What is BTQL syntax?"
"How do I export dataset events?"
```

**Tool 2: resolve_object**
```
"Get the ID for the 'gpt-4-baseline' experiment"
"Find the dataset named 'production-samples'"
```

**Tool 3: list_recent_objects**
```
"Show me my 10 most recent experiments"
"List recent datasets created this week"
```

**Tool 4: infer_schema**
```
"What fields are available in my experiment traces?"
"Show me the schema for the claude-agent-sdk project"
```

**Tool 5: btql_query**
```
"Run a BTQL query to find traces with cost > $1"
"Query for failed executions in the last 7 days"
```

**Tool 6: summarize_experiment**
```
"Summarize the 'sonnet-vs-haiku' experiment"
"Get experiment statistics for exp_abc123"
```

**Tool 7: generate_permalink**
```
"Generate a link to my latest A/B test results"
"Create a shareable URL for the last experiment"
```

**Common Query Patterns**

**Debugging:**
```
Show me all failed agent executions from the last 24 hours
Get the trace for session sess_abc123
What's the error for the most recent failed execution?
```

**Cost Analysis:**
```
What's the average cost per agent execution this week?
Show me the top 5 most expensive executions this month
Compare costs between last week and this week
```

**Performance Monitoring:**
```
What's the average execution time for agents?
Show me the slowest 10 executions
How many executions had timeouts this week?
```

**Token Usage:**
```
What's the average token usage per execution?
Show me executions with > 10,000 tokens
Compare token usage between Sonnet and Opus
```

**Tool Usage:**
```
Which tools are used most frequently?
Show me executions that used the Bash tool
How many file operations (Read/Write/Edit) this week?
```

**BTQL Advanced Queries**

For complex analytics, you can write custom BTQL:

```
Run this BTQL query:

select:
  id,
  created,
  metrics.total_cost as cost,
  metadata.tools_used as tools
from: project_logs('claude-agent-sdk') traces
filter:
  metrics.total_cost > 0.5 AND
  created > now() - interval 7 day
sort: cost desc
limit: 10
```

**Natural Language Alternative**

You don't need to write BTQL! Just ask naturally:

```
"Find expensive executions over $0.50 from the last week"
```

MCP translates this to BTQL automatically.

**Pro Tips**

1. **Time filters** - Always include time range for faster queries
   ```
   "...from the last 24 hours"
   "...this week"
   "...since January 1st"
   ```

2. **Specific sessions** - Use session IDs for exact lookups
   ```
   "Get trace for sess_abc123"
   ```

3. **Comparisons** - MCP can compare across time periods
   ```
   "Compare costs between last week and this week"
   ```

4. **Aggregations** - Get summaries instead of individual traces
   ```
   "Average cost per execution" (not "show all executions")
   ```

Would you like me to run any of these queries for you right now?

---

## Summary

These examples demonstrate the skill's capabilities:

1. ✅ **Setup** - Complete first-time configuration
2. ✅ **Debugging** - Using MCP to find and analyze failures
3. ✅ **Cost Optimization** - Identifying expensive patterns and reducing costs
4. ✅ **Multi-Environment** - Organizing dev/staging/prod
5. ✅ **Troubleshooting** - Fixing multiple projects, missing traces
6. ✅ **Understanding** - What gets logged and how to view it
7. ✅ **MCP Reference** - Complete tool and query guide

The skill acts as a comprehensive guide, diagnostician, and implementation assistant for all Braintrust-related tasks.
