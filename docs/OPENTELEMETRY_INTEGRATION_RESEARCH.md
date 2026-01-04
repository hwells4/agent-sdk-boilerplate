# OpenTelemetry Integration Research for TypeScript/Node.js

> Comprehensive research on OpenTelemetry integration patterns for SSE streaming, LLM agent tracing, and observability platforms (2025-2026)

**Research Date:** January 2026
**Focus:** TypeScript SDK patterns for Claude Agent SDK integration with E2B sandboxes

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [OpenTelemetry for SSE Streaming Applications](#opentelemetry-for-sse-streaming-applications)
3. [LLM Agent Execution Tracing](#llm-agent-execution-tracing)
4. [Metrics Collection Patterns](#metrics-collection-patterns)
5. [Observability Platform Integration](#observability-platform-integration)
6. [Trace Correlation in Sandboxed Environments](#trace-correlation-in-sandboxed-environments)
7. [Human-in-the-Loop Observability](#human-in-the-loop-observability)
8. [Production Best Practices](#production-best-practices)
9. [Implementation Recommendations](#implementation-recommendations)

---

## Executive Summary

### Key Findings

**OpenTelemetry Status in 2026:**
- OpenTelemetry has become the industry standard for distributed tracing and observability
- Native support across all major platforms (Langfuse, SigNoz, Grafana, Datadog)
- TypeScript/Node.js SDK is production-ready with comprehensive instrumentation
- W3C Trace Context is the default propagation format ensuring cross-service compatibility

**Critical Capabilities for This Project:**
1. **SSE Streaming Support** - Real-time tracing of streaming responses without blocking
2. **LLM-Specific Metrics** - Token usage, cost tracking, multi-turn conversation correlation
3. **Sandbox Trace Correlation** - Context propagation across E2B container boundaries
4. **Production-Ready Patterns** - Sampling, batching, error handling, and resource management

### Recommended Stack

```typescript
// Core OpenTelemetry packages
@opentelemetry/sdk-node              // Main SDK for Node.js
@opentelemetry/auto-instrumentations-node  // Auto-instrument Express, HTTP, etc.
@opentelemetry/exporter-trace-otlp-http   // OTLP exporter
@opentelemetry/sdk-metrics            // Metrics collection
@opentelemetry/api                    // Core API

// LLM-specific observability
@langfuse/tracing                     // Langfuse v3 OTEL-native SDK
@langfuse/otel                        // Langfuse OpenTelemetry integration

// Optional exporters
@opentelemetry/exporter-prometheus    // Prometheus metrics
```

---

## OpenTelemetry for SSE Streaming Applications

### Why SSE is Having a Moment in 2025-2026

Server-Sent Events (SSE) has seen a major resurgence in 2025 with:
- AI streaming everywhere (Claude, ChatGPT, LLM agents)
- Real-time dashboards becoming the norm
- Developer preference for simplicity over WebSocket complexity
- Native browser support with `EventSource` API

Source: [SSE's Glorious Comeback: Why 2025 is the Year of Server-Sent Events](https://portalzine.de/sses-glorious-comeback-why-2025-is-the-year-of-server-sent-events/)

### Instrumenting SSE Endpoints with OpenTelemetry

#### Pattern 1: Wrap SSE Stream in a Span

```typescript
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';

async function handleSSERequest(req: Request, res: Response) {
  const tracer = trace.getTracer('sse-api');

  return tracer.startActiveSpan('SSE /agent/stream', {
    kind: SpanKind.SERVER,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: 'GET',
      [ATTR_URL_PATH]: '/agent/stream',
      'sse.client_id': req.query.clientId,
      'agent.prompt': req.query.prompt
    }
  }, async (span) => {
    try {
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Track SSE lifecycle
      span.addEvent('sse.connection_opened');

      let eventCount = 0;

      // Stream agent results
      await runPythonAgentStreaming({
        prompt: req.query.prompt,
        onStream: {
          onText: (text) => {
            res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
            eventCount++;
            span.addEvent('sse.event_sent', { 'event.type': 'text' });
          },
          onToolUse: (id, name, input) => {
            res.write(`data: ${JSON.stringify({ type: 'tool_use', name, input })}\n\n`);
            eventCount++;
            span.addEvent('sse.event_sent', { 'event.type': 'tool_use', 'tool.name': name });
          },
          onResult: (result, ms, cost) => {
            res.write(`data: ${JSON.stringify({ type: 'result', content: result })}\n\n`);
            res.end();

            // Record final metrics
            span.setAttribute('sse.events_sent', eventCount);
            span.setAttribute('agent.duration_ms', ms);
            span.setAttribute('agent.cost_usd', cost);
            span.setStatus({ code: SpanStatusCode.OK });
          }
        }
      });

      span.addEvent('sse.connection_closed');
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      res.end();
    } finally {
      span.end();
    }
  });
}
```

Source: [OpenTelemetry JavaScript Tracing](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/tracing.md)

#### Pattern 2: Child Spans for Individual Events

For detailed tracing of each SSE event:

```typescript
import { trace, context } from '@opentelemetry/api';

async function streamAgentWithTracing(prompt: string, res: Response) {
  const tracer = trace.getTracer('agent-streaming');
  const parentSpan = trace.getActiveSpan();

  await runPythonAgentStreaming({
    prompt,
    onStream: {
      onToolUse: (id, name, input) => {
        // Create child span for each tool execution
        const toolSpan = tracer.startSpan(`tool.${name}`, {
          attributes: {
            'tool.id': id,
            'tool.name': name,
            'tool.input': JSON.stringify(input)
          }
        }, context.active());

        res.write(`data: ${JSON.stringify({ type: 'tool_use', name, input })}\n\n`);
        toolSpan.end();
      },
      onToolResult: (id, content) => {
        const resultSpan = tracer.startSpan('tool.result', {
          attributes: {
            'tool.id': id,
            'tool.output_length': content.length
          }
        }, context.active());

        res.write(`data: ${JSON.stringify({ type: 'tool_result', content })}\n\n`);
        resultSpan.end();
      }
    }
  });
}
```

### Monitoring SSE Connections

#### Key Metrics to Track

```typescript
import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('sse-metrics');

const sseActiveConnections = meter.createUpDownCounter('sse.active_connections', {
  description: 'Number of active SSE connections',
  unit: '1'
});

const sseEventsSent = meter.createCounter('sse.events_sent', {
  description: 'Total SSE events sent to clients',
  unit: '1'
});

const sseStreamDuration = meter.createHistogram('sse.stream_duration', {
  description: 'Duration of SSE streams',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

// Usage
sseActiveConnections.add(1, { endpoint: '/agent/stream' });
sseEventsSent.add(1, { event_type: 'tool_use', tool_name: 'bash' });
sseStreamDuration.record(1543.2, { status: 'success' });
```

Source: [OpenTelemetry Metrics in JavaScript](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/metrics.md)

---

## LLM Agent Execution Tracing

### Native Claude Code Observability

**Built-in OpenTelemetry Support:**
Claude Code (since 2025) has native OpenTelemetry support for tracking:
- Every request, session, and token consumed
- Tool execution outcomes (tool name, success/failure, execution time, errors)
- Prompt length and optionally the prompt itself with `OTEL_LOG_USER_PROMPTS=1`

**Configuration:**
```bash
# Enable telemetry
CLAUDE_CODE_ENABLE_TELEMETRY=1

# Configure exporters
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp

# Optional: log user prompts (be careful with PII)
OTEL_LOG_USER_PROMPTS=1

# Service name
OTEL_SERVICE_NAME=claude-agent-sdk
```

Sources:
- [Claude Code Monitoring Documentation](https://docs.claude.com/en/docs/claude-code/monitoring-usage)
- [Bringing Observability to Claude Code: OpenTelemetry in Action | SigNoz](https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/)

### Langfuse Integration for LLM Observability

Langfuse v3 is the **OTEL-native SDK** specifically designed for LLM observability.

#### Setup

```bash
npm install @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const sdk = new NodeSDK({
  spanProcessors: [
    new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST, // Optional, defaults to Langfuse cloud

      // Serverless-specific: flush immediately
      exportMode: process.env.VERCEL ? 'immediate' : 'batch',

      // Filter spans (optional)
      shouldExportSpan: (span) => {
        // Only export LLM-related spans
        const scope = span.instrumentationLibrary.name;
        return ['langfuse-sdk', 'ai', 'anthropic'].some(prefix => scope.startsWith(prefix));
      }
    })
  ]
});

sdk.start();
```

Source: [Langfuse OpenTelemetry Integration](https://langfuse.com/integrations/native/opentelemetry)

#### Tracing Multi-Turn Conversations

```typescript
import { startActiveObservation } from '@langfuse/tracing';

async function runAgentConversation(sessionId: string, messages: Message[]) {
  return startActiveObservation({
    name: 'agent_conversation',
    sessionId, // Groups all turns under one session
    metadata: {
      user_id: 'user-123',
      environment: 'production'
    }
  }, async (observation) => {
    let results = [];

    for (const message of messages) {
      // Each turn is a child span
      const turnResult = await startActiveObservation({
        name: 'conversation_turn',
        input: message.content,
        metadata: {
          turn_number: results.length + 1,
          message_role: message.role
        }
      }, async (turnObservation) => {
        const result = await runPythonAgent({
          prompt: message.content,
          verbose: true
        });

        // Langfuse automatically tracks token usage if available
        turnObservation.setAttribute('agent.result_length', result.length);

        return result;
      });

      results.push(turnResult);
    }

    // Track total conversation cost
    observation.setAttribute('conversation.turns', results.length);

    return results;
  });
}
```

Sources:
- [Langfuse TypeScript SDK](https://langfuse.com/guides/cookbook/js_langfuse_sdk)
- [Langfuse Get Started with Tracing](https://langfuse.com/docs/observability/get-started)

#### Token Usage and Cost Tracking

Langfuse provides first-class helpers for LLM-specific metrics:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('agent-execution');

tracer.startActiveSpan('claude_api_call', async (span) => {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  // Track token usage
  span.setAttribute('llm.usage.input_tokens', response.usage.input_tokens);
  span.setAttribute('llm.usage.output_tokens', response.usage.output_tokens);
  span.setAttribute('llm.usage.total_tokens',
    response.usage.input_tokens + response.usage.output_tokens
  );

  // Calculate cost (example rates)
  const inputCost = response.usage.input_tokens * 0.003 / 1000;
  const outputCost = response.usage.output_tokens * 0.015 / 1000;
  const totalCost = inputCost + outputCost;

  span.setAttribute('llm.cost.input_usd', inputCost);
  span.setAttribute('llm.cost.output_usd', outputCost);
  span.setAttribute('llm.cost.total_usd', totalCost);

  // Model metadata
  span.setAttribute('llm.model', 'claude-sonnet-4-5-20250929');
  span.setAttribute('llm.temperature', 1.0);
  span.setAttribute('llm.max_tokens', 1024);

  span.end();
  return response;
});
```

### Third-Party LLM Tracing Tools

#### OpenLLMetry

Open-source observability for GenAI/LLM applications based on OpenTelemetry.

```bash
npm install @traceloop/node-server-sdk
```

```typescript
import { traceloop } from '@traceloop/node-server-sdk';

traceloop.initialize({
  appName: 'claude-agent-sdk',
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: process.env.VERCEL === '1' // Serverless mode
});

// Automatically instruments popular LLM libraries
// (OpenAI, Anthropic, LangChain, etc.)
```

Source: [OpenLLMetry GitHub](https://github.com/traceloop/openllmetry)

#### Dev-Agent-Lens (Arize)

Proxy-based observability layer for Claude Code:

```bash
# Routes requests through LiteLLM
# Emits OpenTelemetry and OpenInference spans
# Zero code changes required
```

Source: [Claude Code Observability and Tracing: Introducing Dev-Agent-Lens](https://arize.com/blog/claude-code-observability-and-tracing-introducing-dev-agent-lens/)

---

## Metrics Collection Patterns

### Essential Metrics for Agent Execution

```typescript
import { metrics, ValueType } from '@opentelemetry/api';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const meter = metrics.getMeter('agent-metrics', '1.0.0');

// 1. Agent Execution Duration
const agentExecutionDuration = meter.createHistogram('agent.execution.duration', {
  description: 'Time taken to complete agent execution',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

// 2. Token Usage
const tokenUsage = meter.createHistogram('agent.tokens.used', {
  description: 'Number of tokens used per request',
  unit: '1',
  valueType: ValueType.INT
});

// 3. Cost Tracking
const agentCost = meter.createHistogram('agent.cost', {
  description: 'Cost per agent execution in USD',
  unit: 'USD',
  valueType: ValueType.DOUBLE
});

// 4. Tool Execution Count
const toolExecutions = meter.createCounter('agent.tool.executions', {
  description: 'Number of tool executions',
  unit: '1'
});

// 5. Error Rate
const agentErrors = meter.createCounter('agent.errors', {
  description: 'Number of agent execution errors',
  unit: '1'
});

// 6. Sandbox Lifecycle
const sandboxCreationDuration = meter.createHistogram('sandbox.creation.duration', {
  description: 'Time to create E2B sandbox',
  unit: 'ms',
  valueType: ValueType.DOUBLE
});

const activeSandboxes = meter.createUpDownCounter('sandbox.active', {
  description: 'Number of currently active sandboxes',
  unit: '1'
});

// Usage example
async function executeAgentWithMetrics(prompt: string) {
  const startTime = Date.now();
  activeSandboxes.add(1);

  try {
    const result = await runPythonAgentStreaming({
      prompt,
      onStream: {
        onToolUse: (id, name, input) => {
          toolExecutions.add(1, { tool_name: name });
        },
        onResult: (result, durationMs, costUsd) => {
          const totalDuration = Date.now() - startTime;

          agentExecutionDuration.record(totalDuration, {
            status: 'success',
            model: 'claude-sonnet-4-5'
          });

          agentCost.record(costUsd, {
            model: 'claude-sonnet-4-5'
          });
        }
      }
    });

    return result;
  } catch (error) {
    agentErrors.add(1, {
      error_type: error.constructor.name,
      error_message: error.message
    });
    throw error;
  } finally {
    activeSandboxes.add(-1);
  }
}
```

Source: [OpenTelemetry Metrics Guide](https://logz.io/blog/opentelemetry-metrics/)

### Latency Breakdown Metrics

Track each phase of agent execution:

```typescript
const phaseMetrics = {
  sandboxCreation: meter.createHistogram('agent.phase.sandbox_creation', {
    unit: 'ms',
    valueType: ValueType.DOUBLE
  }),
  promptProcessing: meter.createHistogram('agent.phase.prompt_processing', {
    unit: 'ms',
    valueType: ValueType.DOUBLE
  }),
  toolExecution: meter.createHistogram('agent.phase.tool_execution', {
    unit: 'ms',
    valueType: ValueType.DOUBLE
  }),
  resultGeneration: meter.createHistogram('agent.phase.result_generation', {
    unit: 'ms',
    valueType: ValueType.DOUBLE
  })
};

// Detailed phase tracking
async function runAgentWithPhaseMetrics(prompt: string) {
  const phases = {
    sandboxCreation: 0,
    promptProcessing: 0,
    toolExecution: 0,
    resultGeneration: 0
  };

  // Track each phase...
  const sandboxStart = Date.now();
  const sandbox = await Sandbox.create(templateId);
  phases.sandboxCreation = Date.now() - sandboxStart;

  // ... execute agent ...

  // Record all phases
  Object.entries(phases).forEach(([phase, duration]) => {
    phaseMetrics[phase].record(duration, {
      prompt_length: prompt.length,
      template_id: templateId
    });
  });
}
```

---

## Observability Platform Integration

### 1. Langfuse (LLM-Specific)

**Why Langfuse:**
- Purpose-built for LLM observability
- Native multi-turn conversation tracking
- Automatic token usage and cost calculation
- Prompt versioning and management
- Human feedback integration

**Setup (v3 OTEL-native SDK):**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const sdk = new NodeSDK({
  serviceName: 'claude-agent-sdk',
  spanProcessors: [
    new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: 'https://cloud.langfuse.com', // or self-hosted
      exportMode: 'batch', // or 'immediate' for serverless
      flushInterval: 1000, // ms
      maxQueueSize: 100
    })
  ],
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation()
  ]
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await sdk.shutdown();
});
```

**Serverless Configuration (Vercel, AWS Lambda):**

```typescript
import { LangfuseSpanProcessor } from '@langfuse/otel';

const spanProcessor = new LangfuseSpanProcessor({
  // ... config ...
  exportMode: 'immediate', // Critical for serverless!
  flushAtEnd: true
});

// In your handler, explicitly flush before returning
export default async function handler(req, res) {
  const result = await runAgent(req.body.prompt);

  // Flush traces before function terminates
  await spanProcessor.forceFlush();

  res.json({ result });
}
```

Sources:
- [Langfuse OpenTelemetry Integration](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse TypeScript Advanced Usage](https://langfuse.com/docs/observability/sdk/typescript/advanced-usage)

### 2. SigNoz (Open-Source)

**Why SigNoz:**
- Open-source alternative to Datadog/New Relic
- Self-hosted or cloud (signoz.io)
- Built on ClickHouse for fast queries
- Unified logs, metrics, and traces
- Active community and development

**Installation:**

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```

**Configuration:**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const resource = Resource.default().merge(
  new Resource({
    [ATTR_SERVICE_NAME]: 'claude-agent-sdk',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development'
  })
);

const traceExporter = new OTLPTraceExporter({
  url: process.env.SIGNOZ_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {
    'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN
  }
});

const metricExporter = new OTLPMetricExporter({
  url: process.env.SIGNOZ_ENDPOINT || 'http://localhost:4318/v1/metrics',
  headers: {
    'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN
  }
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000 // 10 seconds
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Automatically instrument:
      '@opentelemetry/instrumentation-http': {},
      '@opentelemetry/instrumentation-express': {},
      '@opentelemetry/instrumentation-fs': {},
      // Disable DNS instrumentation (too noisy)
      '@opentelemetry/instrumentation-dns': {
        enabled: false
      }
    })
  ]
});

sdk.start();
```

**Environment Variables (Alternative):**

```bash
# SigNoz Cloud
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.{region}.signoz.cloud:443
OTEL_EXPORTER_OTLP_HEADERS=signoz-access-token=<YOUR_TOKEN>

# Or self-hosted
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Service configuration
OTEL_SERVICE_NAME=claude-agent-sdk
OTEL_RESOURCE_ATTRIBUTES=service.version=1.0.0,deployment.environment=production

# Enable exporters
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp

# Auto-instrumentation (no-code approach)
NODE_OPTIONS=--require @opentelemetry/auto-instrumentations-node/register
```

Sources:
- [SigNoz Node.js OpenTelemetry Instrumentation](https://signoz.io/docs/instrumentation/javascript/opentelemetry-nodejs/)
- [SigNoz OpenTelemetry Node.js Guide](https://signoz.io/opentelemetry/nodejs/)

### 3. Prometheus + Grafana

**Why Prometheus + Grafana:**
- Industry-standard metrics solution
- Powerful query language (PromQL)
- Extensive ecosystem and integrations
- Beautiful, customizable dashboards
- Self-hosted or managed (Grafana Cloud)

**Architecture:**

```
TypeScript App (OTel SDK)
    ↓
OpenTelemetry Collector
    ↓
Prometheus (scrapes metrics)
    ↓
Grafana (visualizes)
```

**Setup:**

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/sdk-metrics \
  @opentelemetry/exporter-prometheus
```

**Option 1: Direct Prometheus Exporter (Simple)**

```typescript
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const prometheusExporter = new PrometheusExporter({
  port: 9464, // Prometheus will scrape this port
  endpoint: '/metrics'
});

const meterProvider = new MeterProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'claude-agent-sdk'
  }),
  readers: [prometheusExporter]
});

// Set as global meter provider
metrics.setGlobalMeterProvider(meterProvider);

// Start HTTP server for Prometheus to scrape
prometheusExporter.startServer();

console.log('Prometheus metrics available at http://localhost:9464/metrics');
```

**Prometheus scrape configuration (`prometheus.yml`):**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'claude-agent-sdk'
    static_configs:
      - targets: ['localhost:9464']
        labels:
          environment: 'production'
```

**Option 2: OTLP to Collector to Prometheus (Production)**

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  serviceName: 'claude-agent-sdk',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4317' // OpenTelemetry Collector
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:4317'
    }),
    exportIntervalMillis: 10000
  })
});

sdk.start();
```

**OpenTelemetry Collector Configuration:**

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: claude_agent

  logging:
    loglevel: debug

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus, logging]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
```

**Docker Compose Setup:**

```yaml
version: '3.8'

services:
  otel-collector:
    image: otel/opentelemetry-collector:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8889:8889"   # Prometheus exporter

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

**Grafana Dashboard (Example Queries):**

```promql
# Agent execution rate
rate(agent_execution_total[5m])

# P95 execution duration
histogram_quantile(0.95, rate(agent_execution_duration_bucket[5m]))

# Token usage over time
rate(agent_tokens_used_sum[5m])

# Cost per minute
rate(agent_cost_sum[1m]) * 60

# Error rate
rate(agent_errors_total[5m]) / rate(agent_execution_total[5m])

# Active sandboxes
sandbox_active
```

Sources:
- [OpenTelemetry Prometheus Exporter (npm)](https://www.npmjs.com/package/@opentelemetry/exporter-prometheus)
- [Grafana OpenTelemetry Instrumentation](https://grafana.com/docs/opentelemetry/instrument/node/)
- [Supercharge Your Node.js Monitoring with OpenTelemetry, Prometheus, and Grafana](https://dev.to/gleidsonleite/supercharge-your-nodejs-monitoring-with-opentelemetry-prometheus-and-grafana-4mhd)

### Platform Comparison

| Feature | Langfuse | SigNoz | Prometheus + Grafana |
|---------|----------|--------|---------------------|
| **LLM-Specific** | Yes (purpose-built) | No (general APM) | No (metrics-focused) |
| **Token Tracking** | Automatic | Manual attributes | Manual metrics |
| **Cost Calculation** | Built-in | Manual | Manual |
| **Multi-turn Conversations** | Native sessions | Manual correlation | N/A |
| **Prompt Management** | Yes | No | No |
| **Deployment** | Cloud or self-hosted | Cloud or self-hosted | Self-hosted |
| **Pricing** | Free tier + paid | Free (OSS) + cloud | Free (OSS) |
| **Best For** | LLM apps, agent systems | General observability | Metrics, dashboards |

---

## Trace Correlation in Sandboxed Environments

### Challenge: Cross-Boundary Trace Propagation

E2B sandboxes are isolated containers. To maintain trace continuity:

1. **Parent trace context** must be passed to the sandbox
2. **Sandbox execution** creates child spans
3. **Results** correlate back to parent trace

### Solution 1: HTTP Header Propagation

**W3C Trace Context Standard:**

```
traceparent: 00-{trace-id}-{parent-span-id}-{trace-flags}
tracestate: {vendor-specific-data}
```

**TypeScript Implementation:**

```typescript
import { trace, context, propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

// Configure W3C propagator (default in most SDKs)
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

async function runAgentInSandbox(prompt: string) {
  const tracer = trace.getTracer('sandbox-executor');

  return tracer.startActiveSpan('sandbox.execution', async (span) => {
    const sandbox = await Sandbox.create(templateId);

    try {
      // Extract trace context from active span
      const traceHeaders: Record<string, string> = {};
      propagation.inject(context.active(), traceHeaders);

      console.log('Trace Headers:', traceHeaders);
      // Output: { traceparent: '00-abc123...-def456...-01' }

      // Pass trace context to sandbox as environment variables
      const execution = await sandbox.commands.run(`
        export TRACEPARENT="${traceHeaders.traceparent}"
        export OTEL_SERVICE_NAME="e2b-sandbox"

        # Run agent with trace context
        python agent.py "${prompt}"
      `);

      // Sandbox spans will be children of this span
      span.setAttribute('sandbox.id', sandbox.id);
      span.setAttribute('execution.exit_code', execution.exitCode);

      return execution.stdout;
    } finally {
      await sandbox.close();
      span.end();
    }
  });
}
```

### Solution 2: Inject OTEL Environment Variables

```typescript
async function createTracedSandbox(templateId: string) {
  const tracer = trace.getTracer('sandbox-manager');

  return tracer.startActiveSpan('sandbox.create', async (span) => {
    const traceContext: Record<string, string> = {};
    propagation.inject(context.active(), traceContext);

    const sandbox = await Sandbox.create(templateId, {
      envVars: {
        // OpenTelemetry configuration
        OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
        OTEL_SERVICE_NAME: 'claude-agent-python',
        OTEL_RESOURCE_ATTRIBUTES: `sandbox.id=${sandbox.id},parent.service=claude-agent-sdk`,

        // Trace context propagation
        TRACEPARENT: traceContext.traceparent || '',
        TRACESTATE: traceContext.tracestate || '',

        // Claude credentials
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN
      }
    });

    span.setAttribute('sandbox.id', sandbox.id);
    span.setAttribute('sandbox.template', templateId);
    span.end();

    return sandbox;
  });
}
```

### Solution 3: Resource Attributes for Correlation

Use consistent resource attributes across boundaries:

```typescript
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sharedResource = new Resource({
  [ATTR_SERVICE_NAME]: 'claude-agent-sdk',
  'deployment.environment': process.env.NODE_ENV,
  'session.id': sessionId, // Correlate all related executions
  'user.id': userId
});

// TypeScript side
const sdk = new NodeSDK({
  resource: sharedResource,
  // ... other config
});

// Pass to sandbox
const sandbox = await Sandbox.create(templateId, {
  envVars: {
    OTEL_RESOURCE_ATTRIBUTES: Object.entries(sharedResource.attributes)
      .map(([key, value]) => `${key}=${value}`)
      .join(',')
  }
});
```

### Solution 4: Manual Span Linking

When automatic propagation isn't possible, manually link spans:

```typescript
import { trace, SpanKind } from '@opentelemetry/api';

async function runSandboxWithManualLinking(prompt: string) {
  const tracer = trace.getTracer('sandbox');
  const parentSpan = trace.getActiveSpan();
  const parentContext = parentSpan?.spanContext();

  return tracer.startActiveSpan('sandbox.task', {
    kind: SpanKind.INTERNAL,
    links: parentContext ? [{
      context: parentContext,
      attributes: {
        'link.type': 'parent_sandbox_execution'
      }
    }] : []
  }, async (span) => {
    // Execute in sandbox...
    const result = await executeSandboxTask();

    span.setAttribute('task.result_length', result.length);
    span.end();

    return result;
  });
}
```

Sources:
- [OpenTelemetry Context Propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [W3C Trace Context Propagation Explained | Better Stack](https://betterstack.com/community/guides/observability/otel-context-propagation/)
- [Understanding OpenTelemetry - Trace ID vs. Span ID | SigNoz](https://signoz.io/comparisons/opentelemetry-trace-id-vs-span-id/)

---

## Human-in-the-Loop Observability

### Pattern 1: HITL Workflow Tracing

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

async function executeWithHumanApproval(agentPrompt: string, userId: string) {
  const tracer = trace.getTracer('hitl-workflow');

  return tracer.startActiveSpan('hitl.workflow', {
    attributes: {
      'user.id': userId,
      'workflow.type': 'human_approval'
    }
  }, async (workflowSpan) => {
    // Phase 1: Agent generates plan
    const plan = await tracer.startActiveSpan('hitl.agent_planning', async (planSpan) => {
      const result = await runPythonAgent({
        prompt: `Generate a plan for: ${agentPrompt}`
      });

      planSpan.setAttribute('plan.length', result.length);
      planSpan.end();
      return result;
    });

    // Phase 2: Wait for human approval
    const approval = await tracer.startActiveSpan('hitl.human_review', async (reviewSpan) => {
      reviewSpan.addEvent('approval_requested', {
        'user.id': userId,
        'plan.content': plan.substring(0, 200)
      });

      const startWait = Date.now();
      const approved = await waitForUserApproval(userId, plan);
      const waitDuration = Date.now() - startWait;

      reviewSpan.setAttribute('approval.granted', approved);
      reviewSpan.setAttribute('approval.wait_time_ms', waitDuration);
      reviewSpan.addEvent('approval_received', {
        'approved': approved
      });

      reviewSpan.end();
      return approved;
    });

    if (!approval) {
      workflowSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'User rejected plan'
      });
      workflowSpan.end();
      throw new Error('Plan rejected by user');
    }

    // Phase 3: Execute approved plan
    const result = await tracer.startActiveSpan('hitl.agent_execution', async (execSpan) => {
      const output = await runPythonAgent({
        prompt: `Execute this plan: ${plan}`
      });

      execSpan.setAttribute('execution.result_length', output.length);
      execSpan.end();
      return output;
    });

    workflowSpan.setStatus({ code: SpanStatusCode.OK });
    workflowSpan.setAttribute('workflow.completed', true);
    workflowSpan.end();

    return result;
  });
}
```

### Pattern 2: Feedback Loop Tracing

```typescript
async function agentWithFeedbackLoop(task: string, sessionId: string) {
  const tracer = trace.getTracer('feedback-loop');

  return tracer.startActiveSpan('agent.feedback_session', {
    attributes: {
      'session.id': sessionId
    }
  }, async (sessionSpan) => {
    let iteration = 0;
    let satisfied = false;
    let currentResult = null;

    while (!satisfied && iteration < 5) {
      iteration++;

      // Agent iteration
      const iterationResult = await tracer.startActiveSpan(`agent.iteration_${iteration}`, {
        attributes: {
          'iteration.number': iteration
        }
      }, async (iterSpan) => {
        const result = await runPythonAgent({
          prompt: iteration === 1 ? task : `Improve based on feedback: ${task}`
        });

        iterSpan.setAttribute('result.length', result.length);
        iterSpan.end();
        return result;
      });

      currentResult = iterationResult;

      // Human feedback
      const feedback = await tracer.startActiveSpan('human.feedback', async (feedbackSpan) => {
        feedbackSpan.addEvent('feedback_requested', {
          'iteration': iteration,
          'result_preview': currentResult.substring(0, 100)
        });

        const userFeedback = await requestUserFeedback(sessionId, currentResult);

        feedbackSpan.setAttribute('feedback.satisfied', userFeedback.satisfied);
        feedbackSpan.setAttribute('feedback.comment_length', userFeedback.comment?.length || 0);
        feedbackSpan.addEvent('feedback_received', {
          'satisfied': userFeedback.satisfied
        });

        feedbackSpan.end();
        return userFeedback;
      });

      satisfied = feedback.satisfied;
    }

    sessionSpan.setAttribute('session.iterations', iteration);
    sessionSpan.setAttribute('session.completed', satisfied);
    sessionSpan.end();

    return currentResult;
  });
}
```

### Pattern 3: Metrics for HITL Efficiency

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('hitl-metrics');

const hitlMetrics = {
  approvalTime: meter.createHistogram('hitl.approval_time', {
    description: 'Time waiting for human approval',
    unit: 'ms'
  }),

  approvalRate: meter.createCounter('hitl.approvals', {
    description: 'Human approval/rejection counts',
    unit: '1'
  }),

  iterationsToSuccess: meter.createHistogram('hitl.iterations', {
    description: 'Number of iterations to user satisfaction',
    unit: '1'
  }),

  feedbackQuality: meter.createHistogram('hitl.feedback_length', {
    description: 'Length of user feedback comments',
    unit: 'characters'
  })
};

// Track HITL metrics
function trackHITLMetrics(
  approved: boolean,
  waitTime: number,
  iterations: number,
  feedbackLength: number
) {
  hitlMetrics.approvalTime.record(waitTime, {
    'approval.result': approved ? 'approved' : 'rejected'
  });

  hitlMetrics.approvalRate.add(1, {
    'approval.result': approved ? 'approved' : 'rejected'
  });

  hitlMetrics.iterationsToSuccess.record(iterations, {
    'success': approved
  });

  if (feedbackLength > 0) {
    hitlMetrics.feedbackQuality.record(feedbackLength);
  }
}
```

Sources:
- [VoltAgent - TypeScript AI Agent Framework with HITL](https://github.com/VoltAgent/voltagent)
- [Trustworthy Symbiotic Workflows With Human-in-the-Loop LLMs](https://dzone.com/articles/agentic-aiops-human-in-the-loop-workflows)

---

## Production Best Practices

### 1. Sampling Strategies

**Problem:** Tracing 100% of requests is expensive and generates massive data volumes.

**Solution:** Smart sampling

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SamplingDecision, Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';

class AdaptiveSampler implements Sampler {
  shouldSample(context, traceId, spanName, spanKind, attributes, links): SamplingResult {
    // Always sample errors
    if (attributes['error'] === true) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample specific endpoints
    const route = attributes[ATTR_HTTP_ROUTE];
    if (route === '/agent/execute' || route?.startsWith('/api/')) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Never sample health checks
    if (route === '/health' || route === '/healthz') {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    // Sample 10% of everything else
    const samplingRate = 0.1;
    const threshold = samplingRate * 0xFFFFFFFF;
    const traceIdInt = parseInt(traceId.substring(0, 8), 16);

    return {
      decision: traceIdInt < threshold
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD
    };
  }

  toString() {
    return 'AdaptiveSampler';
  }
}

const provider = new NodeTracerProvider({
  sampler: new AdaptiveSampler()
});
```

Source: [OpenTelemetry Tracing Best Practices](https://vfunction.com/blog/opentelemetry-tracing-guide/)

### 2. Batching and Performance

**Default: Batch exports to reduce network overhead**

```typescript
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
});

const spanProcessor = new BatchSpanProcessor(exporter, {
  maxQueueSize: 2048,           // Default: 2048
  maxExportBatchSize: 512,      // Default: 512
  scheduledDelayMillis: 5000,   // Default: 5000ms
  exportTimeoutMillis: 30000    // Default: 30000ms
});

provider.addSpanProcessor(spanProcessor);
```

**Serverless: Immediate export**

```typescript
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

// For AWS Lambda, Vercel Functions, etc.
const spanProcessor = new SimpleSpanProcessor(exporter);
provider.addSpanProcessor(spanProcessor);
```

Source: [OpenTelemetry Best Practices for Robust Observability | Better Stack](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)

### 3. Resource Management

**Always close spans, even on errors:**

```typescript
async function executeAgent(prompt: string) {
  const tracer = trace.getTracer('agent');
  const span = tracer.startSpan('agent.execute');

  try {
    const result = await runPythonAgent({ prompt });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
    throw error;
  } finally {
    // ALWAYS end spans
    span.end();
  }
}
```

**Use startActiveSpan for automatic context management:**

```typescript
// Preferred: Automatic context handling
async function executeAgent(prompt: string) {
  const tracer = trace.getTracer('agent');

  return tracer.startActiveSpan('agent.execute', async (span) => {
    try {
      const result = await runPythonAgent({ prompt });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 4. Semantic Conventions

**Use standardized attributes for better compatibility:**

```typescript
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_PATH,
  ATTR_URL_SCHEME,
  ATTR_DB_SYSTEM,
  ATTR_DB_OPERATION_NAME
} from '@opentelemetry/semantic-conventions';

// Good: Standard attributes
span.setAttributes({
  [ATTR_HTTP_REQUEST_METHOD]: 'POST',
  [ATTR_HTTP_RESPONSE_STATUS_CODE]: 200,
  [ATTR_URL_PATH]: '/api/agent/execute',
  [ATTR_URL_SCHEME]: 'https'
});

// Also good: Custom namespaced attributes
span.setAttributes({
  'agent.model': 'claude-sonnet-4-5',
  'agent.prompt_length': 1024,
  'sandbox.template_id': 'base-v1',
  'sandbox.creation_time_ms': 156
});
```

Source: [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)

### 5. Error Classification

```typescript
class ErrorClassifier {
  static classify(error: Error): string {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('rate limit')) return 'rate_limit';
    if (error.message.includes('authentication')) return 'auth_error';
    if (error.message.includes('sandbox')) return 'sandbox_error';
    if (error.message.includes('tool')) return 'tool_execution_error';
    return 'unknown_error';
  }
}

async function executeAgentWithClassification(prompt: string) {
  const tracer = trace.getTracer('agent');

  return tracer.startActiveSpan('agent.execute', async (span) => {
    try {
      const result = await runPythonAgent({ prompt });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const errorClass = ErrorClassifier.classify(error);

      span.recordException(error);
      span.setAttributes({
        'error.type': error.constructor.name,
        'error.class': errorClass,
        'error.message': error.message,
        'error.recoverable': errorClass !== 'auth_error'
      });
      span.setStatus({ code: SpanStatusCode.ERROR });

      // Track error metrics by classification
      errorMetrics.add(1, {
        'error.class': errorClass,
        'error.type': error.constructor.name
      });

      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 6. Context Propagation Best Practices

**W3C Trace Context is the default and recommended:**

```typescript
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';

// Set globally (usually done once at startup)
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

// Inject into outbound HTTP requests
const headers: Record<string, string> = {};
propagation.inject(context.active(), headers);

// Extract from inbound HTTP requests
const extractedContext = propagation.extract(context.active(), req.headers);
context.with(extractedContext, () => {
  // All spans created here will be part of the incoming trace
});
```

**OpenTelemetry Baggage for cross-service metadata:**

```typescript
import { propagation, context } from '@opentelemetry/api';

// Set baggage (key-value pairs propagated across services)
const baggage = propagation.createBaggage({
  'user.id': { value: 'user-123' },
  'session.id': { value: 'session-456' },
  'experiment.variant': { value: 'control' }
});

context.with(propagation.setBaggage(context.active(), baggage), () => {
  // Baggage is automatically propagated to child services
  await fetch('https://api.example.com/data');
});

// Read baggage in downstream service
const currentBaggage = propagation.getBaggage(context.active());
const userId = currentBaggage?.getEntry('user.id')?.value;
```

Source: [OpenTelemetry Context Propagation | Better Stack](https://betterstack.com/community/guides/observability/otel-context-propagation/)

### 7. Graceful Shutdown

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  // ... configuration
});

sdk.start();

// Graceful shutdown handlers
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    await sdk.shutdown();
    console.log('OpenTelemetry SDK shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await sdk.shutdown();
  process.exit(1);
});
```

---

## Implementation Recommendations

### Phase 1: Foundation (Week 1)

**Goals:**
- Basic OpenTelemetry instrumentation
- SSE endpoint tracing
- Langfuse integration for LLM metrics

**Implementation:**

```typescript
// examples/lib/telemetry.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export function initializeTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'claude-agent-sdk',
      [ATTR_SERVICE_VERSION]: '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development'
    }),
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        exportMode: process.env.VERCEL ? 'immediate' : 'batch'
      })
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {},
        '@opentelemetry/instrumentation-express': {}
      })
    ]
  });

  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await sdk.shutdown();
    process.exit(0);
  });

  return sdk;
}
```

**Usage:**

```typescript
// examples/sse-streaming-api.ts
import { initializeTelemetry } from './lib/telemetry';
import { trace } from '@opentelemetry/api';

