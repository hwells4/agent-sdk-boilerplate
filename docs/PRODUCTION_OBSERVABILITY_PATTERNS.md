# Production Observability Patterns for LLM Applications
> Comprehensive research on production-ready observability for Claude Agent SDK + E2B deployments

**Last Updated:** 2026-01-05
**Status:** Research Complete

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Braintrust Best Practices](#braintrust-best-practices)
3. [Alternative & Complementary Tools](#alternative--complementary-tools)
4. [Production Monitoring Strategies](#production-monitoring-strategies)
5. [Missing Observability Features](#missing-observability-features)
6. [Recommended Production Stack](#recommended-production-stack)
7. [Implementation Guide](#implementation-guide)
8. [Cost Analysis](#cost-analysis)
9. [Sources](#sources)

---

## Executive Summary

### Key Findings

Production LLM observability in 2025 has evolved from simple logging to comprehensive, multi-layered monitoring systems. Based on research across industry platforms and production deployments:

**Critical Success Factors:**
- **Trace everything**: Errors, tool calls, reasoning processes, and cost attribution
- **Go beyond latency**: Monitor task success rates, tool selection accuracy, and quality metrics
- **Always-trace-errors**: Even with sampling enabled, production systems must capture all failures
- **Hierarchical tracing**: Session > Trace > Span > Event structure for agent workflows
- **Cost attribution**: Track both LLM API costs AND infrastructure costs (E2B sandboxes, vector DBs)

**Platform Landscape (2025):**
- **Braintrust**: Best evaluation-first platform with Claude Code integration ($249/mo Pro)
- **Langfuse**: Best open-source option with unlimited self-hosted retention ($0 self-hosted)
- **Arize Phoenix**: Best for embedding drift and production monitoring (open-source)
- **OpenTelemetry**: Industry standard for vendor-neutral instrumentation

**Production Stack Recommendation:**
```
OpenTelemetry → Langfuse (self-hosted) + Braintrust (evaluation)
```

This combination provides:
- ✅ Unlimited trace retention (Langfuse)
- ✅ Best-in-class evaluation features (Braintrust)
- ✅ Vendor neutrality (OpenTelemetry)
- ✅ Cost efficiency ($249/mo vs enterprise-only alternatives)

---

## Braintrust Best Practices

### 1. Essential Metrics (Always Tracked)

Braintrust automatically captures these metrics for every LLM interaction:

| Metric | Description | Why It Matters |
|--------|-------------|----------------|
| **Duration** | Total execution time | User experience, timeout detection |
| **LLM Duration** | Time spent in model inference | Model performance bottlenecks |
| **Time to First Token (TTFT)** | Latency before first token | Perceived responsiveness ([critical for chatbots](https://docs.anyscale.com/llm/serving/benchmarking/metrics)) |
| **Prompt Tokens** | Input token count | Cost attribution, context management |
| **Cached Tokens** | Prompt cache hits | Cost optimization (90% savings on cached) |
| **Completion Tokens** | Output token count | Cost tracking, verbosity monitoring |
| **Reasoning Tokens** | Extended thinking tokens | Advanced reasoning model usage |
| **Total Cost** | Estimated API cost | Budget tracking, anomaly detection |
| **LLM Calls** | Number of API requests | Multi-turn conversations, retry patterns |
| **Tool Calls** | Agent tool invocations | Agent complexity, tool reliability |
| **Errors** | Categorized failures | Reliability monitoring, debugging |

**Source:** [Braintrust Three Pillars of AI Observability](https://www.braintrust.dev/blog/three-pillars-ai-observability)

#### Time to First Token (TTFT) - Critical for Production

TTFT is **the most important metric for conversational AI**:

- **Target**: < 500ms for real-time applications
- **User Impact**: Determines perceived responsiveness
- **Production Importance**: "For interactive, conversational AI (like a chatbot), Time to First Token (TTFT) is most important for perceived speed" ([source](https://docs.anyscale.com/llm/serving/benchmarking/metrics))

**What affects TTFT:**
- Prompt length (longer prompts = higher TTFT)
- Request queuing time
- KV-cache computation
- Network latency

**Monitoring Strategy:**
```typescript
// Track TTFT in streaming responses
const startTime = Date.now()
let firstTokenTime: number | null = null

onStream: {
  onText: (text) => {
    if (!firstTokenTime) {
      firstTokenTime = Date.now() - startTime
      span.setAttribute('ttft_ms', firstTokenTime)
    }
  }
}
```

**Sources:**
- [Understand LLM latency and throughput metrics | Anyscale](https://docs.anyscale.com/llm/serving/benchmarking/metrics)
- [Practical Guide to LLM Inference in Production (2025)](https://compute.hivenet.com/post/llm-inference-production-guide)

---

### 2. Span Structure for Agent Systems

Braintrust follows a **hierarchical tracing architecture** optimized for agent workflows:

```
Session (Multi-turn conversation)
  └─ Trace (Single agent execution)
      └─ Span (Logical unit of work)
          └─ Event (Significant milestone)
              └─ Generation (Individual LLM call)
```

**Source:** [Tracing - Braintrust](https://www.braintrust.dev/docs/guides/traces)

#### Recommended Span Hierarchy for Claude Agent SDK

```
Session: "user_conversation_abc123"
  ├─ Trace: "agent_execution_1"
  │   ├─ Span: "sandbox_creation"
  │   │   └─ Event: "e2b_sandbox_started"
  │   ├─ Span: "agent_reasoning"
  │   │   ├─ Generation: "llm_call_1" (Planning)
  │   │   ├─ Generation: "llm_call_2" (Tool selection)
  │   │   └─ Event: "extended_thinking_used"
  │   ├─ Span: "tool_execution"
  │   │   ├─ Span: "bash_command"
  │   │   ├─ Span: "file_read"
  │   │   └─ Span: "grep_search"
  │   └─ Span: "sandbox_cleanup"
  │       └─ Event: "e2b_sandbox_terminated"
  └─ Trace: "agent_execution_2"
      └─ ... (similar structure)
```

**Best Practices:**

1. **Session-level traces** for multi-turn conversations
   - Enables conversation-level analysis
   - Tracks context accumulation over turns
   - Critical for debugging multi-step workflows

2. **Span per logical operation** (not per line of code)
   - Sandbox lifecycle events
   - Agent reasoning phases
   - Tool executions
   - LLM API calls

3. **Events for milestones** (not spans)
   - Configuration changes
   - Cache hits/misses
   - Threshold crossings
   - State transitions

**Source:** [Evaluating agents with trace-driven insights | Braintrust](https://medium.com/@braintrustdata/evaluating-agents-with-trace-driven-insights-9ad3bfed820e)

---

### 3. Session vs Execution Tracing Patterns

**Session Tracing (Recommended for Agents)**

Track **entire conversations** as hierarchical traces:

```typescript
// Create session-level trace
const sessionSpan = braintrust.startSpan({
  name: 'conversation_session',
  attributes: {
    user_id: 'user_123',
    session_id: 'session_abc',
  }
})

// Each turn becomes a child span
const turn1Span = sessionSpan.startSpan({ name: 'turn_1' })
await executeTurn(sessionId, 'What is the capital of France?')
turn1Span.end()

const turn2Span = sessionSpan.startSpan({ name: 'turn_2' })
await executeTurn(sessionId, 'What is its population?')
turn2Span.end()

sessionSpan.end()
```

**Benefits:**
- ✅ Full conversation context for debugging
- ✅ Track state evolution across turns
- ✅ Analyze conversation quality holistically
- ✅ Attribute costs per session (not just per turn)

**Execution Tracing (Legacy Pattern)**

Track **individual executions** without session context:

```typescript
// Each execution is isolated
await braintrust.traced(async (span) => {
  const result = await runPythonAgent({ prompt: '...' })
  span.log({ result })
})
```

**Limitations:**
- ❌ No conversation context
- ❌ Can't track multi-turn reasoning
- ❌ Harder to debug state-dependent issues
- ❌ Cost attribution per execution only

**Recommendation:** Use **session tracing** for agent systems, execution tracing only for one-shot tasks.

**Source:** [Core Concepts | Braintrust SDK](https://deepwiki.com/braintrustdata/braintrust-sdk/2-core-concepts)

---

### 4. Cost Attribution Strategies

Production LLM systems require **multi-dimensional cost tracking**:

#### LLM API Costs

Track at the **generation level** with detailed breakdown:

```typescript
span.log({
  metrics: {
    prompt_tokens: 1500,
    completion_tokens: 300,
    cached_tokens: 1200,  // 80% cache hit!
    reasoning_tokens: 5000,  // Extended thinking
    prompt_cost: 0.0045,  // $3/1M * 1500
    completion_cost: 0.0045,  // $15/1M * 300
    cached_cost: 0.00036,  // $0.30/1M * 1200
    reasoning_cost: 0.015,  // $3/1M * 5000
    total_llm_cost: 0.02436
  }
})
```

**Pricing (Claude Sonnet 4.5 - Jan 2025):**
- Prompt tokens: $3/1M
- Completion tokens: $15/1M
- Cached tokens: $0.30/1M (90% savings)
- Reasoning tokens: $3/1M

**Source:** Current Claude API pricing

#### Infrastructure Costs

Track **sandbox compute** and **storage** costs:

```typescript
span.log({
  metrics: {
    // E2B Sandbox
    e2b_duration_seconds: 12.5,
    e2b_vcpu_count: 2,
    e2b_cost: 0.00035,  // $0.000014/vCPU/sec * 2 * 12.5

    // Vector Database (if applicable)
    turso_queries: 150,
    turso_cost: 0.00003,  // $5/25M queries

    // Total infrastructure
    infrastructure_cost: 0.00038,

    // Combined
    total_cost: 0.02474  // LLM + infrastructure
  }
})
```

**Source:** [LLM cost attribution: Tracking and optimizing spend for GenAI apps](https://portkey.ai/blog/llm-cost-attribution-for-genai-apps/)

#### Multi-Tenant Cost Attribution

For **SaaS applications**, tag costs by tenant/user/team:

```typescript
span.log({
  attributes: {
    tenant_id: 'customer_acme',
    user_id: 'user_123',
    business_unit: 'engineering',
    feature_name: 'code_review'
  },
  metrics: {
    total_cost: 0.02474
  }
})
```

**Query costs per tenant:**
```sql
SELECT
  tenant_id,
  SUM(total_cost) as monthly_cost,
  COUNT(*) as executions,
  AVG(total_cost) as avg_cost_per_execution
FROM traces
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id
ORDER BY monthly_cost DESC
```

**Implementation Pattern: Hierarchical Multi-Tenancy**

LiteLLM's proven architecture for cost attribution ([source](https://docs.litellm.ai/docs/proxy/multi_tenant_architecture)):

```
Organization
  └─ Business Unit (e.g., Engineering)
      └─ Team (e.g., Backend Team)
          └─ User (e.g., john@acme.com)
              └─ Feature (e.g., code_review)
```

**Benefits:**
- ✅ Attribute costs at any level (org, team, user, feature)
- ✅ Budget limits per level
- ✅ Usage dashboards by hierarchy
- ✅ Scalable from 10 to 10,000+ users

**Sources:**
- [Multi-Tenant Architecture with LiteLLM](https://docs.litellm.ai/docs/proxy/multi_tenant_architecture)
- [Breaking Down AI Gateway Usage: Customer and User-Level Analytics](https://www.truefoundry.com/blog/breaking-down-llm-usage-customer-and-user-level-analytics)

---

### 5. Online Scoring and Alerts

**Online Scoring** is Braintrust's killer feature: evaluate production traffic with the same metrics you test in development.

#### Configuration Best Practices

**1. Sampling Rates by Scorer Cost**

```typescript
// High-volume, cheap scorers: 100% sampling
{
  name: 'latency_check',
  scorer: 'code',  // Fast, deterministic
  sample_rate: 1.0,
  threshold: { max_ms: 5000 }
}

// Expensive LLM scorers: 5-10% sampling
{
  name: 'hallucination_detection',
  scorer: 'llm',  // Slow, costs tokens
  sample_rate: 0.05,  // 5%
  threshold: { min_score: 0.7 }
}
```

**2. Scorer Types**

| Scorer Type | Use Case | Cost | Latency | Sampling Rate |
|-------------|----------|------|---------|---------------|
| **Code-based** | Latency, token counts, keyword matching | Free | <10ms | 100% |
| **LLM-based** | Hallucinations, tone, creativity | Token cost | 1-3s | 5-10% |
| **Hybrid** | Factual accuracy (code + LLM validation) | Partial | 100-500ms | 50% |

**3. Alert Configuration**

```typescript
{
  name: 'error_rate_spike',
  metric: 'error_rate',
  threshold: { max: 0.05 },  // 5%
  window: '5m',
  channels: ['slack', 'pagerduty']
}

{
  name: 'cost_anomaly',
  metric: 'avg_cost_per_execution',
  threshold: { max: 1.00 },  // $1.00
  window: '1h',
  channels: ['slack']
}

{
  name: 'quality_degradation',
  metric: 'hallucination_score',
  threshold: { min: 0.7 },
  window: '15m',
  channels: ['slack']
}
```

**Source:** [Scoring logs with online evaluations - Braintrust](https://www.braintrust.dev/docs/guides/logs/score)

#### Testing Before Deployment

Always **preview scoring rules** before enabling:

```typescript
// Test rule with historical data
const preview = await braintrust.previewScoringRule({
  rule: myRule,
  sample_size: 100  // Test on 100 recent traces
})

console.log(`Would have scored: ${preview.matches} traces`)
console.log(`Estimated cost: $${preview.estimated_cost}`)
console.log(`Average score: ${preview.avg_score}`)
```

**Source:** [Scoring logs with online evaluations - Braintrust](https://www.braintrust.dev/docs/guides/logs/score)

---

## Alternative & Complementary Tools

### 1. OpenTelemetry Patterns for Agents

**Why OpenTelemetry?**
- ✅ Vendor-neutral (switch backends without code changes)
- ✅ Industry standard (CNCF graduated project)
- ✅ Broad ecosystem support
- ✅ Future-proof

#### GenAI Semantic Conventions

OpenTelemetry v1.37+ defines **GenAI-specific attributes** ([source](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)):

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('claude-agent-sdk')

const span = tracer.startSpan('llm.chat', {
  attributes: {
    // GenAI semantic conventions
    'gen_ai.system': 'anthropic',
    'gen_ai.request.model': 'claude-sonnet-4.5',
    'gen_ai.request.max_tokens': 4096,
    'gen_ai.request.temperature': 1.0,
    'gen_ai.request.top_p': 0.95,

    // Usage metrics
    'gen_ai.usage.prompt_tokens': 1500,
    'gen_ai.usage.completion_tokens': 300,
    'gen_ai.usage.total_tokens': 1800,

    // Agent-specific
    'agent.tool_calls': 3,
    'agent.session_id': 'session_123',
    'agent.turn_number': 2
  }
})
```

**Benefits:**
- Same schema across all platforms (Braintrust, Langfuse, Datadog, SigNoz)
- No vendor lock-in
- Easy to migrate between observability backends

**Source:** [Datadog LLM Observability natively supports OpenTelemetry GenAI Semantic Conventions](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)

#### Auto-Instrumentation

Many frameworks now offer **automatic OpenTelemetry instrumentation**:

```typescript
// CrewAI example (Python)
from crewai import Agent, Task, Crew
from crewai.telemetry import setup_telemetry

setup_telemetry()  # Auto-instruments all agent operations

# All agent actions are now traced automatically
crew = Crew(agents=[...], tasks=[...])
crew.kickoff()  # Traces emitted to OTEL endpoint
```

**Supported Frameworks:**
- CrewAI (native)
- LangChain (via openllmetry)
- LangGraph (via openllmetry)
- Mastra (native)
- Anthropic SDK (via wrappers)

**Source:** [AI Agent Observability - Evolving Standards and Best Practices | OpenTelemetry](https://opentelemetry.io/blog/2025/ai-agent-observability/)

#### Integration with Braintrust

Braintrust provides **native OTLP endpoint**:

```bash
# Environment variables
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.braintrust.dev/otel
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer YOUR_API_KEY,x-bt-parent=project_id:YOUR_PROJECT_ID"
```

**Alternative: SDK-based integration**

```typescript
import { BraintrustSpanProcessor } from 'braintrust'
import { NodeSDK } from '@opentelemetry/sdk-node'

const sdk = new NodeSDK({
  spanProcessors: [new BraintrustSpanProcessor()]
})

sdk.start()
```

**Source:** [Using OpenTelemetry for LLM observability - Braintrust](https://www.braintrust.dev/docs/cookbook/recipes/OTEL-logging)

---

### 2. Complementary Tools by Use Case

| Tool | Best For | Integration Effort | Cost |
|------|----------|-------------------|------|
| **Langfuse** | Open-source observability, prompt management | Low (OTel native) | $0 (self-hosted) |
| **Arize Phoenix** | Embedding drift, RAG monitoring | Medium (Python lib) | $0 (self-hosted) |
| **SigNoz** | General APM + LLM metrics | Low (OTel native) | $0 (self-hosted) |
| **Datadog** | Enterprise APM with LLM support | Low (native agents) | $$$ (usage-based) |
| **Helicone** | Gateway-based monitoring (proxy) | Very low (URL change) | $ (cheap) |

#### Langfuse: Open-Source Alternative

**Strengths:**
- ✅ Fully open-source (MIT license)
- ✅ Self-hosted with unlimited retention
- ✅ Native Claude Agent SDK support
- ✅ Excellent prompt versioning
- ✅ Free cloud tier: 50k observations/month

**Integration:**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { observeAnthropic } from 'langfuse'

const client = observeAnthropic(new Anthropic(), {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY
})

// All calls automatically traced
const message = await client.messages.create({
  model: 'claude-sonnet-4.5',
  messages: [{ role: 'user', content: 'Hello' }]
})
```

**When to use:**
- Need unlimited data retention
- Want full infrastructure control
- Budget constraints ($0 vs $249/mo)
- Open-source requirement

**Source:** [Observability for Claude Agent SDK with Langfuse](https://langfuse.com/integrations/frameworks/claude-agent-sdk)

#### Arize Phoenix: Production Monitoring

**Strengths:**
- ✅ Excellent embedding drift detection
- ✅ RAG-specific monitoring (retrieval quality)
- ✅ Local-first workflow (runs in notebooks)
- ✅ Open-source (Apache 2.0)

**Best for:**
- Vector search quality monitoring
- Embedding model version comparison
- RAG pipeline debugging

**Source:** [Claude Code Observability and Tracing: Introducing Dev-Agent-Lens | Arize](https://arize.com/blog/claude-code-observability-and-tracing-introducing-dev-agent-lens/)

#### SigNoz: General APM

**Strengths:**
- ✅ Unified view: infrastructure + LLM metrics
- ✅ Native OpenTelemetry design
- ✅ Self-hosted with ClickHouse backend
- ✅ Traditional APM features (logs, metrics, traces)

**Best for:**
- Teams already using SigNoz for infrastructure
- Need correlation between system metrics and LLM performance
- Want single observability platform

**Source:** [LLM Observability in the Wild - Why OpenTelemetry should be the Standard | SigNoz](https://signoz.io/blog/llm-observability-opentelemetry/)

---

### 3. Platform Comparison Matrix

| Feature | Braintrust | Langfuse | Phoenix | SigNoz |
|---------|-----------|----------|---------|---------|
| **LLM-Specific Features** | Excellent | Excellent | Good | Limited |
| **Evaluation Tools** | Best-in-class | Good | Limited | None |
| **Prompt Management** | Playground | Versioning | No | No |
| **OpenTelemetry** | Native | Native | Native | Native |
| **Self-Hosting** | Enterprise only | Free (MIT) | Free (Apache 2.0) | Free (Apache 2.0) |
| **Data Retention (Free)** | 14 days | Unlimited (self-host) | Unlimited (self-host) | Unlimited (self-host) |
| **TypeScript SDK** | Excellent | Excellent | Limited | Good |
| **Claude SDK Support** | Native + bidirectional | Native | OTel only | OTel only |
| **Cost (Paid)** | $249/mo (Pro) | $59/mo (Cloud Pro) | N/A | Enterprise pricing |
| **Best For** | Evaluation + obs | Open-source control | RAG/embeddings | General APM |

**Sources:**
- [5 AI Observability Platforms Compared](https://www.getmaxim.ai/articles/5-ai-observability-platforms-compared-maxim-ai-arize-helicone-braintrust-langfuse/)
- [Braintrust Data Alternatives? The best LLMOps platform?](https://langfuse.com/faq/all/best-braintrustdata-alternatives)

---

## Production Monitoring Strategies

### 1. Essential Alerts Configuration

Based on production deployments, these alerts prevent 95% of outages:

#### Error Rate Alerts

```typescript
{
  name: 'critical_error_rate',
  metric: 'error_rate',
  threshold: { max: 0.05 },  // 5%
  window: '5m',
  severity: 'critical',
  channels: ['pagerduty', 'slack']
}

{
  name: 'timeout_rate',
  metric: 'timeout_rate',
  threshold: { max: 0.02 },  // 2%
  window: '10m',
  severity: 'warning',
  channels: ['slack']
}
```

**Why these thresholds?**
- Industry benchmark: < 5% error rate ([source](https://www.getmaxim.ai/articles/llm-observability-best-practices-for-2025))
- Timeout rate should be much lower (infrastructure issue indicator)

#### Latency Alerts

```typescript
{
  name: 'p95_latency_degradation',
  metric: 'latency_p95',
  threshold: { max: 5000 },  // 5 seconds
  window: '10m',
  severity: 'warning'
}

{
  name: 'ttft_degradation',
  metric: 'time_to_first_token_p95',
  threshold: { max: 500 },  // 500ms
  window: '5m',
  severity: 'critical'
}
```

**Rationale:** TTFT < 500ms is critical for conversational AI ([source](https://docs.anyscale.com/llm/serving/benchmarking/metrics))

#### Cost Alerts

```typescript
{
  name: 'cost_spike',
  metric: 'hourly_cost',
  threshold: { max: 100 },  // $100/hour
  window: '1h',
  comparison: '7d_avg',  // Compare to 7-day average
  deviation: 3.0,  // 3x higher than normal
  severity: 'critical'
}

{
  name: 'per_request_cost_anomaly',
  metric: 'avg_cost_per_request',
  threshold: { max: 1.0 },  // $1.00
  window: '15m',
  severity: 'warning'
}
```

**Why cost alerts matter:**
- Catch prompt injection attacks (infinite loops)
- Detect misconfigured agents
- Prevent budget overruns

#### Quality Alerts

```typescript
{
  name: 'hallucination_rate',
  metric: 'hallucination_score',
  threshold: { min: 0.7 },  // 70% factual accuracy
  window: '30m',
  sample_rate: 0.1,  // 10% (LLM-based scorer)
  severity: 'warning'
}

{
  name: 'task_success_rate',
  metric: 'task_completion_rate',
  threshold: { min: 0.90 },  // 90% success
  window: '1h',
  severity: 'critical'
}
```

**Industry benchmarks:**
- Task completion: ≥90% ([source](https://www.datarobot.com/blog/how-to-measure-agent-performance/))
- Goal accuracy: ≥85% ([source](https://research.aimultiple.com/agentic-monitoring/))

**Sources:**
- [LLM Observability: Best Practices for 2025](https://www.getmaxim.ai/articles/llm-observability-best-practices-for-2025/)
- [How to measure agent performance: Key metrics and AI insights](https://www.datarobot.com/blog/how-to-measure-agent-performance/)

---

### 2. Service Level Objectives (SLOs)

SLOs formalize performance standards for production systems.

#### Recommended SLOs for Agent Systems

```yaml
# Availability
- name: "Agent Availability"
  target: 99.5%  # 3.65 hours downtime/month
  measurement: successful_requests / total_requests
  window: 30d

# Latency
- name: "P95 Latency"
  target: < 5 seconds
  measurement: 95th percentile of execution_duration
  window: 7d

- name: "Time to First Token"
  target: < 500ms
  measurement: 95th percentile of ttft
  window: 1d

# Quality
- name: "Task Success Rate"
  target: > 90%
  measurement: successful_tasks / total_tasks
  window: 7d

- name: "Error Budget"
  target: < 5%
  measurement: error_rate
  window: 30d

# Cost
- name: "Cost per Conversation"
  target: < $0.50
  measurement: avg(total_cost) per session
  window: 30d
```

**Example SLO (Chatbot):**
> "Our chatbot will resolve 80% of user queries monthly without human intervention, with p95 latency under 3 seconds."

**Source:** [LLM Observability Tools: 2026 Comparison](https://lakefs.io/blog/llm-observability-tools/)

#### SLO-Based Alerting

Alerts should fire **before SLO violation**:

```typescript
// Error budget alert (50% consumed)
{
  name: 'error_budget_50pct',
  metric: 'error_budget_consumed',
  threshold: { max: 0.50 },
  window: '30d',
  message: 'Error budget 50% consumed. Investigate before SLO breach.'
}

// Latency SLO at risk
{
  name: 'latency_slo_risk',
  metric: 'latency_p95',
  threshold: { max: 4500 },  // 90% of 5s SLO
  window: '1h',
  message: 'P95 latency approaching SLO threshold (4.5s / 5.0s target)'
}
```

---

### 3. Debugging Production Issues

**The Three-Layer Approach:**

#### Layer 1: Metrics (What happened?)

```sql
-- Find spike in errors
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as total_requests,
  SUM(CASE WHEN error = true THEN 1 ELSE 0 END) as errors,
  AVG(duration_ms) as avg_latency
FROM traces
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY errors DESC
```

#### Layer 2: Traces (Why did it happen?)

1. **Identify failing trace IDs** from metrics
2. **Drill into trace details**:
   - What was the prompt?
   - Which tool calls were made?
   - Where did it fail?
   - What was the error message?

```typescript
// Braintrust provides trace URL in logs
console.error('Execution failed!')
console.error(`Trace URL: https://braintrust.dev/traces/${traceId}`)
```

#### Layer 3: Logs (How do we fix it?)

3. **Examine detailed logs**:
   - Sandbox stderr output
   - Tool execution logs
   - LLM API error responses

```typescript
const execution = await runPythonAgentDetailed({ prompt })

if (execution.exitCode !== 0) {
  console.error('STDOUT:', execution.stdout)
  console.error('STDERR:', execution.stderr)
  // STDERR often contains root cause
}
```

**Production Debugging Workflow:**

1. Alert fires → Check dashboard metrics
2. Identify affected time window
3. Query traces in that window
4. Drill into failing trace
5. Examine logs and error context
6. Reproduce locally with same prompt
7. Fix and deploy
8. Verify metrics return to normal

**Common Production Issues:**

| Issue | Metric Signal | Debugging Steps |
|-------|---------------|-----------------|
| **Prompt injection** | Cost spike, latency spike | Check prompt content, token counts |
| **Tool failure** | Error rate spike, tool_error category | Examine tool logs, stderr |
| **Timeout** | Timeout rate spike | Check sandbox duration, LLM latency |
| **Model degradation** | Quality score drop, hallucination rate up | Compare outputs before/after, check model version |
| **Rate limiting** | API error spike | Check API status, implement backoff |

**Sources:**
- [LLM Monitoring vs. Observability: Explore Differences | Galileo](https://galileo.ai/blog/llm-monitoring-vs-observability-understanding-the-key-differences)
- [The Blind Spot in AI Maturity: Why Observability Must Lead Your LLM Strategy](https://fortegrp.com/insights/the-blind-spot-in-ai-maturity-why-observability-must-lead-your-llm-strategy)

---

## Missing Observability Features

### 1. Common Blind Spots

Based on production deployments, these are **frequently missing** from basic observability setups:

#### Content Quality vs Operational Metrics

**The Problem:**
> "Traditional monitoring focuses on operational metrics like request rates and latency, but misses the content quality dimension entirely - your API might respond quickly with perfect uptime while generating complete nonsense."

**Source:** [LLM Monitoring vs. Observability | Galileo](https://galileo.ai/blog/llm-monitoring-vs-observability-understanding-the-key-differences)

**What's Missing:**
- Hallucination detection
- Factual accuracy scoring
- Semantic similarity to expected outputs
- Toxicity/bias detection
- Tone consistency

**How to Fix:**
- Implement LLM-based scorers (e.g., Braintrust online scoring)
- Use reference datasets for comparison
- Monitor user feedback signals (thumbs up/down)

#### Prompt-Completion Correlation

**The Problem:**
Disconnected logs make it impossible to correlate:
- Which prompt caused which output?
- What was the full conversation context?
- How did context evolve across turns?

**Source:** [Why connecting OTel traces with LLM logs is critical for agent workflows](https://portkey.ai/blog/otel-with-llm-observability-for-agents/)

**How to Fix:**
- Use hierarchical tracing (session → trace → span)
- Tag all events with session_id, trace_id, span_id
- Store full prompt + completion in trace metadata

#### Multi-Step Workflow Visibility

**The Problem:**
> "Each step in agent workflows carries latency, cost, and potential failure points - without connected observability, it's almost impossible to trace the lifecycle end-to-end."

**Source:** [Why connecting OTel traces with LLM logs is critical](https://portkey.ai/blog/otel-with-llm-observability-for-agents/)

**What's Missing:**
- Tool execution spans (Bash, Read, Write, Grep)
- Retrieval step spans (vector search, reranking)
- Inter-step latency tracking
- Failure cascade visibility

**How to Fix:**
```typescript
// Instrument every step
const toolSpan = parentSpan.startSpan('tool.bash')
toolSpan.setAttribute('tool.command', command)
const result = await executeBash(command)
toolSpan.setAttribute('tool.exit_code', result.exitCode)
toolSpan.end()
```

#### Black-Box Reasoning

**The Problem:**
Limited visibility into:
- **Why** did the agent choose this tool?
- **What** was the reasoning process?
- **How** did extended thinking contribute?

**Source:** [LLM Observability Explained | Splunk](https://www.splunk.com/en_us/blog/learn/llm-observability.html)

**How to Fix:**
- Log extended thinking output separately
- Track reasoning tokens as a metric
- Store tool selection rationale
- Capture agent's internal monologue (if available)

#### Development Phase Gap

**The Problem:**
> "Traditional tracking gets wired up only after production deployment, creating massive blind spots during development and testing phases, allowing issues that could be caught early to slip through to paying customers."

**Source:** [The Blind Spot in AI Maturity | Fortegrp](https://fortegrp.com/insights/the-blind-spot-in-ai-maturity-why-observability-must-lead-your-llm-strategy)

**How to Fix:**
- Enable observability in **development** from day one
- Use same tooling locally as in production
- Run evals in CI/CD pipeline
- Track metrics for every PR/branch

---

### 2. Critical Missing Data Points

**For Production Debugging:**

| Data Point | Why Critical | How to Capture |
|------------|--------------|----------------|
| **Full prompt (including system message)** | Context for reproduction | Store in span attributes |
| **Completion before post-processing** | Raw model output | Log before formatting/filtering |
| **Tool execution details** | Root cause of tool failures | Span per tool with input/output |
| **Cache hit rate** | Cost optimization signal | Track cached_tokens metric |
| **Reasoning token count** | Extended thinking usage | Separate metric from completion tokens |
| **User feedback** | Ground truth for quality | Explicit user ratings |
| **Session context size** | Memory bloat detection | Track total tokens across turns |
| **Retry attempts** | Hidden cost multiplier | Count API retries |

**For Cost Attribution:**

| Data Point | Why Critical | How to Capture |
|------------|--------------|----------------|
| **Tenant/user ID** | Multi-tenant cost tracking | Tag in span attributes |
| **Feature name** | Per-feature cost attribution | Tag in span attributes |
| **Cached vs fresh tokens** | Actual cost vs nominal | Separate metrics |
| **Infrastructure costs** | Total cost (not just LLM) | E2B duration × vCPU count |
| **Failed request costs** | Wasted spend | Track tokens for errors |

**For Quality Monitoring:**

| Data Point | Why Critical | How to Capture |
|------------|--------------|----------------|
| **Task completion status** | Success rate | Boolean metric per execution |
| **Tool selection accuracy** | Agent reliability | Compare selected vs expected tool |
| **Hallucination score** | Content quality | LLM-based scorer (sampled) |
| **Embedding drift** | Model version issues | Vector distance from baseline |
| **Perplexity** | Model confidence | Available from some APIs |

**Sources:**
- [LLM Observability: Fundamentals, Practices, and Tools | Neptune.ai](https://neptune.ai/blog/llm-observability)
- [A Comprehensive Guide to Observability in AI Agents | DEV Community](https://dev.to/kuldeep_paul/a-comprehensive-guide-to-observability-in-ai-agents-best-practices-4bd4)

---

### 3. Agent-Specific Metrics (Beyond Standard LLM Metrics)

Standard LLM observability tracks **latency, cost, tokens**. Agent systems require **additional metrics**:

#### Workflow Metrics

```typescript
{
  // Planning phase
  planning_duration_ms: 1250,
  planning_llm_calls: 2,

  // Execution phase
  tool_calls_total: 5,
  tool_calls_successful: 4,
  tool_calls_failed: 1,
  tool_selection_accuracy: 0.80,  // 4/5

  // Step-level
  steps_total: 8,
  steps_completed: 7,
  steps_skipped: 1,
  step_utility_score: 0.75,  // How useful was each step?

  // Multi-turn
  conversation_turns: 3,
  context_window_utilization: 0.65,  // 65% of max context

  // Final outcome
  task_success: true,
  task_completion_rate: 1.0
}
```

**Source:** [Agent Observability: The Definitive Guide | Maxim](https://www.getmaxim.ai/articles/agent-observability-the-definitive-guide-to-monitoring-evaluating-and-perfecting-production-grade-ai-agents/)

#### Retry & Error Patterns

```typescript
{
  // Retries (hidden cost multiplier)
  retry_count: 2,
  retry_reason: ['rate_limit', 'timeout'],
  retry_cost_multiplier: 3.0,  // 3x normal cost due to retries

  // Error classification
  error_type: 'tool_error',
  error_category: 'permission_denied',
  error_recoverable: true,

  // Timeout analysis
  timeout_occurred: false,
  time_remaining_ms: 45000  // 45s of 120s timeout
}
```

**Why retry tracking matters:**
> "Retry rates: Track failed requests and automatic retries that silently multiply costs without delivering additional value."

**Source:** [rekap - Agent Observability: Beyond Latency](https://www.rekap.com/blogs/agent-observability-beyond-latency)

#### Context Management

```typescript
{
  // Context size tracking
  context_tokens_current: 12500,
  context_tokens_max: 20000,
  context_utilization: 0.625,

  // Bloat detection
  context_growth_per_turn: 2500,
  context_pruning_occurred: false,

  // Memory efficiency
  cache_hits: 8,
  cache_misses: 2,
  cache_hit_rate: 0.80,
  tokens_saved_by_caching: 10000
}
```

**Why context tracking matters:**
> "Context window size: Monitor how much context your agents carry between turns, identifying bloat that multiplies token costs unnecessarily."

**Source:** [AI Cost Observability for LLM and Agent Workloads](https://www.truefoundry.com/blog/ai-cost-observability)

#### Decision Path Analysis

```typescript
{
  // Reasoning process
  decision_tree_depth: 4,
  decision_points: 7,
  backtracking_occurred: true,
  backtracking_count: 2,

  // Tool selection
  tools_considered: ['bash', 'read', 'grep', 'write'],
  tool_selected: 'grep',
  tool_selection_confidence: 0.85,
  tool_selection_rationale: 'Search codebase for pattern',

  // Extended thinking
  extended_thinking_used: true,
  reasoning_tokens: 5000,
  reasoning_duration_ms: 8500
}
```

**Source:** [15 AI Agent Observability Tools | AI Multiple](https://research.aimultiple.com/agentic-monitoring/)

---

## Recommended Production Stack

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   PRODUCTION STACK                           │
├─────────────────────────────────────────────────────────────┤
│ Hosting:          Railway (container-based)                  │
│ Agent Runtime:    E2B Sandboxes (isolated execution)         │
│ Orchestration:    TypeScript SDK (claude-agent-sdk)          │
│ Session Storage:  Turso (edge SQLite with vector search)     │
│ Observability:    Braintrust (evaluation) + Langfuse (logs)  │
│ Telemetry:        OpenTelemetry (standard instrumentation)   │
│ API Framework:    Next.js 15 (App Router + Server Actions)   │
└─────────────────────────────────────────────────────────────┘
```

### Why This Stack?

**1. Dual Observability: Braintrust + Langfuse**

Use **both platforms** for complementary strengths:

| Platform | Use Case | Cost | Retention |
|----------|----------|------|-----------|
| **Braintrust** | Evaluation, online scoring, prompt playground | $249/mo Pro | 1 month |
| **Langfuse** | Long-term storage, debugging, cost analysis | $0 (self-hosted) | Unlimited |

**Integration Pattern:**

```typescript
import { init as initBraintrust } from 'braintrust'
import { observeAnthropic } from 'langfuse'
import Anthropic from '@anthropic-ai/sdk'

// Langfuse for all traces (unlimited retention)
const client = observeAnthropic(new Anthropic(), {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY
})

// Braintrust for evaluation (sampled 10%)
const bt = initBraintrust({
  apiKey: process.env.BRAINTRUST_API_KEY,
  projectName: 'claude-agent-sdk'
})

if (Math.random() < 0.10) {  // 10% sampling for Braintrust
  await bt.traced(async (span) => {
    const result = await client.messages.create({...})
    span.log({ result })
  })
} else {
  // Langfuse still captures everything
  await client.messages.create({...})
}
```

**Benefits:**
- ✅ Best-in-class evaluation (Braintrust)
- ✅ Unlimited historical data (Langfuse)
- ✅ Cost optimization (sample expensive evals)
- ✅ No vendor lock-in (OpenTelemetry underneath)

**2. OpenTelemetry Foundation**

All instrumentation uses **OpenTelemetry**:

```typescript
import { trace } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BraintrustSpanProcessor } from 'braintrust'
import { LangfuseExporter } from 'langfuse'

const sdk = new NodeSDK({
  spanProcessors: [
    new BraintrustSpanProcessor(),  // Evaluation
    new LangfuseExporter()          // Storage
  ]
})

sdk.start()
```

**Why OpenTelemetry?**
- ✅ Switch backends without code changes
- ✅ Industry standard (CNCF graduated)
- ✅ Broad ecosystem support
- ✅ GenAI semantic conventions (v1.37+)

**3. Turso for Session Storage**

**Why NOT use Braintrust/Langfuse for session storage?**

Both are **observability platforms**, not session stores:
- Optimized for **trace queries**, not session CRUD
- No session APIs (get/update/delete)
- Not designed for runtime state

**Turso Advantages:**

```typescript
// Session storage with Turso
import { createClient } from '@libsql/client'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})

// Save conversation turn
await turso.execute({
  sql: `INSERT INTO messages (session_id, role, content, created_at)
        VALUES (?, ?, ?, datetime('now'))`,
  args: [sessionId, 'user', message]
})

// Get session history
const history = await turso.execute({
  sql: `SELECT role, content FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC`,
  args: [sessionId]
})

// Vector search over history (RAG)
const similar = await turso.execute({
  sql: `SELECT content,
               vector_distance_cos(embedding, vector(?)) as distance
        FROM messages
        WHERE session_id = ?
        ORDER BY distance ASC
        LIMIT ?`,
  args: [queryEmbedding, sessionId, 5]
})
```

**Turso Features:**
- ✅ Edge-native (< 10ms latency from local replicas)
- ✅ Built-in vector search
- ✅ Multi-tenancy (separate DB per user)
- ✅ Cost: $5/mo for 25M queries

**Sources:**
- [Building AI Agents That Remember with Mastra and Turso](https://turso.tech/blog/building-ai-agents-that-remember-with-mastra-and-turso-vector)
- [Agent Databases - Turso](https://docs.turso.tech/guides/agent-databases)

---

### Cost Breakdown (Monthly)

| Component | Free Tier | Production Cost |
|-----------|-----------|-----------------|
| **Railway** | $5 credit | $20-50/mo |
| **E2B** | 100k sandbox seconds | $29/mo (1M seconds) |
| **Turso** | 9GB storage, 500 DBs | $5/mo (25M queries) |
| **Braintrust** | 14 days, 1M spans | $249/mo (Pro) |
| **Langfuse** | Self-hosted (free) | $0 (Railway hosting) |
| **Claude API** | N/A | $50-500/mo (usage) |
| **Total** | ~$5/mo | **$353-833/mo** |

**Cost Optimization:**

```typescript
// Reduce Braintrust to evaluation only (10% sampling)
const BRAINTRUST_SAMPLE_RATE = 0.10

// Store everything in Langfuse (unlimited, $0)
// Use Braintrust for:
// - Online scoring (quality checks)
// - Prompt playground (development)
// - Evaluation experiments

// Result: Best of both worlds at $249/mo (not $498/mo for both)
```

---

## Implementation Guide

### Phase 1: Basic Observability (Week 1)

**Goal:** Track executions, costs, errors

**Steps:**

1. **Install dependencies**

```bash
npm install braintrust @opentelemetry/api @opentelemetry/sdk-node
```

2. **Configure environment variables**

```bash
# .env
BRAINTRUST_API_KEY=bt_...
BRAINTRUST_PROJECT_NAME=claude-agent-sdk
BRAINTRUST_SAMPLE_RATE=1.0  # 100% during development
```

3. **Instrument agent execution**

```typescript
// lib/observability.ts
import { init } from 'braintrust'

export const braintrust = init({
  apiKey: process.env.BRAINTRUST_API_KEY,
  projectName: process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
})

// lib/agent.ts
import { braintrust } from './observability'

export async function runPythonAgent({ prompt }: AgentConfig) {
  return braintrust.traced(async (span) => {
    span.log({ input: { prompt } })

    const result = await executeSandbox(prompt)

    span.log({
      output: { result },
      metrics: {
        duration_ms: result.duration,
        total_cost: result.cost
      }
    })

    return result
  })
}
```

4. **Verify in dashboard**

Visit https://braintrust.dev/dashboard → Your project → Traces

**Success Criteria:**
- ✅ All executions appear in Braintrust
- ✅ Cost metrics are captured
- ✅ Errors are logged with trace URLs

---

### Phase 2: Advanced Metrics (Week 2)

**Goal:** Add tool tracking, TTFT, quality metrics

**Steps:**

1. **Instrument streaming events**

```typescript
export async function runPythonAgentStreaming({ prompt, onStream }: Config) {
  return braintrust.traced(async (span) => {
    const startTime = Date.now()
    let firstTokenTime: number | null = null
    const toolCalls: any[] = []

    span.log({ input: { prompt } })

    const result = await executeSandbox({
      prompt,
      onStream: {
        onText: (text) => {
          if (!firstTokenTime) {
            firstTokenTime = Date.now() - startTime
            span.log({ metrics: { ttft_ms: firstTokenTime } })
          }
          onStream.onText?.(text)
        },
        onToolUse: (id, name, input) => {
          toolCalls.push({ id, name, input, timestamp: Date.now() })
          span.addEvent('tool.use', { tool: name, input })
          onStream.onToolUse?.(id, name, input)
        },
        onToolResult: (id, content) => {
          span.addEvent('tool.result', { tool_id: id, success: !content.error })
        }
      }
    })

    span.log({
      metrics: {
        tool_calls_total: toolCalls.length,
        ttft_ms: firstTokenTime
      }
    })

    return result
  })
}
```

2. **Add online scoring**

Configure in Braintrust dashboard:

```typescript
// Latency check (100% sampling, code-based)
{
  name: 'latency_check',
  scorer: 'code',
  sample_rate: 1.0,
  threshold: { max_ms: 5000 }
}

// Quality check (10% sampling, LLM-based)
{
  name: 'hallucination_detection',
  scorer: 'llm',
  sample_rate: 0.10,
  threshold: { min_score: 0.7 }
}
```

**Success Criteria:**
- ✅ TTFT tracked for streaming executions
- ✅ Tool calls visible in trace timeline
- ✅ Online scoring rules active

---

### Phase 3: Multi-Turn Sessions (Week 3)

**Goal:** Session-level traces with conversation history

**Steps:**

1. **Create session manager**

```typescript
// lib/sessions.ts
import { braintrust } from './observability'
import { createClient } from '@libsql/client'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})

export async function createSession(userId: string) {
  const sessionId = `session_${Date.now()}_${userId}`

  // Create session-level span
  const sessionSpan = braintrust.startSpan({
    name: 'conversation_session',
    attributes: { session_id: sessionId, user_id: userId }
  })

  return { sessionId, sessionSpan }
}

export async function executeTurn(
  sessionId: string,
  sessionSpan: any,
  prompt: string
) {
  // Get conversation history from Turso
  const history = await turso.execute({
    sql: `SELECT role, content FROM messages
          WHERE session_id = ?
          ORDER BY created_at ASC`,
    args: [sessionId]
  })

  // Execute with context
  const turnSpan = sessionSpan.startSpan({ name: 'turn' })
  turnSpan.log({ input: { prompt, history_length: history.rows.length } })

  const result = await runPythonAgent({ prompt, history })

  turnSpan.log({ output: { result } })
  turnSpan.end()

  // Save to session storage
  await turso.execute({
    sql: `INSERT INTO messages (session_id, role, content, created_at)
          VALUES (?, ?, ?, datetime('now'))`,
    args: [sessionId, 'user', prompt]
  })
  await turso.execute({
    sql: `INSERT INTO messages (session_id, role, content, created_at)
          VALUES (?, ?, ?, datetime('now'))`,
    args: [sessionId, 'assistant', result]
  })

  return result
}

export async function endSession(sessionSpan: any) {
  sessionSpan.end()
  await braintrust.flush()
}
```

2. **Use in API route**

```typescript
// app/api/chat/route.ts
import { createSession, executeTurn, endSession } from '@/lib/sessions'

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json()

  let session
  if (!sessionId) {
    session = await createSession(userId)
  }

  const result = await executeTurn(
    session.sessionId,
    session.sessionSpan,
    messages[messages.length - 1].content
  )

  return Response.json({ result, sessionId: session.sessionId })
}
```

**Success Criteria:**
- ✅ Multi-turn conversations traced hierarchically
- ✅ Session history stored in Turso
- ✅ Braintrust shows session-level aggregates

---

### Phase 4: Production Hardening (Week 4)

**Goal:** Alerts, sampling, cost optimization

**Steps:**

1. **Enable sampling**

```bash
# .env.production
BRAINTRUST_SAMPLE_RATE=0.05  # 5% in production
```

```typescript
// Always trace errors, even when sampled
if (result.error || Math.random() < BRAINTRUST_SAMPLE_RATE) {
  await braintrust.traced(async (span) => {
    // Log trace
  })
}
```

2. **Configure alerts**

In Braintrust dashboard:

```yaml
- name: Critical Error Rate
  metric: error_rate
  threshold: 0.05
  window: 5m
  channels: [pagerduty, slack]

- name: Cost Spike
  metric: hourly_cost
  threshold: 100
  comparison: 7d_avg
  deviation: 3.0
  channels: [slack]

- name: Task Success Rate
  metric: task_completion_rate
  threshold: 0.90
  window: 1h
  channels: [slack]
```

3. **Add Langfuse for unlimited storage**

```typescript
import { observeAnthropic } from 'langfuse'

const client = observeAnthropic(new Anthropic(), {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY
})

// All calls logged to Langfuse (unlimited retention)
// + sampled to Braintrust (evaluation)
```

**Success Criteria:**
- ✅ Alerts fire on production issues
- ✅ Sampling reduces observability costs
- ✅ Langfuse stores all historical traces
- ✅ Braintrust provides evaluation insights

---

## Cost Analysis

### Observability Platform Costs

| Platform | Free Tier | Paid Tier | Annual Cost |
|----------|-----------|-----------|-------------|
| **Braintrust** | 14 days, 1M spans | $249/mo (Pro) | $2,988/year |
| **Langfuse Cloud** | 50k obs/mo | $59/mo (Pro) | $708/year |
| **Langfuse Self-Hosted** | Unlimited | $0 + hosting | $240/year (Railway) |
| **Arize Phoenix** | Unlimited (self-host) | Enterprise | $0 |
| **SigNoz** | Unlimited (self-host) | Usage-based | $0-500/year |

### Total Production Stack Cost

**Base Infrastructure:**
- Railway: $30/mo ($360/year)
- E2B: $29/mo ($348/year)
- Turso: $5/mo ($60/year)
- **Subtotal: $768/year**

**Observability Options:**

| Option | Cost/Year | Features |
|--------|-----------|----------|
| **Braintrust only** | $2,988 | Best evaluation, 1-month retention |
| **Langfuse only (cloud)** | $708 | Unlimited retention, basic evals |
| **Langfuse only (self-host)** | $240 | Unlimited retention, full control |
| **Braintrust + Langfuse (self-host)** | $3,228 | Best of both worlds |

**Recommended: Braintrust + Langfuse Self-Hosted**

Total: **$3,996/year** ($333/mo)

**What you get:**
- ✅ Best-in-class evaluation (Braintrust)
- ✅ Unlimited trace retention (Langfuse)
- ✅ Full infrastructure control
- ✅ No data export limitations
- ✅ Vendor neutrality (OpenTelemetry)

### ROI Justification

**Cost Savings from Observability:**

> "Organizations routinely reduce LLM operational costs by 30-60% after implementing comprehensive observability, without sacrificing output quality."

**Source:** [LLM Observability: Best Practices for 2025](https://www.getmaxim.ai/articles/llm-observability-best-practices-for-2025/)

**Example (1M requests/month):**

Without observability:
- Avg cost per request: $0.05
- Total: $50,000/mo

With observability (30% reduction):
- Detected issues: prompt bloat, unnecessary retries, cache misses
- Optimized cost: $0.035/request
- Total: $35,000/mo
- **Savings: $15,000/mo**

**Break-even:** Observability cost ($333/mo) recovered in < 1 week

---

## Sources

### Braintrust
- [7 best AI observability platforms for LLMs in 2025](https://www.braintrust.dev/articles/best-ai-observability-platforms-2025)
- [Top 10 LLM observability tools: Complete guide for 2025](https://www.braintrust.dev/articles/top-10-llm-observability-tools-2025)
- [The three pillars of AI observability](https://www.braintrust.dev/blog/three-pillars-ai-observability)
- [Tracing - Braintrust](https://www.braintrust.dev/docs/guides/traces)
- [Evaluating agents with trace-driven insights](https://medium.com/@braintrustdata/evaluating-agents-with-trace-driven-insights-9ad3bfed820e)
- [Scoring logs with online evaluations](https://www.braintrust.dev/docs/guides/logs/score)
- [Using OpenTelemetry for LLM observability](https://www.braintrust.dev/docs/cookbook/recipes/OTEL-logging)

### OpenTelemetry & Standards
- [An Introduction to Observability for LLM-based applications using OpenTelemetry](https://opentelemetry.io/blog/2024/llm-observability/)
- [AI Agent Observability - Evolving Standards and Best Practices](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Datadog LLM Observability natively supports OpenTelemetry GenAI Semantic Conventions](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [LLM Observability in the Wild - Why OpenTelemetry should be the Standard](https://signoz.io/blog/llm-observability-opentelemetry/)

### Production Monitoring
- [LLM Observability Guide: Monitor, Debug & Optimize Real-Time](https://futureagi.com/blogs/llm-observability-monitoring-2025)
- [LLM Observability: Best Practices for 2025](https://www.getmaxim.ai/articles/llm-observability-best-practices-for-2025/)
- [The Blind Spot in AI Maturity: Why Observability Must Lead Your LLM Strategy](https://fortegrp.com/insights/the-blind-spot-in-ai-maturity-why-observability-must-lead-your-llm-strategy)
- [Why connecting OTel traces with LLM logs is critical for agent workflows](https://portkey.ai/blog/otel-with-llm-observability-for-agents/)

### Metrics & Performance
- [Understand LLM latency and throughput metrics | Anyscale](https://docs.anyscale.com/llm/serving/benchmarking/metrics)
- [Practical Guide to LLM Inference in Production (2025)](https://compute.hivenet.com/post/llm-inference-production-guide)
- [LLM Observability: Tutorial & Best Practices](https://www.patronus.ai/llm-testing/llm-observability)
- [LLM Monitoring and Observability | Medium](https://dganais.medium.com/llm-monitoring-and-observability-a1e3c8565795)

### Agent Observability
- [15 AI Agent Observability Tools: AgentOps, Langfuse & Arize](https://research.aimultiple.com/agentic-monitoring/)
- [How to measure agent performance: Key metrics and AI insights](https://www.datarobot.com/blog/how-to-measure-agent-performance/)
- [AI Agent Observability: The Ultimate Guide](https://ubiai.tools/ai-agent-observability-the-ultimate-guide-to-tracking-testing-and-tuning-agent-behavior/)
- [Agent Observability: The Definitive Guide](https://www.getmaxim.ai/articles/agent-observability-the-definitive-guide-to-monitoring-evaluating-and-perfecting-production-grade-ai-agents/)
- [rekap - Agent Observability: Beyond Latency](https://www.rekap.com/blogs/agent-observability-beyond-latency)

### Cost Attribution
- [LLM cost attribution: Tracking and optimizing spend for GenAI apps](https://portkey.ai/blog/llm-cost-attribution-for-genai-apps/)
- [Breaking Down AI Gateway Usage: Customer and User-Level Analytics](https://www.truefoundry.com/blog/breaking-down-llm-usage-customer-and-user-level-analytics)
- [Multi-Tenant Architecture with LiteLLM](https://docs.litellm.ai/docs/proxy/multi_tenant_architecture)
- [AI Cost Observability for LLM and Agent Workloads](https://www.truefoundry.com/blog/ai-cost-observability)

### Platform Comparisons
- [5 AI Observability Platforms Compared](https://www.getmaxim.ai/articles/5-ai-observability-platforms-compared-maxim-ai-arize-helicone-braintrust-langfuse/)
- [Braintrust Data Alternatives? The best LLMOps platform?](https://langfuse.com/faq/all/best-braintrustdata-alternatives)
- [LLM Observability Tools: 2026 Comparison](https://lakefs.io/blog/llm-observability-tools/)
- [Best LLM Observability Tools in 2025](https://www.firecrawl.dev/blog/best-llm-observability-tools)

### Session Storage
- [Building AI Agents That Remember with Mastra and Turso](https://turso.tech/blog/building-ai-agents-that-remember-with-mastra-and-turso-vector)
- [Agent Databases - Turso](https://docs.turso.tech/guides/agent-databases)

---

**Document Version:** 1.0
**Last Updated:** 2026-01-05
**Research Status:** Complete
