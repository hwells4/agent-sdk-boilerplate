---
name: create-e2b-agent
description: Create new E2B sandbox agents with Claude Code and the Claude Agent SDK through an adaptive interview that intelligently gathers requirements and generates all necessary configuration files.
---

<objective>
Create production-ready E2B sandbox agents through intelligent conversation. This skill conducts an adaptive interview to understand your agent's purpose, then generates all necessary files: template configuration, agent instructions, permissions, examples, and build scripts.
</objective>

<essential_principles>
## E2B Agent Architecture

**What is an E2B agent?**
An E2B agent is Claude Code running inside an isolated E2B sandbox with:
- Custom tools and permissions
- MCP server integrations
- Persistent configuration
- Reproducible environment

**Core components:**
1. **Template** (`template.py`) - Defines the sandbox image and dependencies
2. **Instructions** (`CLAUDE.md`) - Agent behavior and capabilities
3. **Settings** (`.claude/settings.json`) - Permissions and MCP configuration
4. **Build scripts** - Development and production deployment
5. **Examples** - Usage demonstrations

**Design philosophy:**
- Single responsibility per agent
- Declarative configuration over imperative code
- Explicit permissions (deny by default)
- Template-based deployment (build once, instantiate many)
- Sandbox isolation for security
</essential_principles>

<intake>
## Initial Assessment

I'll help you create an E2B agent. First, let me understand what you need:

**If you already have context** (e.g., "create an agent that analyzes CSV files"), I'll start building immediately with intelligent questions as needed.

**If you're exploring**, I'll ask:
- What problem should this agent solve?
- Do you want to start from scratch or clone an existing agent?
- Any specific tools, MCP servers, or constraints?

The interview adapts based on your responses - I'll only ask what's necessary to build a working agent.
</intake>

<routing>
## Workflow Routing

Based on your intent, I'll route to the appropriate workflow:

| User Intent | Workflow | Notes |
|-------------|----------|-------|
| "Create agent for X" with clear purpose | `workflows/create-agent.md` | Start adaptive interview |
| "Clone X agent" or "like X but..." | `workflows/clone-agent.md` | Copy and modify existing |
| "Add Y to existing agent" | `workflows/add-component.md` | Extend current agent |
| Vague or exploratory request | Ask clarifying questions first | Then route appropriately |

**The adaptive interview in `workflows/create-agent.md` will:**
1. Understand the agent's purpose and constraints
2. Infer reasonable defaults for missing information
3. Ask targeted questions only when critical decisions need input
4. Generate all files with best practices applied
5. Offer immediate testing and iteration
</routing>

<directory_structure>
## Generated Agent Structure

```
agents/your-agent-name/
├── template.py              # E2B template definition
├── e2b.toml                 # E2B metadata
├── build_dev.py             # Development build script
├── build_prod.py            # Production build script
├── Makefile                 # Build commands
├── README.md                # Agent documentation
├── CLAUDE.md                # Agent instructions
├── .claude/
│   ├── settings.json        # MCP and permissions config
│   ├── hooks/               # Lifecycle hooks (optional)
│   └── skills/              # Agent-specific skills (optional)
└── examples/
    └── run_agent.py         # Usage example
```
</directory_structure>

<quick_start>
## Immediate Usage

**With clear intent:**
```
User: "Create an agent that analyzes CSV files and generates reports"
→ I'll start building immediately, asking only critical questions
```

**Exploratory:**
```
User: "I want to create an agent"
→ I'll ask: "What should this agent do?"
→ Then build based on your response
```

**Clone existing:**
```
User: "Clone the data-analyzer agent but add web search"
→ I'll copy the existing agent and add web search capability
```
</quick_start>

<success_criteria>
An agent is successfully created when:
- All necessary files are generated in `agents/{name}/`
- Template builds without errors (`make e2b:build:dev`)
- Example script demonstrates core functionality
- README documents usage and setup
- Permissions are appropriate for the use case
- Agent can be instantiated and tested immediately
</success_criteria>

<references_index>
## Available References

Load these as needed during workflow execution:

**Architecture:**
- `references/agent-architecture.md` - Structure patterns and best practices
- `references/permission-patterns.md` - Security models and access control
- `references/deployment-strategies.md` - Template vs ephemeral patterns

**Integration:**
- `references/mcp-servers.md` - Available MCP servers and configuration
- `references/base-images.md` - E2B base image options
- `references/common-dependencies.md` - Frequently used packages

**Examples:**
- `references/example-agents.md` - Reference implementations
</references_index>

<templates_index>
## File Templates

All in `templates/`:

| Template | Purpose |
|----------|---------|
| `template.py` | E2B template definition |
| `CLAUDE.md` | Agent instructions |
| `settings.json` | Permissions and MCP config |
| `build_dev.py` | Development build script |
| `build_prod.py` | Production build script |
| `Makefile` | Build commands |
| `README.md` | Agent documentation |
| `e2b.toml` | E2B metadata |
| `run_agent.py` | Usage example |
</templates_index>

<workflow_execution>
## How This Works

1. **You invoke the skill** with your intent
2. **I assess what you need** and route to the appropriate workflow
3. **Workflow guides the process** - loading only necessary references
4. **I generate all files** using templates, customized to your requirements
5. **You review and test** - I offer to build and run immediately
6. **Iterate as needed** - Add components, adjust configuration, refine behavior

**Key difference from traditional tools:**
This isn't a form to fill out. It's an intelligent conversation that adapts to what you provide and infers what you don't. I'll only ask questions when I genuinely need your input for critical decisions.
</workflow_execution>
