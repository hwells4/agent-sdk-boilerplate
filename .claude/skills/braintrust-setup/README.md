# Braintrust Setup & Usage Skill

> Comprehensive guidance for setting up and using Braintrust observability in the Claude Agent SDK project.

**Status:** Production-Ready
**Version:** 1.0
**Last Updated:** 2026-01-05

---

## Overview

This skill provides expert assistance with:

1. **Braintrust Setup** - API key configuration, project naming, environment variables
2. **MCP Server Integration** - Natural language querying of traces and costs from Claude Code
3. **SDK Usage** - Understanding automatic tracing, cost tracking, and what gets logged
4. **Troubleshooting** - Fixing missing traces, multiple projects, authentication issues
5. **Production Optimization** - Sampling strategies, cost reduction, best practices

---

## Files in This Skill

| File | Purpose |
|------|---------|
| `SKILL.md` | Complete skill documentation with knowledge base and workflows |
| `examples.md` | 7 real-world usage examples with detailed responses |
| `quick-reference.md` | Fast lookup card for common tasks and queries |
| `README.md` | This file - overview and navigation guide |

---

## Auto-Invocation

This skill automatically triggers when users ask about:

- Braintrust setup and configuration
- Observability, monitoring, tracing
- Cost tracking and optimization
- MCP server usage and queries
- Troubleshooting Braintrust issues

**Example triggers:**
- "How do I set up Braintrust?"
- "Show me failed agent executions"
- "What are my agent costs?"
- "Why aren't my traces showing up?"
- "How do I use the Braintrust MCP server?"

---

## Key Features

### 1. Zero-Code Setup

The SDK already has Braintrust integrated. Users just need:

```bash
echo "BRAINTRUST_API_KEY=bt_..." >> .env
npm run example
```

**That's it!** Traces automatically flow to Braintrust.

### 2. MCP Server Integration

Query Braintrust data from Claude Code using natural language:

```bash
# One-time setup
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp
```

**Example queries:**
```
Show me all failed executions from the last 24 hours
What's the average cost per execution this week?
Get the trace for session sess_abc123
```

### 3. Automatic Tracing

Every agent execution automatically logs:
- ✅ Input/output
- ✅ Token usage and costs (Claude + E2B)
- ✅ Tool executions
- ✅ Errors with debugging context
- ✅ Extended thinking
- ✅ Multi-turn conversations

### 4. Production-Ready Sampling

Reduce observability costs by 90% in production:

```bash
BRAINTRUST_SAMPLE_RATE=0.1  # Sample 10% of traces
```

**Note:** Errors are always traced regardless of sample rate.

---

## Quick Start

### For First-Time Setup

Read: `examples.md` → **Example 1: Complete First-Time Setup**

**TL;DR:**
1. Get API key from https://www.braintrust.dev/app/settings/api-keys
2. Add to `.env`: `BRAINTRUST_API_KEY=bt_...`
3. Run: `npm run example`
4. View traces: https://braintrust.dev/app

### For MCP Queries

Read: `examples.md` → **Example 7: MCP Query Reference**

**TL;DR:**
```bash
claude mcp add --transport http braintrust https://api.braintrust.dev/mcp
```

Then query naturally:
```
Show me failed executions from the last 24 hours
What's the average cost per execution?
```

### For Cost Optimization

Read: `examples.md` → **Example 3: Cost Analysis and Optimization**

**TL;DR:**
- Enable sampling: `BRAINTRUST_SAMPLE_RATE=0.1`
- Add retry limits to prevent runaway loops
- Use extended thinking selectively
- Monitor costs weekly via MCP

### For Troubleshooting

Read: `examples.md` → **Example 5: Troubleshooting Multiple Projects**

**Common Issues:**
- Missing traces → Check sample rate
- Multiple projects → Standardize naming
- Auth failures → Re-add MCP server

---

## Documentation Structure

### SKILL.md

**Complete knowledge base including:**

1. Quick Setup (3 steps)
2. Architecture Overview
3. What Gets Automatically Tracked
4. Braintrust MCP Server (setup + tools)
5. SDK vs MCP Comparison
6. Environment Variables Reference
7. Cost Tracking Breakdown
8. Trace Sampling
9. BTQL Query Language Basics
10. Troubleshooting Workflows
11. Advanced Features
12. Best Practices

**Use when:** You need comprehensive information on any Braintrust topic.

### examples.md

**7 Real-World Examples:**

1. Complete First-Time Setup
2. Using MCP to Debug Failed Executions
3. Cost Analysis and Optimization
4. Multi-Environment Setup (dev/staging/prod)
5. Troubleshooting Multiple Projects
6. Understanding What Gets Logged
7. MCP Query Reference

**Use when:** You want to see how the skill responds to specific user questions.

### quick-reference.md

**Fast Lookup Card:**

- Setup commands
- MCP queries
- Environment variables
- Project naming strategies
- Sampling configuration
- Troubleshooting commands
- BTQL examples

**Use when:** You need a quick answer without reading full documentation.

---

## Integration with Project

This skill integrates with existing Braintrust documentation:

