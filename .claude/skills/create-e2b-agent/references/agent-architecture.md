# Agent Architecture Reference

## Core Components

Every E2B agent consists of these files:

### 1. Template Definition (`template.py`)

Defines the Docker image and dependencies:

```python
from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    .run_cmd("sudo apt-get update && sudo apt-get install -y git ripgrep")
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    .run_cmd("pip install claude-agent-sdk httpx pydantic")
    .copy_file("CLAUDE.md", "/home/user/agent/CLAUDE.md")
    .copy_file(".claude/settings.json", "/home/user/agent/.claude/settings.json")
)
```

**Key patterns:**
- Start from E2B base image
- Install system dependencies with apt
- Install global Node packages
- Install Python packages
- Copy agent configuration files

### 2. Agent Instructions (`CLAUDE.md`)

Tells Claude what this agent does and how to behave:

```markdown
# Agent Name

You are {agent-name}, an agent that {primary-purpose}.

## Your Capabilities
- {capability 1}
- {capability 2}
- {capability 3}

## Your Workflow
1. {step 1}
2. {step 2}
3. {step 3}

## Safety Rules
- Never {dangerous action 1}
- Always {safety practice 1}
- Refuse to {prohibited action 1}

## Examples

### Example 1: {Task Name}
User: "{example request}"
You: "{example response}"
```

**Best practices:**
- Clear identity statement
- Specific capabilities list
- Step-by-step workflow
- Explicit safety rules
- Realistic examples

### 3. Settings (`settings.json`)

Controls permissions and MCP configuration:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  },
  "permissions": {
    "bash": {
      "allow": ["git", "ls", "cat", "grep"],
      "deny": ["rm -rf", "chmod 777", "sudo su"]
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": ["/etc/**", "/root/**"]
    }
  }
}
```

**Permission levels:**

**Restricted (read-only):**
```json
{
  "permissions": {
    "bash": {
      "allow": ["ls", "cat", "grep", "find"],
      "deny": ["*"]
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": ["**/.*", "/home/user/workspace/**/node_modules/**"]
    },
    "tools": {
      "Write": false,
      "Edit": false
    }
  }
}
```

**Standard (default):**
```json
{
  "permissions": {
    "bash": {
      "allow": ["git", "npm", "pip", "python", "node"],
      "deny": ["rm -rf /", "chmod 777", "dd if="]
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": ["/etc/**", "/sys/**", "/proc/**"]
    }
  }
}
```

**Elevated (use with caution):**
```json
{
  "permissions": {
    "bash": {
      "allow": ["*"],
      "deny": ["rm -rf /", ":(){ :|:& };:"]
    },
    "files": {
      "allow": ["**"],
      "deny": []
    }
  }
}
```

### 4. Build Scripts

**Development build (`build_dev.py`):**
```python
from template import template

if __name__ == "__main__":
    template_id = template.build(alias="agent-name-dev")
    print(f"✅ Development template built: {template_id}")
    print(f"Export: export E2B_TEMPLATE_ID={template_id}")
```

**Production build (`build_prod.py`):**
```python
from template import template

if __name__ == "__main__":
    template_id = template.build(alias="agent-name-prod")
    print(f"✅ Production template built: {template_id}")
    print(f"Use this ID for production deployments: {template_id}")
```

### 5. Example Usage (`examples/run_agent.py`)

```python
import asyncio
import os
from e2b import Sandbox

async def main():
    # Create sandbox from template
    template_id = os.getenv("E2B_TEMPLATE_ID")
    if not template_id:
        raise ValueError("E2B_TEMPLATE_ID not set")

    async with Sandbox(template=template_id) as sandbox:
        # Start Claude Code in the sandbox
        result = await sandbox.commands.run(
            "cd /home/user/agent && claude-code",
            env={
                "CLAUDE_CODE_OAUTH_TOKEN": os.getenv("CLAUDE_CODE_OAUTH_TOKEN")
            }
        )

        print(result.stdout)
        if result.stderr:
            print(f"Errors: {result.stderr}")

if __name__ == "__main__":
    asyncio.run(main())
```

## Directory Structure

```
agents/agent-name/
├── template.py              # E2B template definition
├── e2b.toml                 # E2B metadata (optional)
├── build_dev.py             # Development build script
├── build_prod.py            # Production build script
├── Makefile                 # Build commands
├── README.md                # Agent documentation
├── CLAUDE.md                # Agent instructions
├── .claude/
│   ├── settings.json        # MCP and permissions config
│   ├── hooks/               # Lifecycle hooks (optional)
│   │   └── on-file-write.sh
│   └── skills/              # Agent-specific skills (optional)
│       └── custom-skill/
│           └── SKILL.md
└── examples/
    └── run_agent.py         # Usage example
```

## Common Patterns

### Pattern 1: Data Analysis Agent
```python
# Dependencies: pandas, numpy, matplotlib
# Permissions: Standard (read/write files)
# MCP: None required
# Base: code-interpreter
```

### Pattern 2: Web Research Agent
```python
# Dependencies: httpx, beautifulsoup4
# Permissions: Standard + WebFetch
# MCP: Memory (for storing findings)
# Base: code-interpreter
```

### Pattern 3: Deployment Agent
```python
# Dependencies: kubectl, docker, kubernetes
# Permissions: Elevated (with specific denials)
# MCP: None (uses external APIs)
# Base: code-interpreter
```

### Pattern 4: Browser Automation Agent
```python
# Dependencies: playwright
# Permissions: Standard
# MCP: Browser
# Base: desktop (for GUI support)
```

## Best Practices

1. **Single Responsibility**: Each agent should do one thing well
2. **Explicit Configuration**: All behavior defined declaratively in CLAUDE.md
3. **Least Privilege**: Only grant permissions actually needed
4. **Fail-Safe**: Deny dangerous operations by default
5. **Documentation**: Clear README and examples for every agent
6. **Versioning**: Use aliases (dev/prod) for template versions
7. **Testing**: Include example usage scripts that demonstrate functionality
