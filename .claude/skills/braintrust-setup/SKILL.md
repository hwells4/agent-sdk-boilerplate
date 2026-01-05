# Braintrust Observability Setup and Usage

> Expert guidance for setting up and using Braintrust observability in the Claude Agent SDK project, including MCP server integration, SDK usage patterns, and troubleshooting.

**Version:** 1.0
**Status:** Production-Ready
**Auto-invoke:** When users ask about Braintrust setup, observability, monitoring, cost tracking, or how to use Braintrust MCP tools.

---

## Skill Purpose

This skill helps users:

1. **Set up Braintrust observability** - API key configuration, project setup, environment variables
2. **Use the Braintrust MCP Server** - Query traces, analyze costs, debug issues from Claude Code
3. **Understand SDK integration** - How automatic tracing works, what gets logged, cost tracking
4. **Troubleshoot issues** - Multiple projects, missing traces, configuration problems
5. **Optimize for production** - Sampling strategies, cost management, best practices

---

## When to Use This Skill

**Auto-invoke when the user asks:**

- "How do I set up Braintrust?"
- "What Braintrust MCP tools are available?"
- "Show me failed agent executions"
- "How much are my agents costing?"
- "Why aren't my traces showing up?"
- "How do I query Braintrust from Claude Code?"
- "What's the difference between Braintrust SDK and MCP?"
- "How do I reduce observability costs?"

**Keywords that trigger this skill:**
- `braintrust`, `observability`, `monitoring`, `tracing`
- `cost tracking`, `token usage`, `MCP`
- `BTQL`, `traces`, `experiments`

---

## Knowledge Base

### 1. Quick Setup (3 Steps)

The simplest path to get Braintrust working:

```bash
# Step 1: Get API key
# → Visit: https://www.braintrust.dev/app/settings/api-keys
# → Create new API key
# → Copy the key (starts with bt_...)

# Step 2: Add to .env
echo "BRAINTRUST_API_KEY=bt_..." >> .env

# Step 3: Run an agent
npm run example
# ✅ Traces automatically flow to Braintrust!
```

**That's it!** The SDK is already integrated - just add the API key.

---

### 2. Braintrust Architecture in This Project

```
┌─────────────────────────────────────────┐
│   TypeScript Application                │
│   - runPythonAgent()                    │
│   - runPythonAgentStreaming()           │
│   - Auto-tracing built-in               │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Braintrust SDK (examples/lib/)        │
│   - observability.ts ← Initialized      │
│   - agent.ts ← Tracing injected         │
│   - Automatic token/cost tracking       │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│   Braintrust Cloud                      │
│   - Stores traces, metrics, costs       │
│   - Web UI: braintrust.dev/app          │
│   - MCP Server: Query from Claude Code  │
└─────────────────────────────────────────┘
```

**Key Point:** Users don't need to write any tracing code - it's already built into the SDK.

---

### 3. What Gets Automatically Tracked

Once you set `BRAINTRUST_API_KEY`, **every agent execution** automatically logs:

✅ **Input/Output** - Prompt and result
✅ **Token Usage** - Prompt tokens, completion tokens, cached tokens
✅ **Cost Breakdown** - Claude API costs + E2B sandbox costs
✅ **Tool Executions** - Bash, Read, Write, Edit, Glob, Grep
✅ **Errors** - Categorized by type with full debugging context
✅ **Extended Thinking** - When agents use extended thinking mode
✅ **Multi-turn Conversations** - Session-level traces (when using sessions API)

**No code changes needed!**

---

### 4. Braintrust MCP Server

The **Braintrust MCP Server** lets you query Braintrust data from Claude Code using natural language.

#### Setup MCP Server

```bash
# One-time setup
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp

# First query triggers OAuth flow (browser-based, one-time)
```

#### Available MCP Tools

