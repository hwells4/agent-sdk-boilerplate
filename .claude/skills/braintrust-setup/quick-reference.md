# Braintrust Quick Reference Card

> Fast lookup for common Braintrust tasks

---

## Setup (3 Steps)

```bash
# 1. Get API key from https://www.braintrust.dev/app/settings/api-keys
# 2. Add to .env
echo "BRAINTRUST_API_KEY=bt_..." >> .env
# 3. Run agent
npm run example
```

---

## MCP Server Setup

```bash
# Add MCP server (one-time)
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp

# First query triggers OAuth (automatic)
```

---

## Environment Variables

```bash
# Required
BRAINTRUST_API_KEY=bt_...

# Optional (defaults shown)
BRAINTRUST_PROJECT_NAME=claude-agent-sdk
BRAINTRUST_SAMPLE_RATE=1.0  # 0.0-1.0
```

---

## Common MCP Queries

```
# Debugging
Show me all failed executions from the last 24 hours
Get the trace for session sess_abc123

# Cost Analysis
What's the average cost per execution this week?
Show me the top 5 most expensive executions

# Performance
What's the average execution time?
Show me the slowest 10 executions

# Token Usage
What's the average token usage per execution?
Show me executions with > 10,000 tokens
```

---

## Project Naming Strategies

```bash
# Single project (simple)
BRAINTRUST_PROJECT_NAME=my-agent

# Environment-based (recommended)
BRAINTRUST_PROJECT_NAME=my-agent-dev
BRAINTRUST_PROJECT_NAME=my-agent-staging
BRAINTRUST_PROJECT_NAME=my-agent-prod

# Feature-based
BRAINTRUST_PROJECT_NAME=customer-support-agent
BRAINTRUST_PROJECT_NAME=code-review-agent
```

---

## Sampling for Production

```bash
# Development: Trace everything
BRAINTRUST_SAMPLE_RATE=1.0

# Staging: Sample 50%
BRAINTRUST_SAMPLE_RATE=0.5

# Production: Sample 10% (cost optimization)
BRAINTRUST_SAMPLE_RATE=0.1
```

**Note:** Errors are always traced regardless of sample rate.

---

## What Gets Logged Automatically

✅ Input prompt and output result
✅ Token usage (prompt, completion, cached)
✅ Cost breakdown (Claude API + E2B sandbox)
✅ Tool executions (Bash, Read, Write, Edit, Glob, Grep)
✅ Errors with full debugging context
✅ Extended thinking (when enabled)
✅ Multi-turn conversations (with sessions API)

---

## Cost Breakdown Example

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

## Viewing Traces

**Web UI:**
- https://braintrust.dev/app
- Navigate to your project
- Click any trace for full details

**MCP Server (from Claude Code):**
```
Show me the last 10 agent executions
Get the trace for session sess_abc123
```

---

## Troubleshooting

**Traces not showing up?**
```bash
# Check API key
cat .env | grep BRAINTRUST_API_KEY

# Check sample rate (might be < 1.0)
cat .env | grep BRAINTRUST_SAMPLE_RATE

# Set to 100% for development
echo "BRAINTRUST_SAMPLE_RATE=1.0" >> .env
```

**Multiple projects in dashboard?**
```bash
# Standardize naming
echo "BRAINTRUST_PROJECT_NAME=my-team-agent-dev" > .env

# Archive unused projects via Web UI:
# braintrust.dev/app → Select project → Settings → Archive
```

**Authentication failing?**
```bash
# Remove and re-add MCP server
claude mcp remove braintrust
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp

# Clear browser cache and retry
```

---

## BTQL Query Basics

```btql
# Find failed executions
select: id, error, created, metrics.cost
from: project_logs('claude-agent-sdk') traces
filter: error IS NOT NULL AND created > now() - interval 1 day
sort: created desc
limit: 50

# Cost analysis
dimensions: day(created) as date
measures:
  count(1) as executions,
  avg(metrics.cost) as avg_cost,
  sum(metrics.cost) as total_cost
from: project_logs('claude-agent-sdk') traces
filter: created > now() - interval 7 day
sort: date desc
```

**Tip:** Use natural language with MCP instead of writing BTQL manually!

---

## MCP Tools Reference

| Tool | Example Query |
|------|---------------|
| `search_docs` | "How do I create a custom scorer?" |
| `resolve_object` | "Get the ID for experiment 'baseline'" |
| `list_recent_objects` | "Show me my 10 most recent experiments" |
| `infer_schema` | "What fields are available in traces?" |
| `btql_query` | "Find traces with cost > $1" |
| `summarize_experiment` | "Summarize experiment exp_abc123" |
| `generate_permalink` | "Create link to latest A/B test" |

---

## Cost Optimization Checklist

```bash
□ Enable sampling in production: BRAINTRUST_SAMPLE_RATE=0.1
□ Add retry limits to prevent runaway loops
□ Use extended thinking only for complex tasks
□ Implement session management for multi-turn conversations
□ Monitor weekly costs via MCP queries
□ Archive old/unused projects
```

---

## Documentation Links

| Document | Location |
|----------|----------|
| Complete Integration Guide | `docs/BRAINTRUST_INTEGRATION_COMPLETE_GUIDE.md` |
| SDK Reference | `docs/BRAINTRUST_SDK_COMPREHENSIVE_GUIDE.md` |
| MCP Integration | `docs/BRAINTRUST_MCP_INTEGRATION.md` |
| Troubleshooting | `docs/BRAINTRUST_TROUBLESHOOTING.md` |
| Architecture | `docs/BRAINTRUST_E2B_ARCHITECTURE.md` |

---

## Quick Diagnostics

```bash
# Verify configuration
node -e "require('dotenv').config(); console.log('API Key:', process.env.BRAINTRUST_API_KEY ? 'Set ✅' : 'Missing ❌'); console.log('Project:', process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk (default)'); console.log('Sample Rate:', process.env.BRAINTRUST_SAMPLE_RATE || '1.0 (default)');"

# Test integration
npm run example

# Check MCP status
claude mcp list | grep braintrust
```

---

## Support

**Issues?** Ask in Claude Code:
```
"I'm having trouble with Braintrust - [describe issue]"
```

**Documentation:**
- Braintrust Docs: https://www.braintrust.dev/docs
- MCP Reference: https://www.braintrust.dev/docs/reference/mcp
- BTQL Reference: https://www.braintrust.dev/docs/reference/btql

---

**Last Updated:** 2026-01-05
