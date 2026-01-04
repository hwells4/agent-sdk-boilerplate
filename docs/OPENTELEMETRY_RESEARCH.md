# OpenTelemetry Integration Research

> Comprehensive documentation research for instrumenting the Claude Agent SDK with OpenTelemetry, Langfuse, and production observability

**Research Date**: 2026-01-04
**Target SDK Version**: TypeScript (Node.js)
**Primary Use Case**: Agent execution tracing with SSE streaming, E2B sandbox integration

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [OpenTelemetry Packages](#opentelemetry-packages)
3. [Langfuse Integration](#langfuse-integration)
4. [Express SSE Instrumentation](#express-sse-instrumentation)
5. [Trace Context Propagation](#trace-context-propagation)
6. [E2B Sandbox Observability](#e2b-sandbox-observability)
7. [Implementation Patterns](#implementation-patterns)
8. [Cost Tracking](#cost-tracking)
9. [Production Best Practices](#production-best-practices)
10. [References](#references)

---

## Executive Summary

### Key Findings

1. **OpenTelemetry is the 2025 Standard**: Industry-wide adoption as the unified observability framework for traces, metrics, and logs
2. **Langfuse Provides LLM-Specific Observability**: Native support for agent tracing, token/cost tracking, and OpenTelemetry integration via span processors
3. **Auto-Instrumentation Covers 80%**: `@opentelemetry/auto-instrumentations-node` handles Express, HTTP, and most common libraries automatically
4. **SSE Requires Custom Spans**: Server-Sent Events need manual instrumentation due to async middleware limitations
5. **W3C TraceContext Enables Cross-Language**: Node.js ↔ Python trace propagation works seamlessly via standard headers

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Express API Route (TypeScript)                              │
│ - Auto-instrumented HTTP spans                              │
│ - Custom SSE streaming span                                 │
│ - Agent execution span (parent)                             │
└──────────────┬──────────────────────────────────────────────┘
               │ W3C TraceContext (traceparent header)
               ↓
┌─────────────────────────────────────────────────────────────┐
│ E2B Sandbox (Python)                                        │
│ - Extract trace context on startup                          │
│ - Create child spans for tool execution                     │
│ - Report metrics (tokens, cost, latency)                    │
└──────────────┬──────────────────────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────────────────────┐
│ Exporters (Multiple Backends)                               │
│ - Langfuse (LLM-specific: traces, costs, evals)            │
│ - Prometheus (Metrics: latency, throughput)                │
│ - Console (Development debugging)                           │
│ - OTLP (Generic: SigNoz, Jaeger, etc.)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## OpenTelemetry Packages

### Core Dependencies

```bash
npm install @opentelemetry/api \
            @opentelemetry/sdk-node \
            @opentelemetry/auto-instrumentations-node \
            @opentelemetry/instrumentation-http \
            @opentelemetry/instrumentation-express \
            @opentelemetry/exporter-prometheus \
            @opentelemetry/sdk-metrics
```

### Package Roles

| Package | Purpose | Required For |
|---------|---------|--------------|
| `@opentelemetry/api` | Core API (spans, metrics, context) | All instrumentation |
| `@opentelemetry/sdk-node` | Node.js SDK with unified setup | Initialization |
| `@opentelemetry/auto-instrumentations-node` | Auto-instrument common libraries | Express, HTTP, etc. |
| `@opentelemetry/instrumentation-http` | HTTP client/server tracing | Required for Express |
| `@opentelemetry/instrumentation-express` | Express middleware tracing | SSE endpoints |
| `@opentelemetry/exporter-prometheus` | Prometheus metrics exporter | Metrics endpoint |
| `@opentelemetry/sdk-metrics` | Metrics SDK | Custom metrics |

---

## OpenTelemetry Setup

### Basic Configuration (TypeScript)

**Source**: [OpenTelemetry JS Exporters Documentation](https://github.com/context7/opentelemetry_io/blob/main/languages/js/exporters.md)

```typescript
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new opentelemetry.NodeSDK({
  // Traces: Export to OTLP collector
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
    headers: {},
  }),

  // Metrics: Export to Prometheus (pull-based)
  metricReader: new PrometheusExporter({
    port: 9464, // Prometheus scrapes this endpoint
  }),

  // Alternative: Metrics via OTLP (push-based)
  // metricReader: new PeriodicExportingMetricReader({
  //   exporter: new OTLPMetricExporter({
  //     url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics',
  //   }),
  // }),

  // Auto-instrument Express, HTTP, and 20+ other libraries
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log('OpenTelemetry SDK started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await sdk.shutdown();
  console.log('OpenTelemetry SDK shut down');
  process.exit(0);
});
```

### Custom HTTP Instrumentation

**Source**: [OpenTelemetry JS SDK Trace Node README](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-node/README.md)

For custom attributes or hooks on HTTP spans:

```typescript
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new ExpressInstrumentation(),
    new HttpInstrumentation({
      requestHook: (span, request) => {
        // Add custom attributes to HTTP spans
        span.setAttribute('http.user_agent', request.headers['user-agent']);
        span.setAttribute('http.client_ip', request.socket.remoteAddress);
      },
      responseHook: (span, response) => {
        span.setAttribute('http.response_content_length',
                         response.headers['content-length']);
      },
    }),
  ],
});
```

### Creating Custom Spans

**Source**: [OpenTelemetry JS Metrics Documentation](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/metrics.md)

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('agent-sdk', '1.0.0');

async function runAgent(prompt: string) {
  // Create parent span for entire agent execution
  const span = tracer.startSpan('agent.execution', {
    attributes: {
      'agent.prompt_length': prompt.length,
      'agent.model': 'claude-sonnet-4-5',
    },
  });

  // Make this span active for nested operations
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // Your agent execution logic
      const result = await executeAgentInSandbox(prompt);

      // Add result attributes
      span.setAttributes({
        'agent.tokens.prompt': result.usage.promptTokens,
        'agent.tokens.completion': result.usage.completionTokens,
        'agent.cost.usd': result.cost,
        'agent.duration_ms': result.durationMs,
      });

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
      span.end();
    }
  });
}
```

### Custom Metrics

**Source**: [OpenTelemetry JS Metrics Documentation](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/metrics.md)

```typescript
import { metrics } from '@opentelemetry/api';

// Create meter for agent metrics
const meter = metrics.getMeter('agent-sdk', '1.0.0');

// Counter: Total number of agent executions
const executionCounter = meter.createCounter('agent.executions.total', {
  description: 'Total number of agent executions',
});

// Histogram: Agent execution duration distribution
const durationHistogram = meter.createHistogram('agent.duration.ms', {
  description: 'Agent execution duration in milliseconds',
  unit: 'ms',
});

// Counter: Token usage
const tokenCounter = meter.createCounter('agent.tokens.total', {
  description: 'Total tokens consumed',
});

// Counter: Cost tracking
const costCounter = meter.createCounter('agent.cost.usd', {
  description: 'Total cost in USD',
  unit: 'USD',
});

// Usage in agent execution
async function executeAgent(prompt: string) {
  const startTime = Date.now();

  try {
    const result = await runAgentInSandbox(prompt);
    const duration = Date.now() - startTime;

    // Record metrics
    executionCounter.add(1, {
      model: 'claude-sonnet-4-5',
      status: 'success'
    });

    durationHistogram.record(duration, {
      model: 'claude-sonnet-4-5'
    });

    tokenCounter.add(result.usage.totalTokens, {
      type: 'total',
      model: 'claude-sonnet-4-5'
    });

    tokenCounter.add(result.usage.promptTokens, {
      type: 'prompt',
      model: 'claude-sonnet-4-5'
    });

    tokenCounter.add(result.usage.completionTokens, {
      type: 'completion',
      model: 'claude-sonnet-4-5'
    });

    costCounter.add(result.cost, {
      model: 'claude-sonnet-4-5'
    });

    return result;
  } catch (error) {
    executionCounter.add(1, {
      model: 'claude-sonnet-4-5',
      status: 'error'
    });
    throw error;
  }
}
```

---

## Langfuse Integration

### Installation

```bash
npm install langfuse @langfuse/otel @langfuse/openai
```

### Langfuse + OpenTelemetry Setup

**Source**: [Langfuse JS SDK - OpenTelemetry Integration](https://context7.com/langfuse/langfuse-js/llms.txt)

```typescript
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { setLangfuseTracerProvider } from '@langfuse/tracing';

// Create tracer provider
const provider = new NodeTracerProvider();

// Configure Langfuse span processor
const langfuseProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',

  // Production: Batched mode (long-running processes)
  exportMode: 'batched',
  flushAt: 15,        // Batch 15 spans before flushing
  flushInterval: 10,  // Flush every 10 seconds

  // Serverless: Immediate mode (prevents data loss)
  // exportMode: 'immediate',
  // timeout: 5,

  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
});

provider.addSpanProcessor(langfuseProcessor);
provider.register();
setLangfuseTracerProvider(provider);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await langfuseProcessor.shutdown();
  console.log('Langfuse span processor shut down');
});
```

### Langfuse Manual Tracing

**Source**: [Langfuse JS SDK - Manual Observations](https://context7.com/langfuse/langfuse-js/llms.txt)

```typescript
import { startObservation } from '@langfuse/tracing';

async function runAgentWithLangfuse(prompt: string) {
  // Create agent observation
  const agent = startObservation('claude-agent', {
    input: { prompt },
    metadata: {
      model: 'claude-sonnet-4-5',
      temperature: 0.7,
      framework: 'claude-agent-sdk'
    }
  }, { asType: 'agent' });

  try {
    // Tool execution
    const toolSpan = startObservation('bash-tool', {
      input: { command: 'ls -la' },
      metadata: { sandbox_id: 'sandbox-123' }
    }, {
      asType: 'tool',
      parentSpanContext: agent.otelSpan.spanContext()
    });

    const toolResult = await executeTool('bash', { command: 'ls -la' });

    toolSpan.update({
      output: toolResult,
      metadata: { exit_code: 0 }
    });
    toolSpan.end();

    // LLM generation
    const generation = startObservation('claude-sonnet-4-5', {
      input: [{ role: 'user', content: prompt }],
      model: 'claude-sonnet-4-5',
      modelParameters: { temperature: 0.7, maxTokens: 4096 }
    }, {
      asType: 'generation',
      parentSpanContext: agent.otelSpan.spanContext()
    });

    const response = await callClaude(prompt);

    generation.update({
      output: { role: 'assistant', content: response.content },
      usageDetails: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      costDetails: {
        totalCost: calculateCost(response.usage),
        currency: 'USD'
      }
    });
    generation.end();

    // Complete agent execution
    agent.update({
      output: { result: response.content },
      metadata: {
        total_tools_used: 1,
        total_turns: 1
      }
    });
    agent.end();

    return response;
  } catch (error) {
    agent.update({
      output: { error: error.message },
      metadata: { failed: true }
    });
    agent.end();
    throw error;
  }
}
```

### Langfuse Active Context API

**Source**: [Langfuse JS SDK - Update Trace Metadata](https://context7.com/langfuse/langfuse-js/llms.txt)

```typescript
import {
  startActiveObservation,
  updateActiveTrace,
  updateActiveObservation
} from '@langfuse/tracing';

// Recommended: Active context API for nested operations
await startActiveObservation('agent-workflow', async (span) => {
  // Set trace-level metadata
  updateActiveTrace({
    name: 'agent-execution',
    userId: 'user-123',
    sessionId: 'session-456',
    tags: ['production', 'agent'],
    metadata: { version: 'v1.0', region: 'us-east-1' }
  });

  // Update current observation
  updateActiveObservation({
    output: { step: 'processing', status: 'in-progress' },
    metadata: { currentTool: 'bash' }
  });

  // Process work...
  await processAgent();

  return { success: true };
});
```

### Cost Calculation Helper

```typescript
// Based on Claude Sonnet 4.5 pricing (as of 2025)
const PRICING = {
  'claude-sonnet-4-5': {
    input: 0.003,   // $3 per 1M tokens
    output: 0.015,  // $15 per 1M tokens
  }
};

function calculateCost(usage: { input_tokens: number; output_tokens: number }, model = 'claude-sonnet-4-5') {
  const pricing = PRICING[model];
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}
```

---

## Express SSE Instrumentation

### Challenge: Async Middleware Limitations

**Source**: [OpenTelemetry Express Instrumentation](https://uptrace.dev/guides/opentelemetry-express)

The `@opentelemetry/instrumentation-express` module has a known limitation:

> Due to how Express works, it's hard to correctly compute the time taken by asynchronous middlewares and request handlers - the time reported still only represents synchronous execution time.

This means SSE endpoints (which are long-lived async connections) require **custom span instrumentation**.

### SSE Endpoint with Custom Spans

```typescript
import express from 'express';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const app = express();
const tracer = trace.getTracer('agent-sdk-sse', '1.0.0');

app.get('/api/agent/stream', async (req, res) => {
  // Create custom span for SSE session
  const sseSpan = tracer.startSpan('sse.session', {
    attributes: {
      'http.route': '/api/agent/stream',
      'http.method': 'GET',
      'sse.connection_type': 'server-sent-events',
    },
  });

  // Make span active for nested operations
  return context.with(trace.setSpan(context.active(), sseSpan), async () => {
    try {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let eventCount = 0;
      const startTime = Date.now();

      // Create span for agent execution
      const agentSpan = tracer.startSpan('agent.execution', {
        attributes: {
          'agent.prompt': req.query.prompt as string,
          'agent.model': 'claude-sonnet-4-5',
        },
      });

      // Run agent with streaming
      await runPythonAgentStreaming({
        prompt: req.query.prompt as string,
        onStream: {
          onText: (text) => {
            eventCount++;
            res.write(`event: text\ndata: ${JSON.stringify({ text })}\n\n`);
          },
          onToolUse: (id, name, input) => {
            eventCount++;

            // Create span for each tool execution
            const toolSpan = tracer.startSpan(`tool.${name}`, {
              attributes: {
                'tool.id': id,
                'tool.name': name,
                'tool.input': JSON.stringify(input),
              },
            });

            res.write(`event: tool_use\ndata: ${JSON.stringify({ id, name, input })}\n\n`);

            // Store span to end it in onToolResult
            req.app.locals[`tool_${id}`] = toolSpan;
          },
          onToolResult: (id, content) => {
            eventCount++;

            // End tool span
            const toolSpan = req.app.locals[`tool_${id}`];
            if (toolSpan) {
              toolSpan.setAttribute('tool.result_length', JSON.stringify(content).length);
              toolSpan.setStatus({ code: SpanStatusCode.OK });
              toolSpan.end();
              delete req.app.locals[`tool_${id}`];
            }

            res.write(`event: tool_result\ndata: ${JSON.stringify({ id, content })}\n\n`);
          },
          onResult: (result, durationMs, cost) => {
            eventCount++;

            // Update agent span with final metrics
            agentSpan.setAttributes({
              'agent.duration_ms': durationMs,
              'agent.cost.usd': cost,
              'agent.tokens.total': result.usage?.totalTokens || 0,
            });
            agentSpan.setStatus({ code: SpanStatusCode.OK });
            agentSpan.end();

            res.write(`event: result\ndata: ${JSON.stringify({ result, durationMs, cost })}\n\n`);
          },
        },
      });

      // Update SSE span with session metrics
      const totalDuration = Date.now() - startTime;
      sseSpan.setAttributes({
        'sse.events_sent': eventCount,
        'sse.duration_ms': totalDuration,
        'sse.status': 'completed',
      });
      sseSpan.setStatus({ code: SpanStatusCode.OK });

      res.end();
    } catch (error) {
      sseSpan.recordException(error);
      sseSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    } finally {
      sseSpan.end();
    }
  });
});
```

### SSE Metrics

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('agent-sdk-sse', '1.0.0');

// Counter: SSE connections
const sseConnections = meter.createCounter('sse.connections.total', {
  description: 'Total SSE connections established',
});

// Histogram: SSE session duration
const sseDuration = meter.createHistogram('sse.session.duration.ms', {
  description: 'SSE session duration in milliseconds',
  unit: 'ms',
});

// Counter: SSE events sent
const sseEvents = meter.createCounter('sse.events.total', {
  description: 'Total SSE events sent',
});

// Usage
app.get('/api/agent/stream', async (req, res) => {
  sseConnections.add(1, { route: '/api/agent/stream' });

  const startTime = Date.now();
  let eventCount = 0;

  // ... SSE logic

  eventCount++;
  sseEvents.add(1, { event_type: 'text' });

  // On completion
  const duration = Date.now() - startTime;
  sseDuration.record(duration, { route: '/api/agent/stream' });
});
```

---

## Trace Context Propagation

### Cross-Language Propagation (Node.js → Python)

**Source**: [OpenTelemetry Context Propagation](https://opentelemetry.io/docs/concepts/context-propagation/)

OpenTelemetry uses the **W3C TraceContext** standard for propagating trace information across service boundaries. This works seamlessly between Node.js and Python.

#### W3C TraceContext Format

The `traceparent` header format:
```
traceparent: 00-<trace-id>-<parent-span-id>-<trace-flags>
```

Example:
```
traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
```

- `00`: Version
- `0af7651916cd43dd8448eb211c80319c`: Trace ID (128-bit)
- `b7ad6b7169203331`: Parent Span ID (64-bit)
- `01`: Trace flags (sampled)

### Injecting Trace Context (Node.js → E2B Sandbox)

**Source**: [OpenTelemetry JS Propagation](https://opentelemetry.io/docs/languages/js/propagation/)

```typescript
import { trace, context, propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { Sandbox } from '@e2b/code-interpreter';

// Configure W3C propagator (default in most cases)
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

async function runAgentWithTracing(prompt: string) {
  const tracer = trace.getTracer('agent-sdk');
  const span = tracer.startSpan('agent.execution');

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // Create E2B sandbox
      const sandbox = await Sandbox.create({
        template: process.env.E2B_TEMPLATE_ID,
        timeoutMs: 120000,
      });

      // Inject trace context into carrier (headers object)
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      // Pass trace context as environment variable to sandbox
      const traceParent = carrier.traceparent || '';
      const traceState = carrier.tracestate || '';

      // Execute agent with trace context
      const execution = await sandbox.commands.run(
        `export TRACEPARENT="${traceParent}" && ` +
        `export TRACESTATE="${traceState}" && ` +
        `python /home/user/run_agent.py "${JSON.stringify(prompt).replace(/"/g, '\\"')}"`
      );

      span.setAttributes({
        'sandbox.id': sandbox.sandboxId,
        'agent.exit_code': execution.exitCode,
      });

      if (execution.exitCode === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      return execution;
    } finally {
      span.end();
    }
  });
}
```

### Extracting Trace Context (Python - E2B Sandbox)

**Source**: [OpenTelemetry Python Propagation](https://uptrace.dev/get/opentelemetry-python/propagation)

Inside the E2B sandbox, extract the trace context:

```python
import os
from opentelemetry import trace, context
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

