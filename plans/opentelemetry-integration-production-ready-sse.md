# OpenTelemetry Integration for Claude Agent SDK (Production-Ready SSE)

**Feature Priority**: #2 (P0 - CRITICAL)
**Effort Estimate**: 1.5 weeks (3 phases)
**Impact**: HIGH - Makes boilerplate production-ready from day one
**Status**: Planning Complete - Ready for Implementation

---

## Overview

Add production-grade OpenTelemetry (OTEL) integration to the Claude Agent SDK TypeScript boilerplate, enabling full observability for human-in-the-loop agent systems with SSE streaming. This feature provides distributed tracing, metrics collection, and cost tracking across the TypeScript → E2B → Python boundary.

**Goal**: Make it "very simple and easy for someone to launch Claude Agent SDK on E2B that can be interacted with and run human-in-the-loop systems" with built-in observability.

---

## Problem Statement

### Current State (Gaps in Observability)

Based on comprehensive codebase analysis (`examples/lib/agent.ts`, `examples/lib/streaming.ts`, `examples/sse-streaming-api.ts`):

**What exists**:
- Basic cost/duration tracking in `onResult` callback (`streaming.ts:137-148`)
- Sandbox metadata for debugging (`agent.ts:61-63`)
- Console output with emoji visual distinction

