# Tiered Agent System: Implementation Plan

> **Goal**: Build a simplified SDK where users write `runAgent({ prompt: '...', model: 'haiku' })` and everything just works.

**Created**: 2026-01-05
**Estimated Effort**: 20-30 hours (3-4 focused days)

---

## 🎯 What We're Building

### User Experience

**Before** (current):
```typescript
// Must use different functions for different use cases
await runPythonAgent({ prompt: '...' })
await runPythonAgentStreaming({ prompt: '...', onStream: {...} })
await runPythonAgentDetailed({ prompt: '...' })

// No model selection (hardcoded to Sonnet)
// No resource optimization (all agents use 2 vCPU, 4GB RAM)
// Manual template management
```

**After** (new):
```typescript
// One function, auto-detects everything
await runAgent({
  prompt: 'What is 2+2?',
  model: 'haiku',  // Auto-selects quick template (1 vCPU, 512MB) → 50% cost savings
})

await runAgent({
  prompt: 'Analyze this codebase',
  model: 'sonnet',  // Auto-selects medium template (2 vCPU, 4GB) → balanced
  onStream: { onText: (text) => {} },  // Auto-enables streaming
})

await runAgent({
  prompt: 'Process large dataset with pandas',
  model: 'opus',  // Auto-selects heavy template (4 vCPU, 8GB) → powerful
  verbose: true,  // See cost breakdown
})
```

---

## 📋 Implementation Phases

### Phase 1: Create Tiered Templates ⚙️

**What**: Build 3 E2B templates with different resource profiles

**Why**: Right-size resources for different task complexities = cost savings

**Tiers**:

| Tier | Model | vCPU | RAM | Cost/hr | Use Case |
|------|-------|------|-----|---------|----------|
| **Quick** | Haiku | 1 | 512MB | $0.05 | Simple queries, file ops |
| **Medium** | Sonnet | 2 | 4GB | $0.10 | Code analysis (current) |
| **Heavy** | Opus | 4 | 8GB | $0.20 | Data processing, ML |

**Tasks**:

1. **Create `agents/quick/`** directory
   - Copy `agents/base/*` → `agents/quick/`
   - Edit `template.py`: Remove Braintrust, OpenTelemetry (minimal deps)
   - Edit `e2b.toml`: Set `cpu_count = 1`, `memory_mb = 512`
   - Edit `build_dev.py`: Alias = `claude-agent-quick-dev`

2. **Rename `agents/base/`** → `agents/medium/`
   - Keep all files as-is (no changes to deps)
   - Update `build_dev.py`: Alias = `claude-agent-medium-dev`

3. **Create `agents/heavy/`** directory
   - Copy `agents/medium/*` → `agents/heavy/`
   - Edit `template.py`: Add pandas, numpy, matplotlib, seaborn, scipy, scikit-learn
   - Edit `e2b.toml`: Set `cpu_count = 4`, `memory_mb = 8192`
   - Edit `build_dev.py`: Alias = `claude-agent-heavy-dev`

4. **Create build script** `scripts/build-all-templates.sh`
   - Builds all 3 templates
   - Saves IDs to `.env`:
     ```bash
     E2B_QUICK_TEMPLATE_ID=abc123
     E2B_TEMPLATE_ID=def456        # medium (backward compatible)
     E2B_HEAVY_TEMPLATE_ID=ghi789
     ```

5. **Update `package.json`**
   ```json
   {
     "scripts": {
       "build:templates": "./scripts/build-all-templates.sh"
     }
   }
   ```

**Deliverable**: 3 working templates, all built and IDs saved to `.env`

---

### Phase 2: Add Model Selection 🤖

**What**: Support haiku/sonnet/opus model selection in SDK

**Why**: Users want to choose model based on task complexity/cost

**Tasks**:

1. **Add Haiku pricing** to `examples/lib/cost-tracking.ts`
   ```typescript
   'claude-haiku-4-0-20250604': {
     promptTokens: 0.25,
     completionTokens: 1.25,
     cachedTokens: 0.025,
   }
   ```

2. **Create `examples/lib/model-resolver.ts`**
   - Map aliases to full IDs: `haiku` → `claude-haiku-4-0-20250604`
   - Function: `resolveModel(model?: string): string`
   - Default: `claude-sonnet-4-5-20250929`

3. **Update Python agent code** in `examples/lib/agent.ts` (3 places)
   - Lines 113-191: `runPythonAgent()`
   - Lines 366-426: `runPythonAgentDetailed()`
   - Lines 555-630: `runPythonAgentStreaming()`

   Change:
   ```python
   from claude_agent_sdk import query, ClaudeAgentOptions

   options = ClaudeAgentOptions(model="${resolvedModel}")
   async for msg in query(prompt=prompt, options=options):
       # ...
   ```