# Extract trace context from environment variables
carrier = {
    'traceparent': os.environ.get('TRACEPARENT', ''),
    'tracestate': os.environ.get('TRACESTATE', ''),
}

# Extract context
ctx = TraceContextTextMapPropagator().extract(carrier=carrier)

# Create child span
tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span('agent.python_execution', context=ctx) as span:
    span.set_attribute('agent.language', 'python')
    span.set_attribute('sandbox.environment', 'e2b')

    # Execute agent logic
    result = run_agent()

    span.set_attribute('agent.result_length', len(result))
```

### Automatic Propagation (HTTP Requests)

**Source**: [OpenTelemetry Context Propagation](https://uptrace.dev/opentelemetry/context-propagation)

When making HTTP requests between services:

**Node.js (auto-instrumented)**:
```typescript
import fetch from 'node-fetch';

// HTTP instrumentation automatically injects traceparent header
const response = await fetch('https://api.example.com/data');
```

**Python (auto-instrumented)**:
```python
import requests

# Requests instrumentation automatically injects traceparent header
response = requests.get('https://api.example.com/data')
```

No manual carrier injection needed for HTTP!

---

## E2B Sandbox Observability

### E2B Built-in Features

**Source**: [E2B Production Recommendations](https://e2b.dev/docs/byoc), [OpenTelemetry Blog - AI Agent Observability](https://opentelemetry.io/blog/2025/ai-agent-observability/)

E2B provides basic observability:

1. **Logs**: Real-time log streaming via `sandbox.commands.run()` stdout/stderr
2. **Metrics**: Anonymized CPU/memory usage sent to E2B control plane
3. **Monitoring**: Dashboard for sandbox lifecycle events

However, E2B does **not** provide:
- Distributed tracing integration
- Custom metrics export
- OpenTelemetry SDK out-of-the-box

### Recommended E2B Instrumentation Pattern

```typescript
import { trace, metrics } from '@opentelemetry/api';
import { Sandbox } from '@e2b/code-interpreter';

