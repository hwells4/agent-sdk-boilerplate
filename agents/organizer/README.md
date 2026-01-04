# Knowledge Base Organizer Agent

A complete example agent template demonstrating skills, hooks, and MCP servers baked into an E2B template.

## Overview

This agent analyzes file structures, suggests organization improvements, and can reorganize files with user approval. It demonstrates:

- **Skills**: Custom `/organize` command for file organization workflows
- **Hooks**: Logging hook that tracks file operations
- **MCP Servers**: Filesystem and memory servers for enhanced capabilities
- **E2B Template**: Pre-built sandbox with all dependencies installed

## Quick Start

### 1. Build the Template

```bash
# Ensure E2B_API_KEY is set
export E2B_API_KEY=your_key_here

# Build the template
python build.py

# Or for development
python build.py --dev
```

### 2. Run the Agent

```bash
# Ensure both API keys are set
export E2B_API_KEY=your_key_here
export ANTHROPIC_API_KEY=your_key_here

# Run interactively
python run.py

# Run with a prompt
python run.py "analyze the files in workspace and suggest organization"

# Sync a local directory and organize
python run.py --workspace ~/Downloads "organize these files by type"
```

## Directory Structure

```
agents/organizer/
├── README.md               # This file
├── CLAUDE.md               # Agent instructions and personality
├── template.py             # E2B template definition
├── build.py                # Script to build the template
├── run.py                  # Script to run the agent
├── .claude/
│   ├── settings.json       # Permissions and MCP server config
│   └── hooks/
│       └── on-organize.sh  # File operation logging hook
└── skills/
    └── organize-files/
        └── SKILL.md        # File organization skill definition
```

## Components

### template.py

Defines the E2B sandbox template:
- Base image: `e2bdev/code-interpreter`
- Installs: Claude Code CLI, SDK, and utilities
- Copies: All agent configuration files into the sandbox

### CLAUDE.md

Agent instructions that define:
- Agent personality and capabilities
- Workflow for analysis, proposal, approval, and execution
- Organization best practices
- Safety rules

### .claude/settings.json

Configuration for:
- **Permissions**: Allowed and denied bash commands
- **MCP Servers**:
  - `filesystem`: File operations within workspace
  - `memory`: Persistent storage for preferences

### skills/organize-files/SKILL.md

Comprehensive skill that:
- Scans directory structures
- Analyzes file patterns
- Proposes organization strategies (type, project, date)
- Executes changes with user approval

### hooks/on-organize.sh

Example hook that:
- Logs all file operations to a JSONL file
- Creates audit trail for undo operations
- Provides tips based on file types

## Customization

To create your own agent based on this template:

1. **Copy the directory**:
   ```bash
   cp -r agents/organizer agents/my-agent
   ```

2. **Update CLAUDE.md** with your agent's purpose and instructions

3. **Modify settings.json** with appropriate permissions and MCP servers

4. **Create new skills** in the `skills/` directory

5. **Add custom hooks** in `.claude/hooks/`

6. **Update template.py** if you need additional dependencies

7. **Build and test**:
   ```bash
   cd agents/my-agent
   python build.py --dev
   python run.py "test my agent"
   ```

## API Keys

| Variable | Purpose |
|----------|---------|
| `E2B_API_KEY` | E2B sandbox access |
| `ANTHROPIC_API_KEY` | Claude API access |

## License

Part of the Claude Agent SDK Experiments project.