4. **Update cost tracking calls** (2 places)
   - Line 275: Non-streaming
   - Line 753: Streaming

   Replace:
   ```typescript
   calculateCost('claude-sonnet-4-5-20250929', ...)
   ```
   With:
   ```typescript
   calculateCost(resolvedModel, ...)
   ```

**Deliverable**: Model selection works, costs calculated correctly for all models

---

### Phase 3: Create Template Selector 🎯

**What**: Auto-select template based on model choice

**Why**: Users shouldn't need to understand both models AND templates

**Mapping**:
- `haiku` → quick template (1 vCPU)
- `sonnet` → medium template (2 vCPU)
- `opus` → heavy template (4 vCPU)

**Tasks**:

1. **Create `examples/lib/template-selector.ts`**
   ```typescript
   export type TemplateType = 'quick' | 'medium' | 'heavy'

   export interface TemplateConfig {
     id: string
     cpuCount: number
     memoryMb: number
     costPerHour: number
   }

   export const TEMPLATES: Record<TemplateType, TemplateConfig> = {
     quick: {
       id: process.env.E2B_QUICK_TEMPLATE_ID!,
       cpuCount: 1,
       memoryMb: 512,
       costPerHour: 0.05,
     },
     medium: {
       id: process.env.E2B_TEMPLATE_ID!,
       cpuCount: 2,
       memoryMb: 4096,
       costPerHour: 0.10,
     },
     heavy: {
       id: process.env.E2B_HEAVY_TEMPLATE_ID!,
       cpuCount: 4,
       memoryMb: 8192,
       costPerHour: 0.20,
     },
   }

   export function getTemplateFromModel(model: string): TemplateConfig {
     if (model.includes('haiku')) return TEMPLATES.quick
     if (model.includes('opus')) return TEMPLATES.heavy
     return TEMPLATES.medium  // sonnet or default
   }
   ```

**Deliverable**: Template automatically selected based on model

---

### Phase 4: Build Unified `runAgent()` Function 🚀

**What**: Single function that consolidates all existing functions

**Why**: Eliminate 70% code duplication, simpler API

**Tasks**:

1. **Add `UnifiedAgentConfig` interface** to `examples/lib/agent.ts`
   ```typescript
   export interface UnifiedAgentConfig {
     // Required
     prompt: string

     // Execution
     model?: string              // 'haiku', 'sonnet', 'opus'
     timeout?: number

     // Output
     onStream?: StreamCallbacks  // Auto-enables streaming
     detailed?: boolean

     // Session
     sessionId?: string

     // Observability
     observability?: {
       enabled?: boolean
       mode?: 'batch' | 'realtime'
       sample?: number
     }

     // Advanced
     templateType?: TemplateType  // Override auto-selection
     verbose?: boolean
   }
   ```

2. **Add `AgentResponse` interface**
   ```typescript
   export interface AgentResponse {
     result: string
     execution?: { exitCode, stdout, stderr, durationMs }
     cost?: CostBreakdown
     trace?: { traceId, traceUrl }
     session?: { sessionId, turnCount }
   }
   ```

3. **Implement `runAgent()` function**
   - Extract common logic into helpers:
     - `createExecutionContext()` - Setup sandbox, observability
     - `executeAgent()` - Single execution path
     - `buildResponse()` - Format response
   - Auto-detect streaming from `onStream` presence
   - Auto-select template from model
   - Resolve model alias to full ID

4. **Create backward compatibility wrappers**
   ```typescript
   export async function runPythonAgent(config: AgentConfig): Promise<string> {
     const response = await runAgent(config)
     return response.result
   }

   export async function runPythonAgentStreaming(config: StreamingAgentConfig): Promise<string> {
     const response = await runAgent(config)
     return response.result
   }

   export async function runPythonAgentDetailed(config: AgentConfig): Promise<AgentResult> {
     const response = await runAgent({ ...config, detailed: true })
     return {
       stdout: response.execution!.stdout,
       stderr: response.execution!.stderr,
       exitCode: response.execution!.exitCode,
     }
   }
   ```

**Deliverable**: `runAgent()` works, old functions still work via wrappers

---

### Phase 5: Update Examples & Documentation 📚

**What**: Show users how to use the new system

**Tasks**:

1. **Create `examples/tiered_agent_example.ts`**
   - Show all 3 tiers in action
   - Compare costs
   - Demonstrate auto-selection

2. **Update existing examples**
   - `examples/basic_typescript.ts` → use `runAgent()`
   - `examples/console_streaming_example.ts` → use `runAgent()`
   - `examples/streaming_example.ts` → use `runAgent()`

3. **Update `.env.example`**
   ```bash
   # E2B Templates (auto-generated by build:templates)
   E2B_QUICK_TEMPLATE_ID=   # 1 vCPU, 512MB (Haiku)
   E2B_TEMPLATE_ID=         # 2 vCPU, 4GB (Sonnet)
   E2B_HEAVY_TEMPLATE_ID=   # 4 vCPU, 8GB (Opus)
   ```