const tracer = trace.getTracer('e2b-sandbox');
const meter = metrics.getMeter('e2b-sandbox');

// Metrics
const sandboxCreationDuration = meter.createHistogram('e2b.sandbox.creation.duration.ms');
const sandboxExecutionDuration = meter.createHistogram('e2b.sandbox.execution.duration.ms');
const sandboxCostCounter = meter.createCounter('e2b.sandbox.cost.usd');

async function createInstrumentedSandbox() {
  const span = tracer.startSpan('e2b.sandbox.create');
  const startTime = Date.now();

  try {
    const sandbox = await Sandbox.create({
      template: process.env.E2B_TEMPLATE_ID,
      timeoutMs: 120000,
    });

    const duration = Date.now() - startTime;

    span.setAttributes({
      'sandbox.id': sandbox.sandboxId,
      'sandbox.template_id': process.env.E2B_TEMPLATE_ID,
      'sandbox.creation_duration_ms': duration,
    });

    sandboxCreationDuration.record(duration, {
      template_id: process.env.E2B_TEMPLATE_ID,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    return sandbox;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}

async function executeSandboxCommand(sandbox: Sandbox, command: string) {
  const span = tracer.startSpan('e2b.sandbox.execute', {
    attributes: {
      'sandbox.id': sandbox.sandboxId,
      'sandbox.command': command.substring(0, 100), // Truncate for safety
    },
  });

  const startTime = Date.now();

  try {
    const execution = await sandbox.commands.run(command);
    const duration = Date.now() - startTime;

    span.setAttributes({
      'sandbox.exit_code': execution.exitCode,
      'sandbox.stdout_length': execution.stdout.length,
      'sandbox.stderr_length': execution.stderr.length,
      'sandbox.execution_duration_ms': duration,
    });

    sandboxExecutionDuration.record(duration, {
      exit_code: execution.exitCode.toString(),
    });

    // Calculate E2B cost (example: $0.000014/vCPU/second)
    // Assumes 2 vCPU template
    const costUsd = (duration / 1000) * 2 * 0.000014;
    sandboxCostCounter.add(costUsd);

    if (execution.exitCode === 0) {
      span.setStatus({ code: SpanStatusCode.OK });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `Exit code: ${execution.exitCode}`
      });
    }

    return execution;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

---

## Implementation Patterns

### Pattern 1: Full-Stack Instrumentation

```typescript
// tracing.ts - Centralized observability setup
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function setupObservability() {
  const provider = new NodeTracerProvider();

  // Add Langfuse span processor
  const langfuseProcessor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    exportMode: 'batched',
    flushAt: 15,
    flushInterval: 10,
  });
  provider.addSpanProcessor(langfuseProcessor);
  provider.register();

  // Initialize SDK with Prometheus exporter
  const sdk = new opentelemetry.NodeSDK({
    metricReader: new PrometheusExporter({ port: 9464 }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log('✅ Observability initialized (OpenTelemetry + Langfuse + Prometheus)');

  return { sdk, langfuseProcessor };
}

// Graceful shutdown
export async function shutdownObservability(sdk: any, langfuseProcessor: any) {
  await langfuseProcessor.shutdown();
  await sdk.shutdown();
  console.log('✅ Observability shut down gracefully');
}
```

```typescript
// server.ts - Express server with observability
import express from 'express';
import { setupObservability, shutdownObservability } from './tracing';

const { sdk, langfuseProcessor } = setupObservability();

const app = express();

app.get('/api/agent/stream', async (req, res) => {
  // SSE instrumentation (see Express SSE section above)
});

const server = app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
  console.log('📊 Prometheus metrics: http://localhost:9464/metrics');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down...');
  server.close();
  await shutdownObservability(sdk, langfuseProcessor);
  process.exit(0);
});
```

### Pattern 2: Streaming Agent with Full Observability

```typescript
import { trace, context, SpanStatusCode, metrics } from '@opentelemetry/api';
import { startObservation, updateActiveObservation } from '@langfuse/tracing';

const tracer = trace.getTracer('agent-sdk', '1.0.0');
const meter = metrics.getMeter('agent-sdk', '1.0.0');

const tokenCounter = meter.createCounter('agent.tokens.total');
const costCounter = meter.createCounter('agent.cost.usd');
const toolCounter = meter.createCounter('agent.tools.executed');

export async function runAgentWithObservability(prompt: string) {
  // OpenTelemetry span
  const otelSpan = tracer.startSpan('agent.execution', {
    attributes: {
      'agent.prompt_length': prompt.length,
      'agent.model': 'claude-sonnet-4-5',
    },
  });

  // Langfuse observation
  const langfuseAgent = startObservation('claude-agent', {
    input: { prompt },
    metadata: { model: 'claude-sonnet-4-5', framework: 'agent-sdk' }
  }, { asType: 'agent' });

  return context.with(trace.setSpan(context.active(), otelSpan), async () => {
    try {
      let totalTokens = 0;
      let totalCost = 0;
      let toolsExecuted = 0;

      const result = await runPythonAgentStreaming({
        prompt,
        onStream: {
          onText: (text) => {
            console.log('💬', text);
          },
          onThinking: (thinking) => {
            console.log('🤔', thinking);
          },
          onToolUse: (id, name, input) => {
            toolsExecuted++;
            toolCounter.add(1, { tool_name: name });

            // Create Langfuse tool observation
            const toolSpan = startObservation(`tool.${name}`, {
              input,
              metadata: { tool_id: id }
            }, {
              asType: 'tool',
              parentSpanContext: langfuseAgent.otelSpan.spanContext()
            });

            // Store for later update in onToolResult
            (global as any)[`tool_${id}`] = toolSpan;
          },
          onToolResult: (id, content) => {
            // Update Langfuse tool observation
            const toolSpan = (global as any)[`tool_${id}`];
            if (toolSpan) {
              toolSpan.update({ output: content });
              toolSpan.end();
              delete (global as any)[`tool_${id}`];
            }
          },
          onResult: (result, durationMs, cost) => {
            totalCost = cost;
            totalTokens = result.usage?.totalTokens || 0;

            // Update metrics
            tokenCounter.add(totalTokens, { model: 'claude-sonnet-4-5' });
            costCounter.add(totalCost, { model: 'claude-sonnet-4-5' });

            // Update OpenTelemetry span
            otelSpan.setAttributes({
              'agent.duration_ms': durationMs,
              'agent.cost.usd': totalCost,
              'agent.tokens.total': totalTokens,
              'agent.tools.executed': toolsExecuted,
            });

            // Update Langfuse observation
            langfuseAgent.update({
              output: { result: result.content },
              usageDetails: {
                totalTokens,
                promptTokens: result.usage?.promptTokens || 0,
                completionTokens: result.usage?.completionTokens || 0,
              },
              costDetails: { totalCost, currency: 'USD' },
              metadata: {
                durationMs,
                toolsExecuted,
                success: true
              }
            });
          },
        },
      });

      otelSpan.setStatus({ code: SpanStatusCode.OK });
      langfuseAgent.end();

      return result;
    } catch (error) {
      otelSpan.recordException(error);
      otelSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      langfuseAgent.update({
        output: { error: error.message },
        metadata: { failed: true }
      });
      langfuseAgent.end();

      throw error;
    } finally {
      otelSpan.end();
    }
  });
}
```

---

## Cost Tracking

### Token and Cost Attribution

```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
}

const MODEL_PRICING = {
  'claude-sonnet-4-5': {
    input: 0.003,   // $3 per 1M input tokens
    output: 0.015,  // $15 per 1M output tokens
  },
  'claude-opus-4-5': {
    input: 0.015,   // $15 per 1M input tokens
    output: 0.075,  // $75 per 1M output tokens
  },
};

function calculateCost(usage: TokenUsage, model: string): CostBreakdown {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-5'];

  const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    currency: 'USD',
  };
}

// Usage with metrics
const costBreakdown = calculateCost(usage, 'claude-sonnet-4-5');

costCounter.add(costBreakdown.inputCost, {
  model: 'claude-sonnet-4-5',
  token_type: 'input'
});

costCounter.add(costBreakdown.outputCost, {
  model: 'claude-sonnet-4-5',
  token_type: 'output'
});

// Add to span attributes
span.setAttributes({
  'agent.cost.input_usd': costBreakdown.inputCost,
  'agent.cost.output_usd': costBreakdown.outputCost,
  'agent.cost.total_usd': costBreakdown.totalCost,
});
```

### E2B Sandbox Cost Tracking

```typescript
// E2B pricing: $0.000014 per vCPU per second
const E2B_COST_PER_VCPU_PER_SECOND = 0.000014;

function calculateSandboxCost(durationMs: number, vCPUs: number = 2): number {
  const durationSeconds = durationMs / 1000;
  return durationSeconds * vCPUs * E2B_COST_PER_VCPU_PER_SECOND;
}

// Track in span
const sandboxCost = calculateSandboxCost(execution.durationMs, 2);
span.setAttribute('sandbox.cost.usd', sandboxCost);

// Track in metrics
sandboxCostCounter.add(sandboxCost, {
  template_id: process.env.E2B_TEMPLATE_ID,
  vcpus: '2',
});
```

---

## Production Best Practices

### 1. Sampling Strategy

**Source**: [OpenTelemetry Best Practices](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)

```typescript
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new opentelemetry.NodeSDK({
  // Sample 10% of traces in production
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(0.1),
  }),
  // ... other config
});
```

### 2. Resource Attributes

Add semantic attributes for better filtering:

```typescript
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'agent-sdk',
  [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  'service.namespace': 'ai-agents',
  'service.instance.id': process.env.HOSTNAME || 'local',
});

const sdk = new opentelemetry.NodeSDK({
  resource,
  // ... other config
});
```

### 3. Span Limits

Prevent memory issues with large spans:

```typescript
import { SpanLimits } from '@opentelemetry/sdk-trace-base';

const spanLimits: SpanLimits = {
  attributeValueLengthLimit: 1024,       // Max 1KB attribute values
  attributeCountLimit: 128,              // Max 128 attributes per span
  eventCountLimit: 128,                  // Max 128 events per span
  linkCountLimit: 128,                   // Max 128 links per span
  attributePerEventCountLimit: 128,      // Max 128 attributes per event
  attributePerLinkCountLimit: 128,       // Max 128 attributes per link
};

const provider = new NodeTracerProvider({
  spanLimits,
});
```

### 4. Error Handling

Always record exceptions in spans:

```typescript
try {
  await riskyOperation();
} catch (error) {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message
  });
  throw error; // Re-throw for caller
}
```

### 5. Graceful Shutdown

Ensure all telemetry is exported before exit:

```typescript
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);

  // Close server
  server.close();

  // Flush all telemetry
  await langfuseProcessor.shutdown();
  await sdk.shutdown();

  console.log('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 6. Environment-Specific Configuration

```typescript
const isProduction = process.env.NODE_ENV === 'production';

const sdk = new opentelemetry.NodeSDK({
  // Production: Batch and sample
  traceExporter: isProduction
    ? new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_URL })
    : new ConsoleSpanExporter(),

  sampler: isProduction
    ? new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) })
    : new AlwaysOnSampler(),

  // Production: Prometheus, Dev: Console
  metricReader: isProduction
    ? new PrometheusExporter({ port: 9464 })
    : new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: 5000,
      }),
});
```

---

## References

### OpenTelemetry Documentation

- [OpenTelemetry Official Site](https://opentelemetry.io/)
- [OpenTelemetry JavaScript Client (GitHub)](https://github.com/open-telemetry/opentelemetry-js)
- [Node.js Getting Started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [OpenTelemetry Best Practices (Better Stack)](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)
- [AI Agent Observability Blog](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Context Propagation Concepts](https://opentelemetry.io/docs/concepts/context-propagation/)
- [OpenTelemetry Express Instrumentation (Uptrace)](https://uptrace.dev/guides/opentelemetry-express)
- [OpenTelemetry Context Propagation Guide (Uptrace)](https://uptrace.dev/opentelemetry/context-propagation)

### Langfuse Documentation

- [Langfuse JS/TS SDKs (GitHub)](https://github.com/langfuse/langfuse-js)
- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse TypeScript SDK (LLMs.txt)](https://context7.com/langfuse/langfuse-js/llms.txt)

### E2B Documentation

- [E2B Official Site](https://e2b.dev/)
- [E2B Documentation](https://e2b.dev/docs/byoc)
- [E2B GitHub Repository](https://github.com/e2b-dev/E2B)

### Express and SSE

- [Express OpenTelemetry Instrumentation (SigNoz)](https://signoz.io/docs/instrumentation/opentelemetry-express/)
- [@opentelemetry/instrumentation-express (npm)](https://www.npmjs.com/package/@opentelemetry/instrumentation-express)

### Prometheus

- [OpenTelemetry Prometheus Exporter](https://www.npmjs.com/package/@opentelemetry/exporter-prometheus)

### Related Research

- [RESEARCH_FINDINGS.md](/Users/harrisonwells/claude-agent-sdk-experiments/RESEARCH_FINDINGS.md) - Claude Agent SDK research
- [E2B_PRODUCTION_RECOMMENDATIONS.md](/Users/harrisonwells/claude-agent-sdk-experiments/docs/E2B_PRODUCTION_RECOMMENDATIONS.md) - E2B capabilities and patterns
- [FEATURE_PRIORITIES.md](/Users/harrisonwells/claude-agent-sdk-experiments/FEATURE_PRIORITIES.md) - Roadmap including observability features

---

## Next Steps

Based on this research, the recommended implementation order is:

1. **Phase 1 - Foundation** (Week 1)
   - Install OpenTelemetry packages
   - Set up basic SDK with auto-instrumentation
   - Add Prometheus exporter for metrics
   - Create centralized `tracing.ts` module

2. **Phase 2 - Custom Instrumentation** (Week 1-2)
   - Add custom spans for agent execution
   - Instrument SSE endpoints with custom spans
   - Create custom metrics (tokens, cost, latency)
   - Add E2B sandbox instrumentation

3. **Phase 3 - Langfuse Integration** (Week 2)
   - Add Langfuse span processor
   - Instrument agent observations (agent, tool, generation types)
   - Integrate cost tracking with Langfuse
   - Test batched vs. immediate export modes

4. **Phase 4 - Trace Propagation** (Week 2-3)
   - Implement W3C TraceContext injection for E2B sandboxes
   - Add Python-side trace extraction (if custom Python agent)
   - Test end-to-end trace continuity

5. **Phase 5 - Production Hardening** (Week 3)
   - Configure sampling strategies
   - Add resource attributes and span limits
   - Implement graceful shutdown
   - Set up environment-specific configs
   - Create observability dashboard templates

6. **Phase 6 - Documentation** (Week 3)
   - Write integration guides
   - Document custom metrics and span attributes
   - Create troubleshooting playbook
   - Add example queries for Langfuse/Prometheus

---

**Research compiled by**: Claude Sonnet 4.5 (Framework Documentation Researcher)
**Project**: Claude Agent SDK Experiments
**Last Updated**: 2026-01-04
