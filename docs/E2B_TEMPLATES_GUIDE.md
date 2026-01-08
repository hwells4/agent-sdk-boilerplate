# E2B Templates: Complete Guide

> Everything you need to know about E2B sandbox templates, from single-template projects to advanced multi-template architectures

**Last Updated:** 2026-01-05

---

## Table of Contents

1. [What Are E2B Templates?](#what-are-e2b-templates)
2. [Current Architecture](#current-architecture)
3. [Single Template vs Multiple Templates](#single-template-vs-multiple-templates)
4. [When to Create Multiple Templates](#when-to-create-multiple-templates)
5. [How to Create Additional Templates](#how-to-create-additional-templates)
6. [Template Organization](#template-organization)
7. [Choosing Templates at Runtime](#choosing-templates-at-runtime)
8. [Template Management](#template-management)
9. [Best Practices](#best-practices)
10. [Examples](#examples)

---

## What Are E2B Templates?

### Conceptual Overview

Think of E2B templates like **Docker images for sandboxes**:

- A template is a **snapshot** of a configured container with pre-installed dependencies
- Templates are **built once**, then **reused** many times
- Each agent execution **creates a new sandbox** from the template
- Sandboxes are **ephemeral** (destroyed after use)
- Templates are **persistent** (stay in E2B cloud until deleted)

### Analogy

```
Docker Image          ↔  E2B Template
docker build .        ↔  npm run build:template
docker run            ↔  Sandbox.create(templateId)
Container             ↔  E2B Sandbox
Dockerfile            ↔  template.py
```

### Key Properties

| Property | Description |
|----------|-------------|
| **Build Time** | ~30 seconds to build and upload |
| **Cost** | Free to build, store (pay only for sandbox runtime) |
| **Storage** | Templates stored in E2B cloud indefinitely |
| **Reusability** | One template → unlimited sandbox instances |
| **Isolation** | Each sandbox gets fresh copy of template |
| **Modification** | Rebuild template to change dependencies |

---

## Current Architecture

### Single Template Setup

This project currently uses **one template** for all agents:

```
agents/
└── base/
    ├── template.py       # Template definition (Python)
    ├── build_dev.py      # Build script
    ├── Dockerfile        # Container configuration (optional)
    └── e2b.toml          # Resource limits (CPU, RAM)
```

### What's In The Template

**File:** `agents/base/template.py`

```python
from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")  # Base image
    # System tools
    .run_cmd("sudo apt-get update && sudo apt-get install -y curl git ripgrep")
    # Claude Code CLI
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    # Python dependencies
    .run_cmd(
        "pip install claude-agent-sdk httpx pydantic python-dotenv braintrust "
        "opentelemetry-api opentelemetry-sdk"
    )
)
```

**Installed Dependencies:**
- ✅ Python 3.12+
- ✅ Claude Code CLI
- ✅ Claude Agent SDK (Python)
- ✅ Braintrust SDK (Python)
- ✅ OpenTelemetry
- ✅ Git, ripgrep, curl

### Build Process

**Command:** `npm run build:template`

**What happens:**
1. Reads `agents/base/template.py`
2. Sends to E2B cloud
3. E2B builds container with all dependencies
4. Returns template ID (e.g., `abc123xyz`)
5. Saves to `.env` as `E2B_TEMPLATE_ID`

**Build time:** ~30 seconds

### Runtime Usage

**Every agent execution:**
```typescript
// examples/lib/agent.ts
const templateId = process.env.E2B_TEMPLATE_ID
const sandbox = await Sandbox.create(templateId, {
  timeoutMs: 120000
})

// Sandbox starts in ~150ms (pre-built template)
// Runs agent code
// Sandbox destroyed after completion
```

---

## Single Template vs Multiple Templates

### Single Template (Current)

**Architecture:**
```
ONE Template (E2B_TEMPLATE_ID)
    ↓
All agents use this template
```

**Pros:**
- ✅ Simple to manage
- ✅ Faster development (no template selection logic)
- ✅ Consistent environment across all agents
- ✅ One build process

**Cons:**
- ❌ All dependencies installed even if not needed
- ❌ Larger template size (slower cold starts)
- ❌ Can't optimize resources per agent type
- ❌ Dependency conflicts if agents have different needs

**Best for:**
- Getting started
- Single use case
- General-purpose agents
- Proof of concept

---

### Multiple Templates

**Architecture:**
```
Template 1: base               (general-purpose)
Template 2: data-analysis      (pandas, numpy, matplotlib)
Template 3: web-scraping       (playwright, beautifulsoup)
Template 4: code-generation    (language-specific tools)
    ↓
Choose template at runtime based on agent task
```

**Pros:**
- ✅ Optimized dependencies per agent type
- ✅ Smaller template sizes (faster cold starts)
- ✅ Resource optimization (1 CPU for simple, 4 CPU for complex)
- ✅ Isolated environments (no dependency conflicts)
- ✅ Security profiles (restricted vs full access)

**Cons:**
- ❌ More complex to manage
- ❌ Need template selection logic
- ❌ Multiple build processes
- ❌ More environment variables

**Best for:**
- Production systems
- Multiple agent types with different dependencies
- Performance optimization
- Large-scale deployments

---

## When to Create Multiple Templates

### Scenario 1: Different Dependency Sets

**Example:**

```
Agent Type 1: Data Analysis
  - Needs: pandas, numpy, matplotlib, scikit-learn
  - Doesn't need: playwright, beautifulsoup

Agent Type 2: Web Scraping
  - Needs: playwright, beautifulsoup, selenium
  - Doesn't need: pandas, numpy

Solution: Create 2 templates
```

**Benefits:**
- Faster cold starts (smaller images)
- No unused dependencies
- Isolated dependency versions

---

### Scenario 2: Different Resource Requirements

**Example:**

```
Agent Type 1: Simple Tasks (file operations, basic queries)
  - CPU: 1 vCPU
  - RAM: 512 MB
  - Cost: $0.000007/second

Agent Type 2: Complex Analysis (data processing, ML)
  - CPU: 4 vCPU
  - RAM: 8 GB
  - Cost: $0.000056/second

Solution: Create 2 templates with different e2b.toml configs
```

**Benefits:**
- 87% cost reduction for simple tasks
- Better performance for complex tasks
- Resource optimization

---

### Scenario 3: Different Base Images

**Example:**

```
Agent Type 1: Python-based agents
  - Base: e2bdev/code-interpreter (Python 3.12)

Agent Type 2: Node.js-based agents
  - Base: e2bdev/node (Node.js 20)

Agent Type 3: Multi-language agents
  - Base: e2bdev/ubuntu (custom install)

Solution: Create 3 templates with different base images
```

---

### Scenario 4: Different Security Profiles

**Example:**

```
Agent Type 1: Trusted operations (internal use)
  - Network: Full access
  - Filesystem: Read/write
  - Tools: All enabled

Agent Type 2: Untrusted operations (user-generated)
  - Network: Restricted (allowlist only)
  - Filesystem: Read-only
  - Tools: Bash disabled

Solution: Create 2 templates with different security configs
```

---

## How to Create Additional Templates

### Step 1: Create Template Directory

```bash
# Create new template directory
mkdir -p agents/data-analysis

# Copy base template as starting point
cp agents/base/template.py agents/data-analysis/template.py
cp agents/base/build_dev.py agents/data-analysis/build_dev.py
cp agents/base/e2b.toml agents/data-analysis/e2b.toml
```

### Step 2: Customize Template

**File:** `agents/data-analysis/template.py`

```python
from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    # System dependencies
    .run_cmd("sudo apt-get update && sudo apt-get install -y curl git")
    # Claude Code CLI
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    # Python dependencies (data analysis specific)
    .run_cmd(
        "pip install claude-agent-sdk httpx pydantic python-dotenv braintrust "
        "pandas numpy matplotlib seaborn scikit-learn jupyter"
    )
)
```

**Changes from base:**
- ➕ Added: `pandas`, `numpy`, `matplotlib`, `seaborn`, `scikit-learn`, `jupyter`
- ➖ Removed: (none in this case, but you could remove unused deps)

### Step 3: Update Build Script

**File:** `agents/data-analysis/build_dev.py`

```python
from e2b import Template, default_build_logger
from template import template

Template.build(
    template,
    alias="claude-agent-data-analysis-dev",  # Unique alias
    on_build_logs=default_build_logger(),
)
```

**Key change:** Update alias to be unique (`claude-agent-data-analysis-dev`)

### Step 4: Configure Resources

**File:** `agents/data-analysis/e2b.toml`

```toml
dockerfile = "Dockerfile"
template_name = "claude-agent-data-analysis"
cpu_count = 2      # Adjust as needed
memory_mb = 8192   # 8GB for data processing
start_cmd = "/bin/bash"
```

### Step 5: Build Template

```bash
cd agents/data-analysis

# Activate Python environment (if needed)
source ../../.venv/bin/activate

# Build template
python build_dev.py

# Output:
# Building template: claude-agent-data-analysis-dev
# [Build logs...]
# Template created successfully!
# Template ID: def456ghi
```

### Step 6: Save Template ID

**Option A: Environment Variable**

```bash
# .env
E2B_TEMPLATE_ID=abc123xyz           # Base template
E2B_DATA_ANALYSIS_TEMPLATE_ID=def456ghi  # Data analysis template
```

**Option B: Config File**

```typescript
// examples/lib/templates.ts
export const TEMPLATES = {
  base: process.env.E2B_TEMPLATE_ID!,
  dataAnalysis: process.env.E2B_DATA_ANALYSIS_TEMPLATE_ID!,
  webScraping: process.env.E2B_WEB_SCRAPING_TEMPLATE_ID!,
}
```

---

## Template Organization

### Recommended Directory Structure

```
agents/
├── base/                    # General-purpose template
│   ├── template.py
│   ├── build_dev.py
│   ├── e2b.toml
│   └── README.md            # Document what's in this template
│
├── data-analysis/           # Data science template
│   ├── template.py
│   ├── build_dev.py
│   ├── e2b.toml
│   └── README.md
│
├── web-scraping/            # Web automation template
│   ├── template.py
│   ├── build_dev.py
│   ├── e2b.toml
│   └── README.md
│
├── code-generation/         # Code generation template
│   ├── template.py
│   ├── build_dev.py
│   ├── e2b.toml
│   └── README.md
│
└── README.md                # Overview of all templates
```

### Template Documentation

**File:** `agents/base/README.md`

```markdown
# Base Template

General-purpose template for Claude agents.

## Included Dependencies

**System Tools:**
- curl, git, ripgrep

**Node.js:**
- Claude Code CLI

**Python:**
- claude-agent-sdk
- httpx, pydantic, python-dotenv
- braintrust, opentelemetry-api, opentelemetry-sdk

## Resources

- CPU: 2 vCPU
- RAM: 4 GB
- Timeout: 120s default

## Use Cases

- General file operations
- Code analysis
- Text processing
- Basic automation

## Build

```bash
cd agents/base
python build_dev.py
```

## Environment Variable

```bash
E2B_TEMPLATE_ID=<template-id>
```
```

---

## Choosing Templates at Runtime

### Option 1: Template Selector Function

**File:** `examples/lib/template-selector.ts`

```typescript
export type AgentType = 'general' | 'data-analysis' | 'web-scraping' | 'code-generation'

export function getTemplateId(type: AgentType): string {
  const templates = {
    general: process.env.E2B_TEMPLATE_ID,
    'data-analysis': process.env.E2B_DATA_ANALYSIS_TEMPLATE_ID,
    'web-scraping': process.env.E2B_WEB_SCRAPING_TEMPLATE_ID,
    'code-generation': process.env.E2B_CODE_GEN_TEMPLATE_ID,
  }

  const templateId = templates[type]

  if (!templateId) {
    throw new Error(`Template ID not found for type: ${type}. Check your .env file.`)
  }

  return templateId
}
```

**Usage:**

```typescript
import { runPythonAgent } from './lib/agent'
import { getTemplateId } from './lib/template-selector'

// Use data analysis template
const result = await runPythonAgent({
  prompt: 'Analyze this CSV file',
  templateId: getTemplateId('data-analysis')
})
```

---

### Option 2: Auto-Detection Based on Prompt

**File:** `examples/lib/smart-template-selector.ts`

```typescript
export function detectTemplateType(prompt: string): AgentType {
  // Data analysis keywords
  if (/\b(csv|dataframe|pandas|numpy|plot|graph|chart|analyze data)\b/i.test(prompt)) {
    return 'data-analysis'
  }

  // Web scraping keywords
  if (/\b(scrape|crawl|browser|playwright|selenium|fetch html)\b/i.test(prompt)) {
    return 'web-scraping'
  }

  // Code generation keywords
  if (/\b(generate code|write function|create class|implement)\b/i.test(prompt)) {
    return 'code-generation'
  }

  // Default to general
  return 'general'
}

export function getTemplateForPrompt(prompt: string): string {
  const type = detectTemplateType(prompt)
  return getTemplateId(type)
}
```

**Usage:**

```typescript
import { runPythonAgent } from './lib/agent'
import { getTemplateForPrompt } from './lib/smart-template-selector'

const result = await runPythonAgent({
  prompt: 'Analyze this CSV and create a plot',
  templateId: getTemplateForPrompt('Analyze this CSV and create a plot')
  // Auto-selects data-analysis template
})
```

---

### Option 3: Explicit Selection in Config

**Update agent functions to accept template type:**

```typescript
// examples/lib/agent.ts
export interface AgentConfig {
  prompt: string
  timeout?: number
  verbose?: boolean
  templateType?: 'general' | 'data-analysis' | 'web-scraping' | 'code-generation'
}

export async function runPythonAgent(config: AgentConfig): Promise<string> {
  const templateId = config.templateType
    ? getTemplateId(config.templateType)
    : process.env.E2B_TEMPLATE_ID

  // ... rest of function
}
```

**Usage:**

```typescript
const result = await runPythonAgent({
  prompt: 'Process this dataset',
  templateType: 'data-analysis'
})
```

---

## Template Management

### Build Scripts

Create a unified build script for all templates:

**File:** `scripts/build-all-templates.sh`

```bash
#!/bin/bash

set -e  # Exit on error

echo "Building all E2B templates..."

# Activate Python environment
source .venv/bin/activate

# Build base template
echo "Building base template..."
cd agents/base
python build_dev.py
BASE_ID=$(cat .template_id)
echo "Base template ID: $BASE_ID"
cd ../..

# Build data analysis template
echo "Building data-analysis template..."
cd agents/data-analysis
python build_dev.py
DATA_ID=$(cat .template_id)
echo "Data analysis template ID: $DATA_ID"
cd ../..

# Build web scraping template
echo "Building web-scraping template..."
cd agents/web-scraping
python build_dev.py
WEB_ID=$(cat .template_id)
echo "Web scraping template ID: $WEB_ID"
cd ../..

# Update .env file
echo "Updating .env file..."
echo "E2B_TEMPLATE_ID=$BASE_ID" >> .env
echo "E2B_DATA_ANALYSIS_TEMPLATE_ID=$DATA_ID" >> .env
echo "E2B_WEB_SCRAPING_TEMPLATE_ID=$WEB_ID" >> .env

echo "✅ All templates built successfully!"
```

**Make executable:**

```bash
chmod +x scripts/build-all-templates.sh
```

**Add to package.json:**

```json
{
  "scripts": {
    "build:templates": "./scripts/build-all-templates.sh",
    "build:template:base": "cd agents/base && python build_dev.py",
    "build:template:data": "cd agents/data-analysis && python build_dev.py",
    "build:template:web": "cd agents/web-scraping && python build_dev.py"
  }
}
```

### List Templates

**Check what templates you have:**

```bash
# Via E2B CLI
e2b template list

# Output:
# ID              Alias                           Created
# abc123xyz       claude-agent-sandbox-dev        2026-01-05
# def456ghi       claude-agent-data-analysis-dev  2026-01-05
# jkl789mno       claude-agent-web-scraping-dev   2026-01-05
```

### Delete Templates

**Remove unused templates:**

```bash
# Delete by alias
e2b template delete claude-agent-old-template-dev

# Delete by ID
e2b template delete abc123xyz
```

**Warning:** This is irreversible! Template will be deleted from E2B cloud.

---

## Best Practices

### 1. Start with One Template

**Recommendation:** Use a single general-purpose template until you have a clear need for multiple.

**Why:**
- Simpler to manage
- Faster development
- Easier debugging
- Less cognitive overhead

**When to add more templates:**
- You have 3+ distinct agent types with different dependencies
- Performance optimization is critical
- You're seeing slow cold starts (large template)
- You have conflicting dependency requirements

---

### 2. Use Descriptive Names

**Bad:**
```
agents/template1/
agents/template2/
agents/temp/
```

**Good:**
```
agents/base/
agents/data-analysis/
agents/web-scraping/
agents/code-generation/
```

---

### 3. Document Each Template

**Include in each template's README:**
- What dependencies are installed
- What use cases it's optimized for
- Resource configuration (CPU, RAM)
- Build instructions
- Environment variable name

---

### 4. Version Your Templates

**Use aliases with versions:**

```python
# Production template
Template.build(template, alias="claude-agent-base-v1")

# Development template
Template.build(template, alias="claude-agent-base-dev")

# Testing new dependencies
Template.build(template, alias="claude-agent-base-v2-beta")
```

**Benefits:**
- Rollback if new template has issues
- A/B testing different configurations
- Safe experimentation

---

### 5. Minimize Template Size

**Only install what you need:**

```python
# Bad: Kitchen sink approach
.run_cmd("pip install pandas numpy matplotlib seaborn scikit-learn tensorflow pytorch transformers")

# Good: Only what this template needs
.run_cmd("pip install pandas numpy matplotlib")  # 300MB
```

**Why:**
- Faster builds (30s vs 5min)
- Faster cold starts (150ms vs 1s+)
- Lower storage costs
- Easier to debug

---

### 6. Separate Dev and Production

**Development templates:**
- Alias: `*-dev`
- More dependencies (debugging tools, etc.)
- Faster iteration

**Production templates:**
- Alias: `*-prod`
- Minimal dependencies
- Optimized for performance

**Example:**

```bash
# .env.development
E2B_TEMPLATE_ID=abc-dev

# .env.production
E2B_TEMPLATE_ID=abc-prod
```

---

### 7. Cache Template IDs

**Don't rebuild templates unnecessarily:**

```typescript
// Cache template ID to avoid rebuilding
let cachedTemplateId: string | null = null

export function getTemplateId(): string {
  if (!cachedTemplateId) {
    cachedTemplateId = process.env.E2B_TEMPLATE_ID!

    if (!cachedTemplateId) {
      throw new Error('E2B_TEMPLATE_ID not set. Run: npm run build:template')
    }
  }

  return cachedTemplateId
}
```

---

## Examples

### Example 1: Data Analysis Template

**Use case:** Agent that processes CSV files and creates visualizations

**File:** `agents/data-analysis/template.py`

```python
from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    .run_cmd("sudo apt-get update && sudo apt-get install -y curl git")
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    .run_cmd(
        "pip install claude-agent-sdk httpx pydantic python-dotenv braintrust "
        # Data analysis specific
        "pandas numpy matplotlib seaborn plotly scikit-learn scipy statsmodels "
        # Jupyter for interactive analysis
        "jupyter ipython ipykernel"
    )
)
```

**Resources:** `agents/data-analysis/e2b.toml`

```toml
template_name = "claude-agent-data-analysis"
cpu_count = 4      # More CPU for data processing
memory_mb = 8192   # 8GB RAM
```

**Usage:**

```typescript
const result = await runPythonAgent({
  prompt: 'Load sales.csv, calculate quarterly trends, and create a bar chart',
  templateId: getTemplateId('data-analysis'),
  timeout: 300  // Longer timeout for data processing
})
```

---

### Example 2: Web Scraping Template

**Use case:** Agent that scrapes websites and extracts data

**File:** `agents/web-scraping/template.py`

```python
from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    .run_cmd("sudo apt-get update && sudo apt-get install -y curl git")
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    # Install Playwright and dependencies
    .run_cmd("sudo apt-get install -y chromium chromium-driver")
    .run_cmd(
        "pip install claude-agent-sdk httpx pydantic python-dotenv braintrust "
        # Web scraping specific
        "playwright beautifulsoup4 lxml requests selenium aiohttp"
    )
    .run_cmd("playwright install chromium")
)
```

**Usage:**

```typescript
const result = await runPythonAgent({
  prompt: 'Scrape product prices from example.com/products',
  templateId: getTemplateId('web-scraping'),
  timeout: 180
})
```

---

### Example 3: Minimal Template (Cost Optimization)

**Use case:** Simple file operations, minimal dependencies

**File:** `agents/minimal/template.py`

```python
from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    .run_cmd("sudo apt-get update && sudo apt-get install -y curl git ripgrep")
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    .run_cmd("pip install claude-agent-sdk httpx pydantic python-dotenv")
    # No Braintrust, no extra deps
)
```

**Resources:** `agents/minimal/e2b.toml`

```toml
template_name = "claude-agent-minimal"
cpu_count = 1      # Minimal CPU
memory_mb = 512    # 512MB RAM
```

**Cost comparison:**

```
Minimal template: $0.000007/second (1 vCPU)
Base template:    $0.000028/second (2 vCPU)
Data template:    $0.000056/second (4 vCPU)

Savings: 75% vs base, 87% vs data
```

---

## Summary

### Key Takeaways

1. **Templates are like Docker images** - Build once, reuse many times
2. **Start simple** - One template is fine for most use cases
3. **Add templates when needed** - Different dependencies, resources, or security profiles
4. **Organize well** - Clear naming, documentation, build scripts
5. **Choose at runtime** - Explicit selection or auto-detection based on prompt
6. **Optimize for performance** - Minimal dependencies, right-sized resources
7. **Version for safety** - Production vs development, versioned aliases

### Decision Tree

```
Do you have different agent types with DIFFERENT dependencies?
    ├─ No  → Use ONE template (current setup)
    └─ Yes → Continue...

Do those dependencies conflict or create bloat?
    ├─ No  → Consider using ONE template (simpler)
    └─ Yes → Use MULTIPLE templates

Can you clearly categorize agents into 2-5 types?
    ├─ Yes → Create templates for each type
    └─ No  → Reconsider - might be premature optimization
```

### Next Steps

1. **Evaluate your use case** - Do you need multiple templates?
2. **Document requirements** - What dependencies per agent type?
3. **Create templates** - Follow the guide above
4. **Build and test** - `npm run build:template:*`
5. **Update code** - Add template selection logic
6. **Monitor performance** - Compare cold starts, costs

---

**Document Version:** 1.0
**Last Updated:** 2026-01-05
