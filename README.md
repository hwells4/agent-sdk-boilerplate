# Claude Agent SDK Experiments

> Run Claude agents in isolated E2B sandboxes with full tool access and reproducible environments

This project demonstrates how to integrate the [Claude Agent SDK](https://platform.claude.com/docs/agent-sdk) with [E2B sandboxes](https://e2b.dev/) to create isolated, containerized environments for running Claude agents.

## Features

- **🔒 Isolated Execution**: Run agents in secure E2B sandbox containers
- **🛠️ Full Tool Access**: Agents can use Read, Write, Edit, Glob, Grep, and Bash tools
- **📦 Reproducible**: Templates ensure consistent environments across runs
- **⚡ Fast Startup**: Pre-built templates spin up in seconds
- **🎯 Simple API**: Easy-to-use Python interface for agent execution
- **🔄 Async Support**: Built on async/await for efficient resource usage

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/claude-agent-sdk-experiments.git
cd claude-agent-sdk-experiments

# 2. Run the setup script
./setup.sh

# 3. Build the E2B template (first time only)
npm run build:template

# 4. Run your first agent!
python run_agent.py "What is the capital of France?"
```

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Examples](#examples)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Prerequisites

- **Python 3.12+** - Required for the Claude Agent SDK
- **Node.js 18+** - For npm scripts
- **Claude Max subscription** - For OAuth token access
- **E2B account** - Free tier available at [e2b.dev](https://e2b.dev/)

### Setup Steps

1. **Install Python dependencies:**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Run the interactive setup:**

   ```bash
   ./setup.sh
   # Or: npm run setup
   ```

   The setup script will guide you through:
   - Creating a `.env` file
   - Setting up your Claude OAuth token
   - Configuring your E2B API key
   - Verifying your setup

3. **Build the E2B template:**

   ```bash
   npm run build:template
   # Or manually:
   cd agents/base && python build_dev.py
   ```

   This creates a sandbox template with Claude Code and the Agent SDK pre-installed.

## Configuration

### Environment Variables

Create a `.env` file in the project root (use `.env.example` as a template):

```bash
# Claude OAuth Token (from: claude setup-token)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...

# E2B API Key (from: https://e2b.dev/dashboard)
E2B_API_KEY=e2b_...

# E2B Template ID (from running build script)
E2B_TEMPLATE_ID=your-template-id
```

### Getting Your Credentials

#### Claude OAuth Token

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Generate a setup token
claude setup-token

# Copy the token to your .env file
```

> **Note**: Requires an active Claude Max subscription

#### E2B API Key

1. Sign up at [e2b.dev](https://e2b.dev/)
2. Go to your [dashboard](https://e2b.dev/dashboard)
3. Copy your API key
4. Add it to your `.env` file

## Usage

### Basic Agent Execution

```python
# Simple one-liner
python run_agent.py "Write a Python function to calculate fibonacci numbers"

# With options
python run_agent.py \
  --prompt "Analyze the project structure" \
  --timeout 180 \
  --verbose
```

### Programmatic Usage

```python
import asyncio
from run_agent import run_agent

async def main():
    result = await run_agent(
        prompt="What files are in the current directory?",
        timeout=120,
        verbose=True
    )
    print(f"Result: {result}")

asyncio.run(main())
```

### Validation Script

Test that your sandbox and credentials are configured correctly:

```bash
python scripts/validate_setup.py
```

This will:
- ✅ Check environment variables
- ✅ Verify template exists
- ✅ Create a test sandbox
- ✅ Run a simple agent task
- ✅ Clean up resources

## Project Structure

```
claude-agent-sdk-experiments/
├── agents/                      # E2B sandbox templates
│   ├── base/                    # Base template with Claude SDK
│   │   ├── template.py          # Template definition
│   │   ├── build_dev.py         # Development build script
│   │   ├── build_prod.py        # Production build script
│   │   ├── Dockerfile           # Container definition
│   │   └── e2b.toml             # E2B configuration (CPU, RAM, timeout)
│   └── organizer/               # Example: Knowledge base organizer
│       ├── template.py          # Extended template with custom setup
│       ├── build.py             # Build with alias management
│       ├── run.py               # Interactive agent runner
│       └── CLAUDE.md            # Agent instructions
├── examples/                    # Usage examples
│   ├── basic_async.py           # Minimal async example
│   ├── basic_sync.py            # Synchronous API example
│   └── api_server.py            # FastAPI REST wrapper
├── scripts/                     # Utility scripts
│   └── validate_setup.py        # Verify configuration
├── .claude/                     # Claude Code configuration
│   ├── settings.json            # MCP servers and permissions
│   ├── hooks/                   # Event hooks
│   └── skills/                  # Custom skills
├── run_agent.py                 # Main entry point
├── setup.sh                     # Interactive setup script
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment template
├── .mcp.json.example            # MCP server configuration example
├── CONTRIBUTING.md              # Contribution guidelines
├── SECURITY.md                  # Security policy
└── LICENSE                      # MIT License
```

## Examples

### 1. Basic Async Example

```python
# examples/basic_async.py
import asyncio
from claude_agent_sdk import query

async def main():
    async for msg in query(prompt="List all Python files"):
        if hasattr(msg, "result"):
            print(msg.result)

asyncio.run(main())
```

### 2. FastAPI Server

```python
# Run the API server
cd examples
python api_server.py

# Make requests
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the weather like?",
    "timeout": 120
  }'
```

### 3. Knowledge Base Organizer

A complete example agent that organizes files:

```bash
cd agents/organizer
python build.py          # Build the template
python run.py            # Run interactively
python run.py --workspace /path/to/files  # Sync local directory
```

## How It Works

### Architecture

```
┌─────────────────┐
│   Your Code     │
│  (run_agent.py) │
└────────┬────────┘
         │
         ├─── Creates sandbox from template
         │
         v
┌─────────────────┐
│  E2B Sandbox    │
│  ┌───────────┐  │
│  │  Claude   │  │
│  │  Agent    │  │
│  │  SDK      │  │
│  └─────┬─────┘  │
│        │        │
│     Tools:      │
│  Read, Write,   │
│  Edit, Bash     │
└─────────────────┘
         │
         └─── Returns results
```

### Execution Flow

1. **Template Building**: `build_dev.py` creates an E2B template with:
   - Ubuntu base image
   - Python 3.12+
   - Claude Code CLI
   - Claude Agent SDK
   - Development tools (git, ripgrep, etc.)

2. **Agent Execution**: `run_agent.py`:
   - Loads your prompt
   - Spawns a sandbox from the template
   - Injects agent code with your prompt (safely escaped)
   - Streams results back
   - Cleans up the sandbox

3. **Tool Access**: Inside the sandbox, agents can:
   - Read and write files
   - Execute bash commands
   - Search code with grep/glob
   - Edit files in place
   - Install packages

### Security

- **Input Sanitization**: All prompts are JSON-serialized to prevent injection
- **Shell Escaping**: Commands use `shlex.quote()` for safe execution
- **Sandbox Isolation**: E2B provides container-level isolation
- **Resource Limits**: Configurable CPU, RAM, and timeout limits

See [SECURITY.md](SECURITY.md) for detailed security information.

## Troubleshooting

### "E2B_TEMPLATE_ID not set"

**Solution**: Build the template first:

```bash
npm run build:template
```

The template ID will be printed and automatically added to your `.env` file.

### "Invalid OAuth token"

**Solution**: Regenerate your token:

```bash
claude setup-token
# Copy the new token to .env
```

Ensure you have an active Claude Max subscription.

### "Sandbox creation timed out"

**Possible causes**:
- E2B API is slow/down
- Template is too large
- Network issues

**Solutions**:
- Increase timeout: `run_agent.py --timeout 300`
- Check E2B status: https://status.e2b.dev/
- Rebuild template with fewer dependencies

### "Module not found: claude_agent_sdk"

**Solution**: Rebuild the template to include the SDK:

```bash
cd agents/base
python build_dev.py
```

### Import errors with examples

**Solution**: Install optional dependencies:

```bash
pip install fastapi uvicorn pydantic
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install dev dependencies
pip install pytest pytest-asyncio mypy ruff

# Run tests (coming soon)
pytest

# Format code
ruff format .

# Type checking
mypy .
```

## Resources

- [Claude Agent SDK Documentation](https://platform.claude.com/docs/agent-sdk)
- [E2B Documentation](https://e2b.dev/docs)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Claude API Reference](https://docs.anthropic.com/claude/reference)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with the [Claude Agent SDK](https://www.anthropic.com/agent-sdk) by Anthropic
- Powered by [E2B](https://e2b.dev/) sandbox infrastructure
- Inspired by the need for reproducible, isolated agent environments

---

**Questions?** Open an issue or check out the [examples/](examples/) directory for more usage patterns.