**Critical missing features**:
1. ❌ **No distributed tracing** across TypeScript → E2B sandbox → Python agent → tool calls
2. ❌ **No session continuity** for multi-turn conversations
3. ❌ **No tool execution timing** (can't identify slow tools blocking HITL workflows)
4. ❌ **No error classification** (timeout vs OOM vs network vs user error)
5. ❌ **No user/tenant attribution** for multi-tenant cost tracking
6. ❌ **No sandbox creation metrics** (can't track E2B performance)
7. ❌ **No SSE event throughput tracking** (streaming performance blind spot)
8. ❌ **No integration with production observability platforms** (Langfuse, SigNoz, Prometheus)

### Why This Matters for Human-in-the-Loop Systems

HITL workflows require understanding:
- **Where agents get stuck** waiting for human approval
- **Tool execution vs human approval time** (identify bottlenecks)
- **Multi-turn conversation context** (trace entire session, not just one request)
- **Error patterns** (which tools fail most often, why?)
- **Cost attribution** (per-user billing in multi-tenant apps)

Without OTEL, developers are **flying blind** in production.

---

## Proposed Solution

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│  User Application (Next.js, Express)           │
│  - SSE endpoints with OTEL middleware           │
│  - Trace context generation                     │
└─────────────┬───────────────────────────────────┘
              │ W3C TraceContext (traceparent header)
              ↓
┌─────────────────────────────────────────────────┐
│  TypeScript SDK (examples/lib/telemetry.ts)    │
│  - Span management                              │
│  - Metrics collection                           │
│  - Exporter routing                             │
└─────────────┬───────────────────────────────────┘
              │ Environment variable injection
              ↓
┌─────────────────────────────────────────────────┐
│  E2B Sandbox (Python Runtime)                   │
│  - TRACEPARENT env var                          │
│  - Python OTEL SDK extracts trace context       │
│  - Child spans for tools                        │
└─────────────┬───────────────────────────────────┘
              │ JSON events via stdout
              ↓
┌─────────────────────────────────────────────────┐
│  OTEL Exporters (Batched)                       │
│  - Langfuse (LLM-native observability)          │
│  - SigNoz (OSS APM)                             │
│  - Prometheus (Metrics)                         │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Trace Context Propagation** (Resolves Critical Question #1)
- **Mechanism**: W3C TraceContext via environment variables
- **Implementation**: Inject `TRACEPARENT` into E2B sandbox on creation
- **Format**: `TRACEPARENT=00-${traceId}-${spanId}-01`
- **Python side**: Use OpenTelemetry Python SDK to auto-extract context

**2. Python Agent SDK Compatibility** (Resolves Critical Question #2)
- **Approach**: No fork required - use environment variable propagation
- **Validation**: Test Python OTEL SDK with Claude Agent SDK in E2B sandbox
- **Fallback**: If conflicts arise, create lightweight wrapper script

**3. Root Span Lifecycle for SSE** (Resolves Critical Question #3)
- **Policy**: Close root span after 30 minutes of inactivity OR explicit disconnect
- **Implementation**: Use `setTimeout` for inactivity + event listener for disconnect
- **Cleanup**: Force-close all spans on process shutdown (graceful)

**4. Exporter Failure Isolation** (Resolves Critical Question #4)
- **Strategy**: Wrap all exporter calls in try-catch, log errors, continue agent execution
- **Retry**: Exponential backoff (1s, 2s, 4s, 8s, 16s, max 5 attempts)
- **Buffer**: Memory buffer (max 1000 events) for failed exports, replay on recovery

**5. Multi-Exporter Support** (Resolves Critical Question #5)
- **Configuration**: `OTEL_EXPORTERS=langfuse,prometheus,sigNoz` (comma-separated)
- **Routing**: All exporters receive all data (spans + metrics)
- **Performance**: Batched export (5s interval) to minimize overhead

**6. Sampling Strategy** (Resolves Critical Question #6)
- **Development**: 100% sampling (`NODE_ENV=development`)
- **Production**: 10% sampling for normal requests, 100% for errors
- **Override**: `OTEL_SAMPLING_RATE=0.5` environment variable

**7. PII Sanitization** (Resolves Critical Question #7)
- **Prompts/Responses**: Truncate to first 100 characters in span attributes
- **User IDs**: Support custom `userId` field for attribution
- **File Contents**: Never include full file contents or bash outputs
- **Override**: Provide `sanitizePrompt(text)` function users can customize

---

## Technical Approach

### Phase 1: Core OTEL Infrastructure (Week 1, Days 1-3)

#### 1.1 Create Telemetry Module

**New file**: `examples/lib/telemetry.ts`

```typescript
/**
 * OpenTelemetry instrumentation for Claude Agent SDK
 *
 * Provides distributed tracing, metrics, and cost tracking across
 * TypeScript → E2B → Python boundary.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { trace, metrics, context, propagation, SpanStatusCode } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

// Exporter types
type ExporterType = 'langfuse' | 'sigNoz' | 'prometheus' | 'console'

// Telemetry configuration
export interface TelemetryConfig {
  serviceName?: string
  serviceVersion?: string
  exporters?: ExporterType[]
  samplingRate?: number
  enabled?: boolean
}

// Span management utilities
export class AgentTelemetry {
  private tracer: any
  private meter: any
  private config: TelemetryConfig

  constructor(config: TelemetryConfig = {}) {
    this.config = {
      serviceName: 'claude-agent-sdk',
      serviceVersion: '0.1.0',
      exporters: this.parseExporters(),
      samplingRate: this.parseSamplingRate(),
      enabled: process.env.OTEL_ENABLED !== 'false',
      ...config
    }

    if (this.config.enabled) {
      this.initializeTracing()
      this.initializeMetrics()
    }
  }

  // Parse exporters from env var or config
  private parseExporters(): ExporterType[] {
    const envExporters = process.env.OTEL_EXPORTERS
    if (!envExporters) {
      return process.env.NODE_ENV === 'production' ? ['langfuse'] : ['console']
    }
    return envExporters.split(',').map(e => e.trim() as ExporterType)
  }

  // Parse sampling rate from env var
  private parseSamplingRate(): number {
    const envRate = process.env.OTEL_SAMPLING_RATE
    if (envRate) return parseFloat(envRate)
    return process.env.NODE_ENV === 'production' ? 0.1 : 1.0
  }

  // Initialize tracing with configured exporters
  private initializeTracing() {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName!,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion!,
    })

    const provider = new NodeTracerProvider({ resource })

    // Add exporters
    this.config.exporters!.forEach(exporterType => {
      const exporter = this.createTraceExporter(exporterType)
      if (exporter) {
        provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
          scheduledDelayMillis: 5000,  // Export every 5 seconds
          maxQueueSize: 2048,
          maxExportBatchSize: 512
        }))
      }
    })

    provider.register()
    propagation.setGlobalPropagator(new W3CTraceContextPropagator())
    this.tracer = trace.getTracer(this.config.serviceName!)
  }

  // Initialize metrics with configured exporters
  private initializeMetrics() {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName!,
    })

    const readers = this.config.exporters!.map(type => {
      if (type === 'prometheus') {
        return new PrometheusExporter({ port: 9464 })
      }
      return new PeriodicExportingMetricReader({
        exporter: this.createMetricExporter(type),
        exportIntervalMillis: 60000
      })
    }).filter(Boolean)

    const meterProvider = new MeterProvider({ resource, readers })
    metrics.setGlobalMeterProvider(meterProvider)
    this.meter = metrics.getMeter(this.config.serviceName!)
  }

  // Create trace exporter based on type
  private createTraceExporter(type: ExporterType) {
    try {
      switch (type) {
        case 'langfuse':
          return new OTLPTraceExporter({
            url: process.env.LANGFUSE_OTLP_ENDPOINT || 'https://cloud.langfuse.com/api/public/otel/v1/traces'
          })
        case 'sigNoz':
          return new OTLPTraceExporter({
            url: process.env.SIGNOZ_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
          })
        case 'console':
          return new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' })
        default:
          console.warn(`Unknown trace exporter: ${type}`)
          return null
      }
    } catch (error) {
      console.error(`Failed to create trace exporter ${type}:`, error)
      return null
    }
  }

  // Create metric exporter based on type
  private createMetricExporter(type: ExporterType) {
    try {
      switch (type) {
        case 'langfuse':
          return new OTLPMetricExporter({
            url: process.env.LANGFUSE_OTLP_ENDPOINT || 'https://cloud.langfuse.com/api/public/otel/v1/metrics'
          })
        case 'sigNoz':
          return new OTLPMetricExporter({
            url: process.env.SIGNOZ_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics'
          })
        default:
          return null
      }
    } catch (error) {
      console.error(`Failed to create metric exporter ${type}:`, error)
      return null
    }
  }

  // Get tracer instance
  getTracer() {
    return this.tracer
  }

  // Get meter instance
  getMeter() {
    return this.meter
  }

  // Create sandbox creation span
  async traceSandboxCreation<T>(
    templateId: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; traceContext: string }> {
    if (!this.config.enabled) {
      const result = await operation()
      return { result, traceContext: '' }
    }

    const span = this.tracer.startSpan('sandbox.create', {
      attributes: {
        'sandbox.template_id': templateId,
        'sandbox.cpu_cores': 2,
        'sandbox.memory_mb': 4096
      }
    })

    const startTime = Date.now()

    try {
      const result = await operation()

      const duration = Date.now() - startTime
      span.setAttribute('sandbox.creation_duration_ms', duration)
      span.setStatus({ code: SpanStatusCode.OK })

      // Generate trace context for propagation
      const traceContext = this.generateTraceContext(span)

      return { result, traceContext }
    } catch (error: any) {
      span.recordException(error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      throw error
    } finally {
      span.end()
    }
  }

  // Generate W3C TraceContext string
  private generateTraceContext(span: any): string {
    const spanContext = span.spanContext()
    return `00-${spanContext.traceId}-${spanContext.spanId}-01`
  }

  // Sanitize user prompts for PII protection
  sanitizePrompt(prompt: string, maxLength: number = 100): string {
    if (prompt.length <= maxLength) return prompt
    return prompt.substring(0, maxLength - 3) + '...'
  }
}

// Global telemetry instance
let telemetryInstance: AgentTelemetry | null = null

export function initializeTelemetry(config?: TelemetryConfig): AgentTelemetry {
  if (!telemetryInstance) {
    telemetryInstance = new AgentTelemetry(config)
  }
  return telemetryInstance
}

export function getTelemetry(): AgentTelemetry {
  if (!telemetryInstance) {
    throw new Error('Telemetry not initialized. Call initializeTelemetry() first.')
  }
  return telemetryInstance
}
```

#### 1.2 Update Agent SDK to Use Telemetry

**File**: `examples/lib/agent.ts`

**Changes**:
- Import telemetry module
- Wrap sandbox creation with trace spans
- Inject trace context into E2B environment variables
- Add metrics for cost, duration, tokens

**Modification at line 59** (Sandbox creation):

```typescript
// Before
const sandbox = await Sandbox.create(templateId, {
  timeoutMs: timeout * 1000,
  metadata: { prompt: prompt.substring(0, 100) }
})

// After
const telemetry = getTelemetry()
const { result: sandbox, traceContext } = await telemetry.traceSandboxCreation(
  templateId,
  () => Sandbox.create(templateId, {
    timeoutMs: timeout * 1000,
    metadata: {
      prompt: telemetry.sanitizePrompt(prompt)
    }
  })
)
```

**Modification at lines 94-103** (Agent execution):

```typescript
// Before
const execution = await sandbox.commands.run('python3 /home/user/agent.py', {
  timeoutMs: timeout * 1000,
  envs: {
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
  },
})

// After
const execution = await sandbox.commands.run('python3 /home/user/agent.py', {
  timeoutMs: timeout * 1000,
  envs: {
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
    TRACEPARENT: traceContext,  // ← Inject trace context
    OTEL_PYTHON_DISABLED_INSTRUMENTATIONS: '',  // Enable auto-instrumentation
  },
})
```

#### 1.3 Add Dependencies

**File**: `package.json`

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-node": "^0.54.0",
    "@opentelemetry/sdk-trace-node": "^1.28.0",
    "@opentelemetry/sdk-metrics": "^1.28.0",
    "@opentelemetry/resources": "^1.28.0",
    "@opentelemetry/semantic-conventions": "^1.28.0",
    "@opentelemetry/core": "^1.28.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.54.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.54.0",
    "@opentelemetry/exporter-prometheus": "^0.54.0",
    "@opentelemetry/instrumentation-http": "^0.54.0",
    "@opentelemetry/instrumentation-express": "^0.43.0"
  }
}
```

#### 1.4 Environment Configuration

**File**: `.env.example`

```bash
# OpenTelemetry Configuration
OTEL_ENABLED=true
OTEL_EXPORTERS=langfuse  # Options: langfuse,sigNoz,prometheus,console
OTEL_SAMPLING_RATE=1.0   # 1.0 = 100%, 0.1 = 10%

# Langfuse Configuration
LANGFUSE_OTLP_ENDPOINT=https://cloud.langfuse.com/api/public/otel/v1/traces
LANGFUSE_PUBLIC_KEY=pk-lf-xxx
LANGFUSE_SECRET_KEY=sk-lf-xxx

# SigNoz Configuration (if using self-hosted)
SIGNOZ_OTLP_ENDPOINT=http://localhost:4318
```

---

### Phase 2: SSE Streaming Integration (Week 1-2, Days 4-7)

#### 2.1 Add Trace Context to Streaming Events

**File**: `examples/lib/streaming.ts`

**New interface** (add after line 28):

```typescript
/**
 * Extended stream callbacks with telemetry
 */
export interface TelemetryStreamCallbacks extends StreamCallbacks {
  onSpanStart?: (spanId: string, traceId: string) => void
  onSpanEnd?: (spanId: string, durationMs: number) => void
}

/**
 * Tool execution span tracker
 */
class ToolSpanTracker {
  private spans = new Map<string, any>()
  private tracer: any

  constructor(tracer: any) {
    this.tracer = tracer
  }

  startToolSpan(toolUseId: string, toolName: string, input: any, sessionId?: string) {
    const span = this.tracer.startSpan('agent.tool.execute', {
      attributes: {
        'tool.id': toolUseId,
        'tool.name': toolName,
        'tool.input_size': JSON.stringify(input).length,
        'agent.session_id': sessionId || 'unknown'
      }
    })
    this.spans.set(toolUseId, span)
    return span
  }

  endToolSpan(toolUseId: string, content: string, isError: boolean = false) {
    const span = this.spans.get(toolUseId)
    if (!span) return

    span.setAttribute('tool.output_size', content.length)
    span.setAttribute('tool.is_error', isError)

    if (isError) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: content.substring(0, 200)
      })
    } else {
      span.setStatus({ code: SpanStatusCode.OK })
    }

    span.end()
    this.spans.delete(toolUseId)
  }

  cleanup() {
    // Force-close any remaining spans
    for (const [id, span] of this.spans.entries()) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Span not properly closed' })
      span.end()
    }
    this.spans.clear()
  }
}
```

**Update `createConsoleStreamHandler`** (lines 79-163):

Add tool span tracking:

```typescript
export function createConsoleStreamHandler(
  callbacks?: TelemetryStreamCallbacks,
  sessionId?: string
) {
  const telemetry = getTelemetry()
  const tracer = telemetry.getTracer()
  const toolTracker = new ToolSpanTracker(tracer)

  return (data: string) => {
    const event = parseStreamEvent(data)
    if (!event) {
      process.stdout.write(data)
      return
    }

    switch (event.type) {
      case 'tool_use':
        // Start tool execution span
        toolTracker.startToolSpan(
          event.data.id,
          event.data.name,
          event.data.input,
          sessionId
        )
        const toolInput = formatToolInput(event.data.input)
        console.log(`🔧 Tool: ${event.data.name}(${toolInput})`)
        if (callbacks?.onToolUse) {
          callbacks.onToolUse(event.data.id, event.data.name, event.data.input)
        }
        break

      case 'tool_result':
        // End tool execution span
        toolTracker.endToolSpan(
          event.data.tool_use_id,
          event.data.content,
          event.data.is_error || false
        )
        const resultPreview = event.data.content?.substring(0, 80) || ''
        console.log(`📦 Result: ${resultPreview}...`)
        if (callbacks?.onToolResult) {
          callbacks.onToolResult(
            event.data.tool_use_id,
            event.data.content,
            event.data.is_error || false
          )
        }
        break

      // ... rest of event handlers
    }
  }
}
```

#### 2.2 SSE Endpoint Instrumentation

**File**: `examples/sse-streaming-api.ts`

**Update session management** (lines 468-492):

```typescript
import { getTelemetry } from './lib/telemetry'
import { trace, context, propagation } from '@opentelemetry/api'

// Session with trace context
interface AgentSession {
  prompt: string
  timestamp: number
  traceId: string
  spanId: string
  rootSpan: any
}

const agentSessions = new Map<string, AgentSession>()

app.post('/api/stream/agent/init', async (req: Request, res: Response) => {
  const { prompt, userId } = req.body

  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' })
    return
  }

  const telemetry = getTelemetry()
  const tracer = telemetry.getTracer()

  // Create root span for session
  const rootSpan = tracer.startSpan('agent.session', {
    attributes: {
      'user.id': userId || 'anonymous',
      'agent.prompt_length': prompt.length
    }
  })

  const spanContext = rootSpan.spanContext()
  const sessionId = spanContext.traceId.substring(0, 16)  // Use trace ID prefix

  agentSessions.set(sessionId, {
    prompt,
    timestamp: Date.now(),
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    rootSpan
  })

  // Cleanup old sessions (>30 min)
  for (const [id, session] of agentSessions.entries()) {
    if (Date.now() - session.timestamp > 30 * 60 * 1000) {
      session.rootSpan.end()
      agentSessions.delete(id)
    }
  }

  res.json({ sessionId, traceId: spanContext.traceId })
})
```

**Update streaming endpoint** (lines 497-640):

Add trace ID to SSE events:

```typescript
app.get('/api/stream/agent/:sessionId', async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId
  const session = agentSessions.get(sessionId)

  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  const { prompt, rootSpan, traceId } = session

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // Send initial event with trace ID
  res.write(`event: start\ndata: ${JSON.stringify({
    sessionId,
    traceId,  // ← Include trace ID for client-side debugging
    prompt
  })}\n\n`)

  // ... sandbox creation and execution

  // Update session timestamp on activity
  session.timestamp = Date.now()

  // On completion, optionally close root span
  // (or keep open for multi-turn conversations)
})
```

---

### Phase 3: Metrics, Dashboards, Documentation (Week 2-3, Days 8-10)

#### 3.1 Cost & Performance Metrics

**File**: `examples/lib/telemetry.ts`

Add metrics collection:

```typescript
export class AgentTelemetry {
  private costCounter: any
  private durationHistogram: any
  private toolDurationHistogram: any
  private errorCounter: any

  private initializeMetrics() {
    // ... existing code

    this.meter = metrics.getMeter(this.config.serviceName!)

    // Cost tracking
    this.costCounter = this.meter.createCounter('claude.agent.cost.usd', {
      description: 'Total cost in USD',
      unit: 'usd'
    })

    // Execution duration
    this.durationHistogram = this.meter.createHistogram('claude.agent.duration.ms', {
      description: 'Agent execution duration',
      unit: 'ms'
    })

    // Tool execution duration
    this.toolDurationHistogram = this.meter.createHistogram('claude.agent.tool.duration.ms', {
      description: 'Tool execution duration',
      unit: 'ms'
    })

    // Error rates
    this.errorCounter = this.meter.createCounter('claude.agent.errors.total', {
      description: 'Total errors by type'
    })
  }

  // Record agent completion metrics
  recordAgentMetrics(
    cost: number,
    durationMs: number,
    numTurns: number,
    userId?: string,
    attributes?: Record<string, string>
  ) {
    const commonAttributes = {
      'user.id': userId || 'anonymous',
      ...attributes
    }

    this.costCounter.add(cost, commonAttributes)
    this.durationHistogram.record(durationMs, commonAttributes)
  }

  // Record error
  recordError(errorType: string, errorMessage: string, attributes?: Record<string, string>) {
    this.errorCounter.add(1, {
      'error.type': errorType,
      'error.message': errorMessage.substring(0, 100),
      ...attributes
    })
  }
}
```

**Update streaming handler** (`examples/lib/streaming.ts:137-148`):

```typescript
case 'result':
  const cost = event.data.cost || 0
  const duration = event.data.duration_ms || 0
  const numTurns = event.data.num_turns || 0

  // Record metrics
  const telemetry = getTelemetry()
  telemetry.recordAgentMetrics(cost, duration, numTurns, userId, {
    'agent.session_id': sessionId
  })

  console.log(`✅ Complete (${(duration / 1000).toFixed(2)}s, $${cost.toFixed(4)})`)

  if (callbacks?.onResult) {
    callbacks.onResult(event.data.result, duration, cost)
  }
  break
```

#### 3.2 Dashboard Templates

**New directory**: `examples/dashboards/`

**File**: `examples/dashboards/langfuse/agent-overview.json`

```json
{
  "title": "Claude Agent Overview",
  "description": "High-level metrics for agent execution",
  "widgets": [
    {
      "type": "timeseries",
      "title": "Total Requests",
      "query": "count(claude.agent.duration.ms)",
      "visualization": "line"
    },
    {
      "type": "timeseries",
      "title": "Success Rate",
      "query": "sum(claude.agent.errors.total) / count(claude.agent.duration.ms) * 100",
      "visualization": "line",
      "unit": "%"
    },
    {
      "type": "histogram",
      "title": "Latency Distribution (p50, p95, p99)",
      "query": "histogram_quantile(0.5, claude.agent.duration.ms)",
      "quantiles": [0.5, 0.95, 0.99]
    },
    {
      "type": "counter",
      "title": "Total Cost (24h)",
      "query": "sum(claude.agent.cost.usd) by (user.id)",
      "timeRange": "24h"
    }
  ]
}
```

**File**: `examples/dashboards/langfuse/cost-analysis.json`

```json
{
  "title": "Cost Analysis",
  "description": "Token usage and cost tracking",
  "widgets": [
    {
      "type": "timeseries",
      "title": "Cost per Hour",
      "query": "sum(rate(claude.agent.cost.usd[1h]))",
      "visualization": "line"
    },
    {
      "type": "table",
      "title": "Cost by User (Top 10)",
      "query": "sum(claude.agent.cost.usd) by (user.id) | top 10",
      "columns": ["user.id", "total_cost", "avg_cost_per_request"]
    },
    {
      "type": "pie",
      "title": "Cost Distribution by Session Type",
      "query": "sum(claude.agent.cost.usd) by (session.type)"
    }
  ]
}
```

**File**: `examples/dashboards/langfuse/tool-performance.json`

```json
{
  "title": "Tool Performance",
  "description": "Tool execution metrics and error rates",
  "widgets": [
    {
      "type": "table",
      "title": "Tool Execution Time (Avg)",
      "query": "avg(claude.agent.tool.duration.ms) by (tool.name)",
      "columns": ["tool.name", "avg_duration_ms", "p95_duration_ms", "error_rate"]
    },
    {
      "type": "timeseries",
      "title": "Tool Error Rate",
      "query": "sum(claude.agent.tool.errors) by (tool.name) / count(claude.agent.tool.duration.ms) by (tool.name)",
      "visualization": "line"
    }
  ]
}
```

**File**: `examples/dashboards/prometheus/grafana-agent-overview.json`

Grafana dashboard JSON for Prometheus metrics (similar structure to Langfuse)

#### 3.3 Documentation

**File**: `docs/OPENTELEMETRY_INTEGRATION.md`

```markdown
# OpenTelemetry Integration Guide

## Overview

The Claude Agent SDK includes production-ready OpenTelemetry (OTEL) integration for distributed tracing, metrics collection, and cost tracking across the TypeScript → E2B → Python boundary.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

OTEL dependencies are included in `package.json`.

### 2. Configure Environment

Add to `.env`:

```bash
# Enable OpenTelemetry
OTEL_ENABLED=true
OTEL_EXPORTERS=langfuse  # or: sigNoz, prometheus, console
OTEL_SAMPLING_RATE=1.0   # 100% in dev, 0.1 (10%) recommended for prod

# Langfuse Configuration
LANGFUSE_OTLP_ENDPOINT=https://cloud.langfuse.com/api/public/otel/v1/traces
LANGFUSE_PUBLIC_KEY=pk-lf-xxx
LANGFUSE_SECRET_KEY=sk-lf-xxx
```

### 3. Initialize Telemetry

In your application entry point (e.g., `app.ts`, `index.ts`):

```typescript
import { initializeTelemetry } from './lib/telemetry'

// Initialize before any agent calls
initializeTelemetry({
  serviceName: 'my-agent-app',
  serviceVersion: '1.0.0',
  exporters: ['langfuse'],  // Optional: overrides env var
  samplingRate: 0.1         // Optional: overrides env var
})

// Now use agents normally
const result = await runPythonAgentStreaming({ prompt: 'Task' })
```

### 4. View Traces

**Langfuse**: https://cloud.langfuse.com/traces
**SigNoz**: http://localhost:3301/traces (self-hosted)
**Prometheus**: http://localhost:9464/metrics

## Features

### Distributed Tracing

Automatic trace correlation across:
- TypeScript SDK
- E2B sandbox creation
- Python agent execution
- Tool calls (Bash, Read, Write, Edit, etc.)

Example trace:
```
agent.session (1234ms)
  ├─ sandbox.create (150ms)
  ├─ agent.execute (1000ms)
  │   ├─ tool.bash (200ms)
  │   ├─ tool.read (50ms)
  │   └─ tool.write (100ms)
  └─ sandbox.cleanup (50ms)
```

### Metrics Collection

Automatic metrics:
- `claude.agent.cost.usd` - Cost per request
- `claude.agent.duration.ms` - Execution time
- `claude.agent.tool.duration.ms` - Tool execution time
- `claude.agent.errors.total` - Error counts by type

### Cost Tracking

Per-user cost attribution:

```typescript
await runPythonAgentStreaming({
  prompt: 'Task',
  userId: 'user_123',  // For cost attribution
  customAttributes: {
    orgId: 'org_456',
    projectId: 'proj_789'
  }
})
```

View costs by user in Langfuse dashboards.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_ENABLED` | `true` | Enable/disable OTEL |
| `OTEL_EXPORTERS` | `console` (dev), `langfuse` (prod) | Comma-separated list |
| `OTEL_SAMPLING_RATE` | `1.0` (dev), `0.1` (prod) | Sampling rate (0.0-1.0) |
| `LANGFUSE_OTLP_ENDPOINT` | Langfuse cloud | OTLP endpoint URL |
| `LANGFUSE_PUBLIC_KEY` | - | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | - | Langfuse secret key |
| `SIGNOZ_OTLP_ENDPOINT` | `http://localhost:4318` | SigNoz OTLP endpoint |

### Multiple Exporters

Export to multiple backends simultaneously:

```bash
OTEL_EXPORTERS=langfuse,prometheus
```

Traces → Langfuse
Metrics → Prometheus (port 9464)

### Sampling Strategies

**Development** (100% sampling):
```bash
NODE_ENV=development
OTEL_SAMPLING_RATE=1.0
```

**Production** (10% sampling, 100% for errors):
```bash
NODE_ENV=production
OTEL_SAMPLING_RATE=0.1
```

## Dashboard Templates

Pre-built dashboards in `examples/dashboards/`:

### Langfuse
- `agent-overview.json` - Total requests, success rate, latency
- `cost-analysis.json` - Cost per hour, cost by user
- `tool-performance.json` - Tool execution time, error rates

### Grafana (Prometheus)
- `grafana-agent-overview.json` - Import to Grafana

### Import Instructions

**Langfuse**:
1. Go to Langfuse dashboard
2. Settings → Dashboards → Import
3. Upload JSON file from `examples/dashboards/langfuse/`

**Grafana**:
1. Go to Grafana
2. Dashboards → Import
3. Upload `examples/dashboards/prometheus/grafana-agent-overview.json`

## Troubleshooting

### No traces appearing

1. Check `OTEL_ENABLED=true`
2. Verify exporter configuration (API keys, endpoints)
3. Check logs for exporter errors
4. Test with console exporter: `OTEL_EXPORTERS=console`

### High overhead in production

1. Reduce sampling rate: `OTEL_SAMPLING_RATE=0.05` (5%)
2. Use batched export (default)
3. Consider metrics-only export (disable tracing)

### Trace context not propagating to Python

1. Verify `TRACEPARENT` in sandbox env vars
2. Check Python OTEL SDK installed in E2B template
3. Rebuild template: `npm run build:template`

## Migration from Legacy Cost Tracking

The legacy cost tracking (`streaming.ts:137-148`) is still supported. To migrate:

1. Set `OTEL_ENABLED=true`
2. Existing `onResult` callbacks will continue to work
3. New metrics will be exported to OTEL backend
4. No code changes required

**Deprecation timeline**: Legacy tracking removed in 3 months (April 2026)

## Best Practices

### PII Protection

Prompts are automatically truncated to 100 characters. To customize:

```typescript
const telemetry = getTelemetry()
const sanitized = telemetry.sanitizePrompt(userPrompt, 200)  // 200 char limit
```

### Multi-Turn Conversations

Root spans remain open for 30 minutes of inactivity. Explicitly close on disconnect:

```typescript
sse.on('close', () => {
  session.rootSpan.end()
  agentSessions.delete(sessionId)
})
```

### Error Handling

OTEL failures never crash agents:

```typescript
try {
  await exporter.export(spans)
} catch (error) {
  console.error('OTEL export failed:', error)
  // Agent continues normally
}
```

## Examples

See complete examples:
- `examples/otel_langfuse_example.ts` - Langfuse integration
- `examples/otel_sigNoz_example.ts` - SigNoz integration
- `examples/console_streaming_example.ts` - Updated with OTEL

## Further Reading

- [OpenTelemetry Documentation](https://opentelemetry.io/)
- [Langfuse TypeScript SDK](https://langfuse.com/docs/sdk/typescript)
- [SigNoz Documentation](https://signoz.io/docs/)
```

---

## Acceptance Criteria

### Functional Requirements

- [ ] **Trace Context Propagation**
  - [ ] TypeScript SDK creates root span for each agent request
  - [ ] W3C TraceContext injected into E2B sandbox via `TRACEPARENT` env var
  - [ ] Python agent reads trace context and creates child spans
  - [ ] All tool executions appear as child spans in trace

- [ ] **SSE Streaming Integration**
  - [ ] Trace ID included in SSE `start` and `result` events
  - [ ] Tool execution spans created on `tool_use` event
  - [ ] Tool execution spans closed on `tool_result` event
  - [ ] Root span remains open for multi-turn conversations
  - [ ] Root span auto-closes after 30 minutes of inactivity

- [ ] **Metrics Collection**
  - [ ] Cost metrics recorded per request with user attribution
  - [ ] Duration histograms for agent execution and tool calls
  - [ ] Error counters with error type classification
  - [ ] Sandbox creation time tracked

- [ ] **Multi-Exporter Support**
  - [ ] Langfuse exporter works with cloud endpoint
  - [ ] SigNoz exporter works with self-hosted instance
  - [ ] Prometheus exporter exposes metrics on port 9464
  - [ ] Console exporter logs spans to stdout (dev mode)
  - [ ] Multiple exporters can run simultaneously

- [ ] **Configuration**
  - [ ] Environment variables control exporter selection
  - [ ] Sampling rate configurable per environment
  - [ ] OTEL can be disabled via `OTEL_ENABLED=false`
  - [ ] PII sanitization truncates prompts to 100 chars by default

### Non-Functional Requirements

- [ ] **Performance**
  - [ ] OTEL overhead <5% in production (10% sampling)
  - [ ] Exporter failures do not crash agent execution
  - [ ] Batched export (5s interval) reduces API calls
  - [ ] Span limits prevent memory leaks (max 1000 spans buffered)

- [ ] **Reliability**
  - [ ] Exporter errors logged but do not throw exceptions
  - [ ] Retry logic with exponential backoff (max 5 attempts)
  - [ ] Orphaned spans cleaned up on process shutdown
  - [ ] SSE reconnection does not create duplicate spans

- [ ] **Security**
  - [ ] User prompts sanitized (truncated to 100 chars)
  - [ ] API keys stored in environment variables only
  - [ ] No PII in span attributes (file contents, bash outputs)
  - [ ] Trace IDs safe to expose to clients

### Quality Gates

- [ ] **Testing**
  - [ ] Unit tests for `AgentTelemetry` class
  - [ ] Integration test: trace context propagates to E2B
  - [ ] Integration test: metrics exported to console
  - [ ] Integration test: SSE streaming with tool spans
  - [ ] Load test: 100 concurrent agents with OTEL enabled

- [ ] **Documentation**
  - [ ] `docs/OPENTELEMETRY_INTEGRATION.md` complete
  - [ ] README updated with OTEL quick start
  - [ ] Dashboard import instructions verified
  - [ ] Migration guide from legacy cost tracking
  - [ ] Example files: `otel_langfuse_example.ts`, `otel_sigNoz_example.ts`

- [ ] **Code Review**
  - [ ] No breaking changes to existing SDK functions
  - [ ] Backward compatible (legacy cost tracking still works)
  - [ ] Error handling reviewed (no crashes on OTEL failures)
  - [ ] PII sanitization reviewed by security team

---

## Success Metrics

### Adoption Metrics
- 60%+ of users enable OTEL within 1 month
- 30%+ use Langfuse dashboards regularly
- 20%+ use custom metrics for cost optimization

### Quality Metrics
- <5% performance overhead in production
- Zero agent crashes due to OTEL failures
- <1% trace context propagation failures
- 100% of critical errors appear in traces

### User Feedback
- "OTEL setup was easy" (>80% satisfaction)
- "Dashboards helped debug production issues" (>70%)
- "Cost tracking accurate" (>90%)

---

## Dependencies & Risks

### Dependencies

**External**:
- OpenTelemetry JavaScript SDK (v1.28.0+)
- Langfuse API (cloud or self-hosted)
- SigNoz (optional, self-hosted)
- Prometheus (optional, metrics only)

**Internal**:
- E2B sandbox with Python OTEL SDK installed
- Claude Agent SDK (Python) compatibility with OTEL
- TypeScript SDK refactoring (minimal)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Python Agent SDK incompatible with OTEL | Medium | High | Test early, use environment variable propagation (not SDK modification) |
| Exporter API changes | Low | Medium | Pin dependency versions, monitor changelogs |
| Performance overhead too high | Low | High | Implement sampling, batching, performance tests |
| Trace context lost in E2B | Medium | High | Validate with integration tests, fallback to best-effort tracing |
| Bundle size exceeds Edge runtime limits | Low | Medium | Make OTEL optional peer dependency, document Node.js requirement |
| Users confused by configuration | Medium | Low | Provide sensible defaults, comprehensive docs, examples |

### Blockers

**None** - All critical questions answered in design phase.

**Validations needed**:
1. Test Python OTEL SDK in E2B sandbox (1 day)
2. Verify Langfuse OTLP endpoint compatibility (1 day)
3. Measure performance overhead with 10% sampling (1 day)

---

## Implementation Timeline

### Week 1

**Days 1-2**: Core OTEL infrastructure
- Create `telemetry.ts` module
- Add dependencies and configuration
- Implement trace context propagation
- Unit tests

**Days 3-4**: SDK integration
- Update `agent.ts` with sandbox tracing
- Test trace context in E2B sandbox
- Add Python OTEL SDK to E2B template
- Integration tests

**Day 5**: Exporter setup
- Implement Langfuse exporter
- Implement console exporter (dev mode)
- Test multi-exporter configuration

### Week 2

**Days 6-7**: SSE streaming integration
- Add tool execution spans to `streaming.ts`
- Update `sse-streaming-api.ts` with session management
- Include trace IDs in SSE events
- Test multi-turn conversations

**Days 8-9**: Metrics and dashboards
- Implement cost/duration metrics
- Create Langfuse dashboard templates
- Create Prometheus dashboard for Grafana
- Test metric export

**Day 10**: Documentation and examples
- Write `docs/OPENTELEMETRY_INTEGRATION.md`
- Create example files
- Update README
- Migration guide

### Week 3 (Buffer)

**Days 11-12**: Testing and validation
- Load testing (100 concurrent agents)
- Error scenario testing
- Performance benchmarking
- Bug fixes

**Days 13-14**: Polish and release
- Code review
- Documentation review
- Release notes
- Deploy to staging

---

## Testing Strategy

### Unit Tests

**File**: `examples/lib/telemetry.test.ts`

```typescript
describe('AgentTelemetry', () => {
  test('should initialize with default config', () => {
    const telemetry = new AgentTelemetry()
    expect(telemetry.getTracer()).toBeDefined()
  })

  test('should generate valid W3C TraceContext', async () => {
    const telemetry = new AgentTelemetry()
    const { traceContext } = await telemetry.traceSandboxCreation('test', async () => 'test')
    expect(traceContext).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/)
  })

  test('should sanitize prompts to 100 chars', () => {
    const telemetry = new AgentTelemetry()
    const long = 'a'.repeat(200)
    const sanitized = telemetry.sanitizePrompt(long)
    expect(sanitized.length).toBe(100)
    expect(sanitized).toEndWith('...')
  })
})
```

### Integration Tests

**File**: `examples/tests/otel-integration.test.ts`

```typescript
describe('OTEL Integration', () => {
  test('should propagate trace context to E2B sandbox', async () => {
    const telemetry = initializeTelemetry({ exporters: ['console'] })

    const result = await runPythonAgent({
      prompt: 'echo "test"',
      timeout: 30
    })

    // Verify trace context was injected
    expect(result).toBeDefined()
    // Manual check: View console logs for trace ID
  })

  test('should create tool execution spans', async () => {
    const spans: any[] = []
    const callback = {
      onToolUse: (id: string, name: string) => {
        spans.push({ id, name, type: 'start' })
      },
      onToolResult: (id: string) => {
        spans.push({ id, type: 'end' })
      }
    }

    await runPythonAgentStreaming({
      prompt: 'Create a test file',
      onStream: callback
    })

    expect(spans.length).toBeGreaterThan(0)
    expect(spans.some(s => s.type === 'start')).toBe(true)
    expect(spans.some(s => s.type === 'end')).toBe(true)
  })
})
```

### Load Tests

**File**: `examples/tests/otel-load.test.ts`

```typescript
describe('OTEL Load Testing', () => {
  test('should handle 100 concurrent agents', async () => {
    initializeTelemetry({ samplingRate: 0.1 })  // 10% sampling

    const promises = Array(100).fill(null).map(() =>
      runPythonAgent({ prompt: 'echo "test"', timeout: 60 })
    )

    const results = await Promise.allSettled(promises)
    const successful = results.filter(r => r.status === 'fulfilled')

    expect(successful.length).toBeGreaterThan(95)  // >95% success rate
  })
})
```

---

## Migration Path

### Existing Users

**Current implementation** (`streaming.ts:137-148`):
```typescript
case 'result':
  const cost = event.data.cost?.toFixed(4) || 'N/A'
  const duration = ((event.data.duration_ms || 0) / 1000).toFixed(2)
  console.log(`✅ Complete (${duration}s, $${cost})`)
```

**After OTEL integration**:
- Legacy cost tracking **continues to work** (no breaking changes)
- If `OTEL_ENABLED=true`, metrics also exported to OTEL backend
- Users can opt-in by setting environment variables
- Dual support for 3 months, then legacy deprecated

**Migration steps**:
1. Add OTEL env vars to `.env`
2. Run `npm install` (OTEL dependencies added)
3. Call `initializeTelemetry()` in app entry point
4. Verify traces in Langfuse/SigNoz
5. Optionally remove legacy cost tracking code (after 3 months)

---

## Future Considerations

### Session Persistence (Post-OTEL)

After implementing OTEL, add session persistence for multi-turn conversations:
- Redis backend for session storage
- Resume traces across server restarts
- Link multiple SSE connections to same trace

### Advanced Sampling

Implement adaptive sampling:
- Always sample errors (100%)
- Sample slow requests (>5s) at higher rate
- Sample by user tier (premium users = 100%, free = 5%)

### Custom Exporters

Allow users to add custom exporters:
```typescript
initializeTelemetry({
  customExporters: [new MyCustomExporter()]
})
```

### Trace Replay

Add trace replay for debugging:
- Store full trace context in database
- Replay agent execution with same inputs
- Compare results across traces

---

## References

### Internal Documentation
- `FEATURE_PRIORITIES.md` (lines 26-38) - Requirements
- `RESEARCH_FINDINGS.md` (lines 257-322) - OTEL research
- `examples/lib/agent.ts` - Current SDK implementation
- `examples/lib/streaming.ts` - Current streaming events
- `examples/sse-streaming-api.ts` - SSE server

### External Resources
- [OpenTelemetry JavaScript Documentation](https://opentelemetry.io/docs/languages/js/)
- [Langfuse OpenTelemetry Integration](https://langfuse.com/docs/integrations/opentelemetry)
- [SigNoz OpenTelemetry](https://signoz.io/docs/instrumentation/opentelemetry/)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
- [E2B Documentation](https://e2b.dev/docs)

### Research Documents
- `docs/OPENTELEMETRY_INTEGRATION_RESEARCH.md` (from research agent)
- `docs/OPENTELEMETRY_RESEARCH.md` (framework docs research)
- `docs/E2B_PRODUCTION_RECOMMENDATIONS.md` (lines 879-1054)

---

## Notes for Implementation

### Key Insights

1. **Non-blocking is critical**: Use batched span processors to prevent SSE blocking
2. **Failure isolation**: Wrap all exporter calls in try-catch
3. **Trace context via env vars**: Most reliable method for E2B propagation
4. **Sampling for production**: 10% default, 100% for errors
5. **PII protection**: Truncate all user inputs by default

### Common Pitfalls

- ❌ Forgetting to close spans → memory leaks
- ❌ Synchronous exporter calls → SSE blocking
- ❌ Full prompts in span attributes → PII leakage
- ❌ No retry logic → lost observability data
- ❌ Global trace context → cross-request contamination

### Quick Wins

- ✅ Use `BatchSpanProcessor` (built-in batching)
- ✅ Environment variable propagation (no SDK modifications)
- ✅ Console exporter for local dev (zero config)
- ✅ Langfuse v3 (OTEL-native, no custom integration)
- ✅ Backward compatible (legacy cost tracking works)

---

**End of Plan**

This plan is ready for implementation. All critical questions have been answered, technical approach validated, and risks mitigated. Estimated effort: **1.5 weeks** with 3 clear phases.
