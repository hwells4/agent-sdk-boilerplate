# Claude Agent SDK Experiments

Run Claude Agent SDK in isolated E2B sandboxes.

## Quick Start

```bash
# Setup
./onboarding.sh

# Run an agent
source .venv/bin/activate
python run_agent.py "What is 2 + 2?"
```

## Project Structure

```
.
├── agents/                  # Agent sandbox templates
│   └── base/               # Base template with Claude SDK
│       ├── template.py     # Template definition
│       ├── build_dev.py    # Build for development
│       ├── build_prod.py   # Build for production
│       ├── Dockerfile      # Container definition
│       └── e2b.toml        # E2B config
├── examples/               # Example scripts
│   ├── run_agent.py        # Simple agent example
│   ├── run_agent_in_sandbox.py  # Direct sandbox usage
│   └── server.py           # Optional FastAPI wrapper
├── scripts/                # Utilities
│   └── test_sandbox.py     # Test sandbox is working
├── run_agent.py            # Main entry point
└── onboarding.sh           # Setup script
```

## Setup

1. **Python 3.12+** required

2. **Run onboarding:**
   ```bash
   ./onboarding.sh
   ```

3. **Configure `.env`:**
   ```
   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat...  # From: claude setup-token
   E2B_API_KEY=e2b_...                    # From: https://e2b.dev/dashboard
   E2B_TEMPLATE_ID=...                    # From: npm run build:template
   ```

4. **Build the template (first time only):**
   ```bash
   npm run build:template
   ```

## Usage

### Run an Agent

```bash
python run_agent.py "Your prompt here"
python run_agent.py -p "Your prompt" -t 120 -v
```

### Test the Sandbox

```bash
python scripts/test_sandbox.py
```

### Optional: FastAPI Server

```bash
cd examples
python server.py
# Then: curl -X POST http://localhost:8000/agent/run -d '{"prompt": "..."}'
```

## How It Works

1. The sandbox template (`agents/base/`) pre-installs Claude Agent SDK
2. `run_agent.py` spins up a sandbox and runs your prompt inside it
3. The agent has access to file tools (Read, Write, Glob, Grep, Bash)
4. Results are streamed back

## Authentication

### Claude Max (OAuth Token)

```bash
# Get your token
claude setup-token

# Add to .env
CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token
```

### E2B API Key

Get your E2B API key from [e2b.dev/dashboard](https://e2b.dev/dashboard):

```bash
E2B_API_KEY=your-e2b-key
```

## Resources

- [Claude Agent SDK Documentation](https://platform.claude.com/docs/en/agent-sdk/overview)
- [E2B Documentation](https://e2b.dev/docs)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

## License

Private repository - personal experiments only.