4. **Update `README.md`**
   - Add "Model Selection" section
   - Add "Tiered Templates" section
   - Show cost comparison table

5. **Update `CLAUDE.md`**
   - Document `runAgent()` API
   - Update SDK reference

6. **Create `docs/TIERED_AGENT_SYSTEM.md`**
   - Comprehensive guide on tiers
   - When to use each tier
   - Cost implications
   - Advanced: manual template override

**Deliverable**: Clear documentation, working examples

---

## 🧪 Testing Checklist

### Template Tests

- [ ] Build all 3 templates successfully
- [ ] Template IDs saved to `.env`
- [ ] Quick template uses 1 vCPU
- [ ] Medium template uses 2 vCPU
- [ ] Heavy template uses 4 vCPU

### Model Selection Tests

- [ ] Haiku model works
- [ ] Sonnet model works (default)
- [ ] Opus model works
- [ ] Model aliases resolve correctly
- [ ] Cost tracking accurate for all models

### Template Auto-Selection Tests

- [ ] Haiku → quick template
- [ ] Sonnet → medium template
- [ ] Opus → heavy template

### API Tests

- [ ] `runAgent({ prompt })` works (minimal config)
- [ ] `runAgent({ prompt, model: 'haiku' })` works
- [ ] Streaming auto-enables from `onStream`
- [ ] Old API functions still work

### Integration Tests

- [ ] Braintrust logs include model name
- [ ] Cost breakdown shows correct tier
- [ ] All examples run successfully
- [ ] Backward compatibility maintained

---

## 📦 File Changes Summary

### New Files (13)

**Templates**:
1. `agents/quick/template.py`
2. `agents/quick/build_dev.py`
3. `agents/quick/e2b.toml`
4. `agents/quick/README.md`
5. `agents/heavy/template.py`
6. `agents/heavy/build_dev.py`
7. `agents/heavy/e2b.toml`
8. `agents/heavy/README.md`

**SDK**:
9. `examples/lib/model-resolver.ts`
10. `examples/lib/template-selector.ts`

**Examples**:
11. `examples/tiered_agent_example.ts`

**Documentation**:
12. `docs/TIERED_AGENT_SYSTEM.md`

**Scripts**:
13. `scripts/build-all-templates.sh`

### Modified Files (8)

1. `examples/lib/agent.ts` - Add `runAgent()`, model selection
2. `examples/lib/cost-tracking.ts` - Add Haiku pricing
3. `agents/medium/build_dev.py` - Update alias
4. `agents/medium/README.md` - Update description
5. `.env.example` - Add template IDs
6. `package.json` - Add build scripts
7. `README.md` - Add tiered system docs
8. `CLAUDE.md` - Update SDK reference

---

## 🎯 Success Metrics

✅ **Simplicity**: `runAgent({ prompt: '...', model: 'haiku' })` works
✅ **Cost Savings**: Quick tier 50% cheaper ($0.05/hr vs $0.10/hr)
✅ **Backward Compatible**: All existing code works
✅ **Auto-Magic**: Streaming, templates, observability auto-enabled
✅ **Clear Docs**: Users understand when to use each tier

---

## ⚠️ Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Template builds fail | Test on clean environment first |
| Existing code breaks | Comprehensive backward compatibility wrappers |
| Cost tracking wrong | Extensive unit tests for pricing |
| E2B limits exceeded | Document concurrent sandbox limits |

---

## 📅 Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1: Templates | 4-6 hours | Create 3 templates, build scripts |
| Phase 2: Model Selection | 2-3 hours | Add pricing, update Python code |
| Phase 3: Template Selector | 1-2 hours | Auto-selection logic |
| Phase 4: Unified API | 6-8 hours | `runAgent()`, wrappers, testing |
| Phase 5: Documentation | 3-4 hours | Examples, guides, README |

**Total**: 20-30 hours (3-4 focused days)

---

## 🚀 Post-Launch Enhancements

**Phase 6** (Future):
- Template pooling (reuse sandboxes for cost savings)
- WebSocket streaming (bidirectional communication)
- Auto-scaling resources based on load
- Multi-model conversations (start Haiku, upgrade to Opus if needed)
- Custom templates via `/create-e2b-agent` skill

---

## 🎬 Getting Started

Once approved, we'll start with:

1. **Phase 1: Templates** - Build the foundation
2. **Quick Win**: Test quick template with Haiku → see cost savings
3. **Phase 2-4**: Add model selection, template selector, unified API
4. **Phase 5**: Polish docs and examples

**First command after approval**:
```bash
# Start with Phase 1
mkdir -p agents/quick agents/heavy scripts
```

---

**Ready to proceed?** Let me know if you'd like to adjust anything in the plan before we start building!