| Tool | Description | Example Query |
|------|-------------|---------------|
| `search_docs` | Search Braintrust documentation | "How do I create a custom scorer?" |
| `resolve_object` | Get object ID by name | "Get the ID for the 'sentiment-analysis' experiment" |
| `list_recent_objects` | List recent experiments/datasets | "Show me my 10 most recent experiments" |
| `infer_schema` | Discover available fields in traces | "What fields are available in my traces?" |
| `btql_query` | Run BTQL query | "Find traces with Factuality score > 0.8" |
| `summarize_experiment` | Get experiment summary | "Summarize the 'gpt-4-baseline' experiment" |
| `generate_permalink` | Create shareable link | "Generate a link to my latest A/B test" |

#### Common MCP Queries

**Debug failed executions:**
```
Show me all failed agent executions from the last 24 hours
```

**Cost analysis:**
```
What's the average cost per agent execution this week?
Show me the top 5 most expensive executions
```

**Session debugging:**
```
Get the trace for session sess_abc123
```

**Performance comparison:**
```
Compare token usage between agent version 1.0 and 2.0
```

---

### 5. SDK vs MCP - When to Use Each

| Feature | SDK (`examples/lib/observability.ts`) | MCP Server |
|---------|--------------------------------------|------------|
| **Purpose** | Automatic logging during execution | Interactive querying after execution |
| **Setup** | Add `BRAINTRUST_API_KEY` to `.env` | `claude mcp add braintrust ...` |
| **Usage** | No code - just run agents | Natural language queries in Claude Code |
| **Data Flow** | TypeScript → Braintrust Cloud | Claude Code → Braintrust Cloud |
| **Use Cases** | Production monitoring, cost tracking | Debugging, analysis, cost optimization |

**Bottom line:** Use both! SDK logs data automatically, MCP queries it interactively.

---

### 6. Environment Variables Reference

```bash
# Required
BRAINTRUST_API_KEY=bt_...  # Get from: https://www.braintrust.dev/app/settings/api-keys

# Optional (with defaults)
BRAINTRUST_PROJECT_NAME=claude-agent-sdk  # Project name in dashboard
BRAINTRUST_SAMPLE_RATE=1.0  # Trace 100% of executions (0.0-1.0)
```

**Project Naming Strategies:**

```bash
# Strategy A: Single project (simple)
BRAINTRUST_PROJECT_NAME=claude-agent-sdk

# Strategy B: Environment-based (recommended for teams)
BRAINTRUST_PROJECT_NAME=my-agent-dev      # .env.local
BRAINTRUST_PROJECT_NAME=my-agent-staging  # .env.staging
BRAINTRUST_PROJECT_NAME=my-agent-prod     # .env.production

# Strategy C: Feature-based (multiple agent types)
BRAINTRUST_PROJECT_NAME=customer-support-agent
BRAINTRUST_PROJECT_NAME=code-review-agent
BRAINTRUST_PROJECT_NAME=data-analysis-agent
```

---

### 7. Cost Tracking Breakdown

The SDK tracks costs from **two sources**:

#### Claude API Costs

Based on token usage with current pricing:

| Model | Prompt Tokens | Completion Tokens | Cached Tokens |
|-------|---------------|-------------------|---------------|
| Sonnet 4.5 | $3/1M | $15/1M | $0.30/1M |
| Opus 4.5 | $15/1M | $75/1M | $1.50/1M |

#### E2B Sandbox Costs

- **Price:** $0.000014 per vCPU per second (~$0.05/hour for 2 vCPU)
- **Calculated from:** Execution duration × CPU count (from `e2b.toml`)

**Example cost breakdown:**
```
💰 Cost Breakdown:
   Claude API:
   • Prompt tokens: 245 ($0.0007)
   • Completion tokens: 12 ($0.0002)
   • Claude total: $0.0009
   E2B Sandbox:
   • Duration: 3.2s
   • CPUs: 2
   • Sandbox total: $0.0001
   ━━━━━━━━━━━━━━━━━━━━━━━
   Total: $0.0010
```

---

### 8. Trace Sampling (Production Cost Optimization)

Control observability costs by sampling traces:

```bash
# Development: Trace everything
BRAINTRUST_SAMPLE_RATE=1.0

# Staging: Sample 50%
BRAINTRUST_SAMPLE_RATE=0.5

# Production: Sample 10% (recommended for high volume)
BRAINTRUST_SAMPLE_RATE=0.1
```

