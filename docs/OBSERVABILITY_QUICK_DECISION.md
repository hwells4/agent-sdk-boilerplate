# Observability Platform Quick Decision Guide

**Use this guide for fast decision-making on which observability platform to use.**

---

## TL;DR - Choose Based on Your Situation

### Development/Testing (< 1,000 executions/month)
**Use: Braintrust Free Tier** ($0/month)
- 1M spans, 14-day retention, unlimited users
- Best evaluation features out of the box
- Easy setup, no engineering required

### Small Production (1,000-10,000 executions/month)
**Use: Langfuse Cloud Pro** ($199/month) OR **SigNoz Cloud** ($49/month)

**Langfuse if**: You want LLM-specific features (cost tracking, prompt management, evaluations)
**SigNoz if**: You're willing to build LLM features yourself to save $150/month

### Medium Production (10,000-50,000 executions/month)
**Use: Langfuse Self-Hosted** (~$100-200/month infrastructure)
- Best cost efficiency at this scale
- Full control over data
- Requires DevOps expertise

### Large Production (> 50,000 executions/month)
**Use: Langfuse Enterprise (Self-Hosted)** or **Braintrust Enterprise**
- Negotiate custom pricing
- Consider dedicated support, SLA requirements
- Self-hosted Langfuse typically 50-70% cheaper than Braintrust

---

## One-Page Comparison

| Platform | Best For | Monthly Cost (10k executions) | Setup Time | LLM Features |
|----------|----------|-------------------------------|------------|--------------|
| **Braintrust Free** | Development | **$0** | 1 hour | Excellent |
| **Braintrust Pro** | Fast shipping, CI/CD critical | $264 | 1 hour | Excellent |
| **Langfuse Cloud** | Production startups | **$199** | 2 hours | Excellent |
| **Langfuse Self-Hosted** | Cost optimization | **$50-100** | 1-2 days | Excellent |
| **SigNoz Cloud** | Budget-conscious teams | **$49** | 2-4 hours | Basic |
| **W&B Weave** | ML teams already using W&B | $250-300 | 2-3 hours | Excellent |

---

## Decision Tree

```
START: How many agent executions per month?

< 1,000 executions
  --> Braintrust Free Tier ($0)
      Reason: Generous limits, best features, no setup cost

1,000-10,000 executions
  --> Do you have DevOps expertise?
      YES --> Langfuse Self-Hosted ($50-100)
              Reason: Best long-term cost efficiency
      NO  --> Do you need CI/CD integration immediately?
              YES --> Braintrust Pro ($264)
                      Reason: Saves 1+ week engineering time
              NO  --> Langfuse Cloud Pro ($199)
                      Reason: Best balance of features and cost

10,000-50,000 executions
  --> Do you have DevOps expertise?
      YES --> Langfuse Self-Hosted ($100-200)
              Reason: Lowest cost at scale
      NO  --> Langfuse Cloud Pro or Team ($199+)
              Reason: Managed service with good LLM features

> 50,000 executions
  --> Negotiate Enterprise pricing
      Langfuse Enterprise (self-hosted) for best cost
      Braintrust Enterprise if managed service preferred
```

---

## Cost Calculator (Quick Estimates)

### Assumptions
- Each agent execution = 5-10 trace spans
- Each execution = 10-60 KB data
- 10k executions = ~50k-100k spans, ~5-10 GB data

### Monthly Costs

| Executions/Month | Braintrust | Langfuse Cloud | Langfuse Self-Hosted | SigNoz Cloud |
|------------------|-----------|----------------|----------------------|--------------|
| 1,000 | **FREE** | **FREE** | $50 (infra) | $49 |
| 5,000 | **FREE** | **FREE** | $50 (infra) | $49 |
| 10,000 | $264 | **$199** | **$100** | $49 |
| 25,000 | $350+ | Custom | **$150** | $49-100 |
| 50,000 | $450+ | Custom | **$200** | $100-150 |
| 100,000 | $519+ | Custom | **$300-400** | $200-300 |

**Key Takeaway**: Self-hosted Langfuse becomes most cost-effective at 10k+ executions/month.

---

## Feature Checklist

Use this to validate your platform choice includes what you need:

### Must-Have Features (All Platforms)
- [ ] Trace/span tracking for agent executions
- [ ] Real-time streaming of events
- [ ] Basic dashboards and visualization
- [ ] Search and filtering

### Nice-to-Have Features (LLM-Specific Platforms)
- [ ] Token-level cost tracking
- [ ] Prompt versioning and management
- [ ] Evaluation framework for agent outputs
- [ ] Dataset management
- [ ] Integration with CI/CD pipelines

### Platform Feature Matrix

| Feature | Braintrust | Langfuse | SigNoz | W&B Weave |
|---------|-----------|----------|--------|-----------|
| Cost Tracking | Yes | Yes | No | Yes |
| Prompt Management | Yes | Yes | No | Yes |
| Evaluations | Yes | Yes | No | Yes |
| Multi-Model Proxy | Yes | No | No | Yes |
| Self-Hosting (Free) | No | **Yes** | **Yes** | No |
| CI/CD Integration | **Yes** | Limited | No | Limited |
| Open Source | No | **Yes** | **Yes** | No |

---

## Common Mistakes to Avoid

### 1. Choosing Based Only on Free Tier
**Problem**: Free tiers are limited by retention and data volume.
**Solution**: Estimate production volume and calculate costs for paid tiers.