| Skill File | Project Documentation |
|------------|----------------------|
| `SKILL.md` - Setup Guide | `docs/BRAINTRUST_INTEGRATION_COMPLETE_GUIDE.md` |
| `SKILL.md` - SDK Reference | `docs/BRAINTRUST_SDK_COMPREHENSIVE_GUIDE.md` |
| `SKILL.md` - MCP Integration | `docs/BRAINTRUST_MCP_INTEGRATION.md` |
| `SKILL.md` - Troubleshooting | `docs/BRAINTRUST_TROUBLESHOOTING.md` |
| `SKILL.md` - Architecture | `docs/BRAINTRUST_E2B_ARCHITECTURE.md` |

**The skill can:**
- Reference these documents for detailed information
- Launch subagents to explore documentation
- Provide summaries and actionable steps

---

## Skill Execution Flow

```
User Question
     │
     ↓
Skill Triggered (auto-invoke)
     │
     ↓
Determine Intent:
     ├─ Setup/Config → Guide through 3-step setup
     ├─ MCP Usage → Show tools + example queries
     ├─ Troubleshooting → Run diagnostics, suggest solutions
     ├─ Cost Analysis → Use MCP to query data
     └─ General Question → Search documentation
     │
     ↓
Use Subagents (if needed):
     ├─ Explore agent → Research documentation
     ├─ MCP queries → Fetch Braintrust data
     └─ File reads → Check configuration
     │
     ↓
Provide Actionable Response:
     ├─ Specific commands to run
     ├─ Expected output
     ├─ Links to documentation
     └─ Offer to execute next steps
```

---

## Example Usage

### User: "How do I set up Braintrust?"

**Skill Response:**
1. Identifies intent: First-time setup
2. Provides 3-step guide
3. Explains what happens after setup
4. Offers to help with MCP server setup
5. Links to documentation

### User: "Show me failed executions"

**Skill Response:**
1. Identifies intent: MCP query
2. Checks if MCP server is set up
3. Executes MCP query via natural language
4. Analyzes results
5. Suggests next steps (e.g., investigate specific session)

### User: "My costs are too high"

**Skill Response:**
1. Identifies intent: Cost optimization
2. Uses MCP to query cost data
3. Identifies expensive patterns
4. Provides specific optimizations with impact estimates
5. Offers to implement changes

---

## Best Practices for Using This Skill

### As a User

1. **Ask naturally** - The skill understands context
   - "How do I set up Braintrust?" ✅
   - "braintrust setup instructions" (also works)

2. **Be specific when troubleshooting**
   - "My traces aren't showing up" ✅
   - "Braintrust not working" (less helpful)

3. **Request next steps**
   - "Can you help me implement this?" ✅
   - The skill will offer to execute commands or make changes

### As a Developer

1. **Keep documentation updated**
   - Skill references `docs/BRAINTRUST_*.md` files
   - Update skill when documentation changes

2. **Add new examples**
   - Expand `examples.md` with new use cases
   - Include actual user questions and responses

3. **Monitor common questions**
   - Track what users ask most frequently
   - Add to quick-reference.md for fast lookup

---

## Testing the Skill

### Test Cases

```bash
# 1. Setup
"How do I set up Braintrust?"
→ Should provide 3-step guide

# 2. MCP Queries
"Show me failed executions from the last 24 hours"
→ Should execute MCP query

# 3. Cost Analysis
"What are my agent costs this week?"
→ Should query Braintrust via MCP

# 4. Troubleshooting
"My traces aren't showing up"
→ Should run diagnostics

# 5. Configuration
"How do I set up dev/staging/prod projects?"
→ Should explain environment-based naming
```

### Verification

After invoking the skill:
- ✅ Response is actionable (specific commands)
- ✅ References correct documentation
- ✅ Offers next steps
- ✅ Includes examples

---

## Limitations

### What This Skill Can Do

✅ Guide through Braintrust setup
✅ Execute MCP queries (if MCP server is set up)
✅ Read and analyze local configuration
✅ Provide troubleshooting steps
✅ Reference project documentation
✅ Launch subagents for deep research

### What This Skill Cannot Do

❌ Directly modify Braintrust web UI
❌ Create Braintrust API keys (user must do this)
❌ Archive projects (requires web UI)
❌ Modify experiments or datasets directly

**Workaround:** Skill provides step-by-step instructions for tasks requiring web UI.

---

## Future Enhancements

**Potential additions:**

1. **Interactive setup wizard**
   - Automated `.env` file creation
   - Verification script execution
   - MCP server setup automation

2. **Cost optimization calculator**
   - Analyze current costs
   - Project savings from optimizations
   - ROI calculations

3. **Team onboarding checklist**
   - Verify team members have correct config
   - Validate project naming consistency
   - Check sampling rates per environment

4. **Advanced BTQL templates**
   - Pre-built queries for common analyses
   - Custom scorer examples
   - Dataset creation workflows

---

## Contributing

To improve this skill:

1. **Add new examples** to `examples.md`
2. **Update troubleshooting** in `SKILL.md`
3. **Expand quick reference** in `quick-reference.md`
4. **Document edge cases** in this README

---

## Support

**Questions about this skill?**

Ask in Claude Code:
```
"How does the Braintrust skill work?"
"What can the Braintrust skill help me with?"
```

**Questions about Braintrust?**

The skill will help you! Just ask:
```
"How do I [Braintrust task]?"
```

---

## Version History

**v1.0** (2026-01-05)
- Initial release
- Complete setup and MCP integration guidance
- 7 comprehensive examples
- Quick reference card
- Troubleshooting workflows

---

**Skill Maintainer:** Claude Agent SDK Experiments Project
**Documentation:** See `SKILL.md` for complete knowledge base