**Key Features:**
- Errors are **always traced**, even when sampled out
- Per-call override available:
  ```typescript
  await runPythonAgent({
    prompt: 'Critical task',
    observability: { sample: 1.0 }  // Force trace this one
  })
  ```

---

### 9. BTQL Query Language Basics

**BTQL** (Braintrust Query Language) is used for advanced queries via MCP.

#### Basic Structure
```btql
select: <fields>
from: project_logs('<project_name>') traces
filter: <conditions>
sort: <field> desc
limit: <number>
```

#### Example: Failed Executions
```btql
select: id, error, created, metrics.cost
from: project_logs('claude-agent-sdk') traces
filter: error IS NOT NULL AND created > now() - interval 1 day
sort: created desc
limit: 50
```

#### Example: Cost Analysis
```btql
dimensions: day(created) as date
measures:
  count(1) as executions,
  avg(metrics.cost) as avg_cost,
  sum(metrics.cost) as total_cost
from: project_logs('claude-agent-sdk') traces
filter: created > now() - interval 7 day
sort: date desc
```

**Tip:** You don't need to write BTQL directly - use natural language with the MCP server and it translates for you!

---

### 10. Viewing Data in Braintrust Web UI

1. Go to [braintrust.dev/app](https://braintrust.dev/app)
2. Navigate to your project (default: `claude-agent-sdk`)
3. View:
   - **Traces** - List of all agent executions with filters
   - **Individual Trace** - Full details including input/output, token usage, cost breakdown, tool timeline
   - **Experiments** - Evaluation results and comparisons
   - **Datasets** - Test datasets for evaluation

---

## Troubleshooting Workflows

### Problem 1: "Traces not showing up in Braintrust"

**Diagnostic steps:**

```bash
# 1. Verify API key is set
cat .env | grep BRAINTRUST_API_KEY
# Should show: BRAINTRUST_API_KEY=bt_...

# 2. Check sample rate
cat .env | grep BRAINTRUST_SAMPLE_RATE
# If 0.1, only 10% of traces are logged!

# 3. Run with verbose logging
npm run example  # Check console for "✅ Braintrust observability enabled"

# 4. Verify project name
node -e "require('dotenv').config(); console.log(process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk')"
```

**Solutions:**
- Set `BRAINTRUST_SAMPLE_RATE=1.0` in development
- Check you're looking at the correct project in Braintrust UI
- Ensure `.env` file is in project root

---

### Problem 2: "Multiple projects in dashboard"

**Why this happens:**
- Typos in `BRAINTRUST_PROJECT_NAME` create new projects
- Team members using different names
- Old test runs with different names

**Solutions:**

```bash
# Standardize project naming
echo "BRAINTRUST_PROJECT_NAME=my-team-agent-dev" > .env.local
echo "BRAINTRUST_PROJECT_NAME=my-team-agent-prod" > .env.production

# Archive unused projects via Web UI:
# Go to braintrust.dev/app → Select project → Settings → Archive
```

---

### Problem 3: "Cost is higher than expected"

**Diagnostic queries via MCP:**

```
Show me the top 10 most expensive agent executions this week
```

```
What's the average token usage per execution?
```

**Common causes:**
- **Retry loops** - Check for failed executions that retry multiple times
- **Extended thinking** - Uses more tokens but provides better reasoning
- **Large prompts** - Check if context is unnecessarily large
- **High sample rate** - Set `BRAINTRUST_SAMPLE_RATE=0.1` in production

**Solutions:**
- Enable sampling: `BRAINTRUST_SAMPLE_RATE=0.1` (reduces Braintrust costs)
- Optimize prompts: Review high-cost executions for prompt bloat
- Sandbox pooling: (Future feature - reuse sandboxes to reduce E2B costs)

---

### Problem 4: "MCP authentication failing"

**Symptoms:**
- OAuth flow doesn't complete
- "Authentication failed" errors

**Solutions:**

```bash
# 1. Remove and re-add MCP server
claude mcp remove braintrust
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp

# 2. Clear browser cache (OAuth uses browser)
# 3. Try incognito mode

# 4. Update Claude Code CLI
npm update -g @anthropic-ai/claude-code

# 5. Check status
# Visit: https://status.braintrust.dev/
```

---

## Advanced Features

### Multi-Turn Conversation Tracing

The SDK supports session-level tracing for multi-turn conversations:

```typescript
import { createSession, executeTurn, endSession } from './lib/sessions'

// Create session
const session = await createSession()

// Turn 1
await executeTurn(session.sessionId, 'What is the capital of France?')

// Turn 2 (uses context from Turn 1)
await executeTurn(session.sessionId, 'What is the population?')

// End session
await endSession(session.sessionId)
```

**Braintrust creates a hierarchical trace** showing:
- Root span: Entire conversation
- Sub-spans: Each turn
- Token usage: Cumulative across all turns
- Cost: Total conversation cost

---

### Evaluation Framework

Braintrust includes an evaluation framework (not covered by MCP):

```typescript
import { Eval } from "braintrust"

Eval("My First Evaluation", {
  data: () => [
    { input: "What is 2+2?", expected: "4" },
    { input: "Capital of France?", expected: "Paris" },
  ],
  task: async (input) => await runPythonAgent({ prompt: input }),
  scores: [
    (args) => ({
      name: "Exact Match",
      score: args.output === args.expected ? 1 : 0,
    }),
  ],
})
```

**View results:** Braintrust dashboard → Experiments tab

---

## Best Practices

### 1. Development vs Production Configuration

```bash
# .env.local (development)
BRAINTRUST_PROJECT_NAME=my-agent-dev
BRAINTRUST_SAMPLE_RATE=1.0  # Trace everything

# .env.production
BRAINTRUST_PROJECT_NAME=my-agent-prod
BRAINTRUST_SAMPLE_RATE=0.05  # Sample 5% (cost optimization)
```

### 2. Use MCP for Debugging

Instead of opening the browser:

```
# In Claude Code, ask:
"Show me failed executions from the last hour"
"What's the error for session sess_abc123?"
"Compare costs between yesterday and today"
```

### 3. Monitor Key Metrics

Set up weekly checks via MCP:

```
"What's the average cost per execution this week?"
"Show me error rate trends for the last 7 days"
"List the 5 slowest executions this month"
```

### 4. Team Coordination

Document your naming convention:

```markdown
# Braintrust Project Naming Convention

All team members MUST use:
- `our-agent-dev` - Development
- `our-agent-staging` - Staging
- `our-agent-prod` - Production

Setup: `cp .env.example.{environment} .env`
```

---

## Documentation References

This project has extensive Braintrust documentation:

| Document | Purpose |
|----------|---------|
| `BRAINTRUST_INTEGRATION_COMPLETE_GUIDE.md` | Full SDK integration guide |
| `BRAINTRUST_SDK_COMPREHENSIVE_GUIDE.md` | Braintrust SDK reference |
| `BRAINTRUST_MCP_INTEGRATION.md` | MCP server setup and usage |
| `BRAINTRUST_TROUBLESHOOTING.md` | Common issues and solutions |
| `BRAINTRUST_E2B_ARCHITECTURE.md` | Technical architecture details |

**Tip:** You can ask Claude Code to read these documents for detailed information on any topic.

---

## Skill Execution Strategy

When this skill is invoked:

1. **Determine user intent:**
   - Setup/configuration? → Guide through 3-step setup
   - MCP usage? → Show available tools and example queries
   - Troubleshooting? → Run diagnostics, suggest solutions
   - Cost analysis? → Use MCP to query cost data
   - General question? → Search documentation

2. **Use subagents when needed:**
   - For deep documentation research: Use Task tool with `Explore` agent
   - For complex troubleshooting: Analyze multiple files in parallel
   - For cost optimization: Query Braintrust via MCP, analyze results

3. **Provide actionable steps:**
   - Always give specific commands to run
   - Include expected output
   - Link to relevant documentation
   - Offer to execute queries if user wants

4. **Verify understanding:**
   - Ask clarifying questions if user intent is ambiguous
   - Confirm project name, environment before making changes
   - Suggest testing after configuration changes

---

## Example Invocations

### Example 1: First-time Setup

**User:** "How do I set up Braintrust?"

**Response:**
```
I'll help you set up Braintrust observability in 3 steps:

**Step 1: Get your Braintrust API key**

Visit: https://www.braintrust.dev/app/settings/api-keys
- Create a new API key
- Copy the key (starts with bt_...)

**Step 2: Add to your .env file**

```bash
echo "BRAINTRUST_API_KEY=bt_..." >> .env
```

**Step 3: Run an agent**

```bash
npm run example
```

You should see:
✅ Braintrust observability enabled

Then visit https://braintrust.dev/app to see your traces!

Would you like me to help you set up the MCP server as well?
```

---

### Example 2: Cost Analysis

**User:** "How much are my agents costing?"

**Response:**
```
Let me query Braintrust to analyze your agent costs.

I'll use the MCP server to run these queries:

1. Average cost per execution this week
2. Total cost breakdown (Claude + E2B)
3. Top 5 most expensive executions

[Executes MCP queries...]

**Results:**
- Average cost per execution: $0.0023
- Total this week: $12.45
  - Claude API: $10.20 (82%)
  - E2B Sandbox: $2.25 (18%)

**Top expensive executions:**
1. sess_abc123: $0.85 (retry loop - 12 attempts)
2. sess_xyz789: $0.45 (extended thinking enabled)
3. sess_def456: $0.32 (large codebase analysis)

**Recommendations:**
- Enable sampling in production: `BRAINTRUST_SAMPLE_RATE=0.1`
- Investigate retry loop in sess_abc123
- Consider caching for repeated codebase analysis

Would you like me to investigate any of these further?
```

---

### Example 3: Troubleshooting Missing Traces

**User:** "My traces aren't showing up in Braintrust"

**Response:**
```
Let me help diagnose why traces aren't appearing. I'll run some checks:

**1. Checking API key configuration...**
```

[Reads .env file]

```
✅ BRAINTRUST_API_KEY is set

**2. Checking sample rate...**
```

[Reads .env file]

```
⚠️  BRAINTRUST_SAMPLE_RATE=0.1 (only 10% of traces are logged)

**3. Checking project name...**
```

[Checks environment variable]

```
✅ Project: claude-agent-sdk

**Diagnosis:**

Your sample rate is set to 0.1, which means only 10% of executions are traced. This is normal for production but can make it seem like traces are "missing" in development.

**Solutions:**

**For development:** Set sample rate to 100%
```bash
echo "BRAINTRUST_SAMPLE_RATE=1.0" >> .env
```

**For production:** Keep 0.1 but query recent traces via MCP:
```
Show me all traces from the last hour (sampled and unsampled)
```

**Note:** Errors are ALWAYS traced, even when sampled out.

Would you like me to update your .env file to trace 100% in development?
```

---

## Context Limitations

**MCP Server Context:**

The Braintrust MCP server has some limitations to be aware of:

1. **No direct file access** - MCP can query Braintrust data but can't read local files
2. **Natural language only** - You don't need to write BTQL manually (MCP translates)
3. **Project-scoped** - Queries are scoped to your Braintrust projects
4. **Read-only** - MCP doesn't modify traces (only queries them)

**When to use SDK vs MCP:**
- **SDK**: Automatic logging during execution (no user action needed)
- **MCP**: Interactive queries after execution ("show me...", "what's the...")

**Best practice:** Use both together - SDK logs, MCP analyzes.

---

## Summary

This skill provides comprehensive guidance for:

✅ **Setup** - 3-step API key configuration
✅ **MCP Integration** - Natural language queries from Claude Code
✅ **Cost Tracking** - Automatic Claude + E2B cost breakdown
✅ **Troubleshooting** - Diagnostics for missing traces, multiple projects, auth issues
✅ **Production Best Practices** - Sampling, project naming, team coordination
✅ **Advanced Features** - Multi-turn tracing, evaluation framework, BTQL queries

**Key takeaway:** Braintrust is already integrated - users just need to add `BRAINTRUST_API_KEY` to `.env` and everything works automatically!

---

**Skill Version:** 1.0
**Last Updated:** 2026-01-05
**Maintained By:** Claude Agent SDK Experiments Project