### 2. Ignoring Engineering Time
**Problem**: Cheap platforms may require weeks of custom development.
**Solution**: Factor in engineering costs ($100-200/hour) when comparing.

**Example**:
- Braintrust Pro: $264/month, 1 hour setup
- SigNoz Cloud: $49/month, but 3-4 weeks to build LLM features
- Actual cost: SigNoz = $49 + (160 hours × $150/hour) = $24,049 in first month

### 3. Overlooking Self-Hosting Complexity
**Problem**: Self-hosted options require DevOps expertise and ongoing maintenance.
**Solution**: Only choose self-hosted if you have dedicated DevOps resources.

### 4. Not Planning for Scale
**Problem**: Choosing a platform that becomes expensive at scale.
**Solution**: Look at cost projections for 10x your current volume.

**Example**:
- Current: 1,000 executions/month on Braintrust Free (works great)
- 6 months later: 15,000 executions/month
- Braintrust Pro cost: $264/month
- Should have chosen: Langfuse Cloud Pro ($199) or self-hosted ($100-150)

### 5. Vendor Lock-In
**Problem**: Proprietary platforms make migration difficult.
**Solution**: Prefer open-source or OpenTelemetry-compatible platforms.

**Open-source options**:
- Langfuse (Apache 2.0)
- SigNoz (OpenTelemetry-native)
- MLflow (Apache 2.0)

---

## Migration Strategy

### From Braintrust Free to Langfuse (Recommended)

**Why Migrate**:
- Lower long-term costs ($199 vs $264/month)
- Open-source flexibility
- Better retention (30 days vs 14 days on free tier)

**When to Migrate**:
- When you approach 1M spans/month on Braintrust Free
- When you need > 14 days retention
- When self-hosting becomes viable (DevOps resources available)

**Migration Steps**:
1. **Week 1**: Set up Langfuse Cloud trial, run both platforms in parallel
2. **Week 2**: Compare debugging experience, cost tracking accuracy
3. **Week 3**: Migrate production traffic to Langfuse, keep Braintrust for 1 month overlap
4. **Week 4**: Fully deprecate Braintrust, export historical data if needed

**Engineering Time**: ~1 week for migration

---

## ROI Justification (For Managers)

### Scenario: 10,000 Agent Executions/Month

**Option A: Braintrust Pro**
- **Cost**: $264/month = $3,168/year
- **Setup**: 1 hour
- **Features**: Full CI/CD, evaluations, multi-model proxy included
- **Total Year 1 Cost**: ~$3,200 (including minimal engineering time)

**Option B: Langfuse Cloud Pro**
- **Cost**: $199/month = $2,388/year
- **Setup**: 2 hours + 1-2 weeks for CI/CD/evaluations
- **Engineering cost**: ~$4,000-8,000 (at $100-200/hour)
- **Total Year 1 Cost**: ~$6,400-10,400
- **Total Year 2+ Cost**: $2,388/year (ongoing)

**Option C: Langfuse Self-Hosted**
- **Cost**: $100/month = $1,200/year (infrastructure)
- **Setup**: 1-2 days + 2-3 weeks for deployment + CI/CD/evaluations
- **Engineering cost**: ~$8,000-12,000 (at $100-200/hour)
- **Total Year 1 Cost**: ~$9,200-13,200
- **Total Year 2+ Cost**: $1,200/year + maintenance (~$2,000/year)

### Break-Even Analysis

**Braintrust vs Langfuse Cloud**:
- Break-even: Year 2 (Langfuse saves $780/year ongoing)
- Choose Braintrust if: You value fast shipping > long-term cost savings

**Braintrust vs Langfuse Self-Hosted**:
- Break-even: Year 4-5 (Langfuse saves ~$2,000/year after initial investment)
- Choose Langfuse if: You have DevOps resources and plan to use for 2+ years

---

## Quick Start Commands

### Braintrust

```typescript
import { Braintrust } from '@braintrust/core';

const braintrust = new Braintrust({
  apiKey: process.env.BRAINTRUST_API_KEY
});

// Start tracing
const span = braintrust.startSpan({
  name: 'agent_execution',
  type: 'agent'
});

// Log events
span.log({
  input: 'User prompt',
  output: 'Agent response',
  metadata: { cost: 0.05, tokens: 1000 }
});

span.end();
```

### Langfuse

```typescript
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY
});

// Start tracing
const trace = langfuse.trace({
  name: 'agent_execution'
});

// Log generation
const generation = trace.generation({
  name: 'claude_agent',
  input: 'User prompt',
  output: 'Agent response',
  usage: { promptTokens: 500, completionTokens: 500 }
});
```

### SigNoz (OpenTelemetry)

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('claude-agent-sdk');

const span = tracer.startSpan('agent_execution');

span.setAttribute('agent.input', 'User prompt');
span.setAttribute('agent.output', 'Agent response');
span.setAttribute('agent.cost', 0.05);

span.end();
```

---

## Next Steps

1. **Choose your platform** based on the decision tree above
2. **Implement basic tracing** in `/examples/lib/agent.ts`
3. **Test with 100-1,000 executions** to validate cost estimates
4. **Document findings** in `/docs/OBSERVABILITY_IMPLEMENTATION.md`
5. **Review quarterly** as pricing and features evolve rapidly

---

**Last Updated**: 2026-01-04
**Maintained By**: Claude Agent SDK Team