// Initialize once at startup
initializeTelemetry();

const tracer = trace.getTracer('sse-api');

app.get('/agent/stream', async (req, res) => {
  return tracer.startActiveSpan('SSE /agent/stream', async (span) => {
    // ... SSE implementation
    span.end();
  });
});
```

### Phase 2: Metrics and Dashboards (Week 2)

**Goals:**
- Custom metrics for agent execution
- Token usage and cost tracking
- SigNoz or Grafana dashboards

**Implementation:**

```typescript
// examples/lib/metrics.ts
import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('agent-metrics', '1.0.0');

export const agentMetrics = {
  executionDuration: meter.createHistogram('agent.execution.duration', {
    description: 'Agent execution time',
    unit: 'ms',
    valueType: ValueType.DOUBLE
  }),

  tokenUsage: meter.createHistogram('agent.tokens.used', {
    description: 'Tokens used per request',
    unit: '1',
    valueType: ValueType.INT
  }),

  cost: meter.createHistogram('agent.cost', {
    description: 'Cost per execution',
    unit: 'USD',
    valueType: ValueType.DOUBLE
  }),

  errors: meter.createCounter('agent.errors', {
    description: 'Agent execution errors',
    unit: '1'
  })
};
```

**Instrumented Agent Execution:**

```typescript
import { agentMetrics } from './lib/metrics';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export async function runAgentWithTelemetry(prompt: string) {
  const tracer = trace.getTracer('agent');
  const startTime = Date.now();

  return tracer.startActiveSpan('agent.execute', async (span) => {
    try {
      const result = await runPythonAgentStreaming({
        prompt,
        onStream: {
          onResult: (content, durationMs, costUsd) => {
            // Record metrics
            agentMetrics.executionDuration.record(durationMs, {
              model: 'claude-sonnet-4-5',
              status: 'success'
            });

            agentMetrics.cost.record(costUsd, {
              model: 'claude-sonnet-4-5'
            });

            // Span attributes
            span.setAttributes({
              'agent.duration_ms': durationMs,
              'agent.cost_usd': costUsd,
              'agent.result_length': content.length
            });
          }
        }
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      agentMetrics.errors.add(1, {
        error_type: error.constructor.name
      });

      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Phase 3: Advanced Patterns (Week 3)

**Goals:**
- Trace correlation across E2B sandboxes
- Multi-turn conversation tracking
- Human-in-the-loop observability

**Sandbox Trace Propagation:**

```typescript
import { trace, propagation, context } from '@opentelemetry/api';

export async function runAgentInTracedSandbox(prompt: string, sessionId: string) {
  const tracer = trace.getTracer('sandbox');

  return tracer.startActiveSpan('sandbox.execution', async (span) => {
    // Extract trace context
    const traceHeaders: Record<string, string> = {};
    propagation.inject(context.active(), traceHeaders);

    // Create sandbox with trace context
    const sandbox = await Sandbox.create(templateId, {
      envVars: {
        // Propagate trace context
        TRACEPARENT: traceHeaders.traceparent || '',

        // OpenTelemetry configuration
        OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        OTEL_SERVICE_NAME: 'claude-agent-python',
        OTEL_RESOURCE_ATTRIBUTES: `session.id=${sessionId},sandbox.id=${sandbox.id}`,

        // Claude credentials
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN
      }
    });

    try {
      const execution = await sandbox.commands.run(`
        python agent.py "${prompt}"
      `);

      span.setAttribute('sandbox.id', sandbox.id);
      span.setAttribute('execution.exit_code', execution.exitCode);
      span.end();

      return execution.stdout;
    } finally {
      await sandbox.close();
    }
  });
}
```

**Multi-Turn Conversation:**

```typescript
import { startActiveObservation } from '@langfuse/tracing';

export async function runMultiTurnAgent(messages: Message[], sessionId: string) {
  return startActiveObservation({
    name: 'multi_turn_conversation',
    sessionId, // Groups all turns
    metadata: {
      message_count: messages.length,
      user_id: 'user-123'
    }
  }, async (conversation) => {
    const results = [];

    for (let i = 0; i < messages.length; i++) {
      const turnResult = await startActiveObservation({
        name: `conversation_turn_${i + 1}`,
        input: messages[i].content,
        metadata: {
          turn_number: i + 1,
          role: messages[i].role
        }
      }, async (turn) => {
        const result = await runAgentWithTelemetry(messages[i].content);

        turn.setAttribute('turn.result_length', result.length);
        return result;
      });

      results.push(turnResult);
    }

    conversation.setAttribute('conversation.total_turns', messages.length);
    return results;
  });
}
```

### Recommended File Structure

```
examples/
├── lib/
│   ├── agent.ts                    # Existing SDK
│   ├── streaming.ts                # Existing streaming
│   ├── telemetry.ts                # NEW: OTel initialization
│   ├── metrics.ts                  # NEW: Metric definitions
│   └── tracing.ts                  # NEW: Tracing utilities
│
├── basic_typescript.ts             # Update with telemetry
├── streaming_example.ts            # Update with telemetry
├── sse-streaming-api.ts            # Update with SSE tracing
│
└── telemetry_examples/             # NEW: Telemetry demos
    ├── langfuse_integration.ts
    ├── signoz_integration.ts
    ├── prometheus_grafana.ts
    ├── multi_turn_tracing.ts
    └── hitl_observability.ts

docs/
├── OPENTELEMETRY_INTEGRATION_RESEARCH.md  # This document
├── OPENTELEMETRY_SETUP_GUIDE.md           # NEW: Step-by-step setup
└── DASHBOARD_TEMPLATES.md                  # NEW: Grafana/SigNoz dashboards
```

### Environment Variables

```bash
# .env.example

# Existing
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...
E2B_API_KEY=e2b_...
E2B_TEMPLATE_ID=...

# OpenTelemetry Core
OTEL_SERVICE_NAME=claude-agent-sdk
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp

# Langfuse (Option 1)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com

# SigNoz (Option 2)
SIGNOZ_ENDPOINT=https://ingest.{region}.signoz.cloud:443
SIGNOZ_ACCESS_TOKEN=...

# Prometheus (Option 3)
PROMETHEUS_EXPORTER_PORT=9464
```

---

## Key Takeaways

1. **OpenTelemetry is production-ready** for TypeScript/Node.js in 2026
2. **SSE streaming** can be fully instrumented with custom spans and events
3. **Langfuse** is the best choice for LLM-specific observability
4. **SigNoz** provides excellent open-source alternative to commercial APM
5. **Prometheus + Grafana** remains powerful for metrics and dashboards
6. **Trace propagation** across E2B sandboxes requires W3C Trace Context headers
7. **Serverless deployments** need immediate export mode
8. **Sampling strategies** are critical for cost control
9. **Semantic conventions** improve cross-platform compatibility
10. **Human-in-the-loop** workflows benefit from detailed span tracking

---

## Sources

### Official Documentation
- [OpenTelemetry Official Site](https://opentelemetry.io/)
- [OpenTelemetry JavaScript Client](https://github.com/open-telemetry/opentelemetry-js)
- [OpenTelemetry Website Documentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [Langfuse OpenTelemetry Integration](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse TypeScript SDK](https://langfuse.com/guides/cookbook/js_langfuse_sdk)
- [SigNoz Node.js Instrumentation](https://signoz.io/docs/instrumentation/javascript/opentelemetry-nodejs/)

### Articles and Guides (2025-2026)
- [SSE's Glorious Comeback: Why 2025 is the Year of Server-Sent Events](https://portalzine.de/sses-glorious-comeback-why-2025-is-the-year-of-server-sent-events/)
- [Bringing Observability to Claude Code: OpenTelemetry in Action | SigNoz](https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/)
- [Claude Code Monitoring Documentation](https://docs.claude.com/en/docs/claude-code/monitoring-usage)
- [OpenTelemetry in 2025: The Backbone of Full-Stack Observability for Container Environments](https://medium.com/@serverwalainfra/opentelemetry-in-2025-the-backbone-of-full-stack-observability-for-container-environments-619d44135a5a)
- [Backend Observability in 2025: Distributed Tracing with OpenTelemetry](https://medium.com/@shbhggrwl/backend-observability-in-2025-distributed-tracing-with-opentelemetry-af338a987abb)
- [OpenTelemetry Best Practices for Robust Observability | Better Stack](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)
- [OpenTelemetry Context Propagation Explained | Better Stack](https://betterstack.com/community/guides/observability/otel-context-propagation/)
- [Supercharge Your Node.js Monitoring with OpenTelemetry, Prometheus, and Grafana](https://dev.to/gleidsonleite/supercharge-your-nodejs-monitoring-with-opentelemetry-prometheus-and-grafana-4mhd)
- [How to Monitor Your Node.js Application Using OpenTelemetry and the Grafana LGTM stack](https://rudimartinsen.com/2025/07/27/otel-instrumenting-app/)

### Integration Guides
- [Grafana OpenTelemetry Node.js Instrumentation](https://grafana.com/docs/opentelemetry/instrument/node/)
- [SigNoz OpenTelemetry Node.js Guide](https://signoz.io/opentelemetry/nodejs/)
- [OpenLLMetry GitHub](https://github.com/traceloop/openllmetry)
- [Claude Code Observability with Dev-Agent-Lens](https://arize.com/blog/claude-code-observability-and-tracing-introducing-dev-agent-lens/)

### Best Practices and Patterns
- [OpenTelemetry Tracing Guide + Best Practices - vFunction](https://vfunction.com/blog/opentelemetry-tracing-guide/)
- [OpenTelemetry Distributed Tracing: Tutorial & Best Practices](https://www.withcoherence.com/articles/opentelemetry-distributed-tracing-tutorial-and-best-practices)
- [Understanding OpenTelemetry - Trace ID vs. Span ID | SigNoz](https://signoz.io/comparisons/opentelemetry-trace-id-vs-span-id/)
- [Context Propagation | OpenTelemetry](https://opentelemetry.io/docs/concepts/context-propagation/)

### Human-in-the-Loop Patterns
- [VoltAgent - Open Source TypeScript AI Agent Framework](https://github.com/VoltAgent/voltagent)
- [Trustworthy Symbiotic Workflows With Human-in-the-Loop LLMs](https://dzone.com/articles/agentic-aiops-human-in-the-loop-workflows)

---

**Document Version:** 1.0
**Last Updated:** January 2026
**Next Review:** Add practical examples after Phase 1 implementation
