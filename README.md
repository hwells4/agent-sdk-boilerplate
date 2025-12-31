# Claude Agent SDK Experiments

Personal experiments with Claude Agent SDK for knowledge work automation.

## Project Purpose

First experiments building autonomous agents using the Claude Agent SDK. Focus on personal knowledge work automation - the kind of tasks that benefit from LLM reasoning combined with file system access.

## Key Research Findings

### Authentication
- Can use Claude Max subscription via `CLAUDE_CODE_OAUTH_TOKEN`
- No API key required for personal use
- Same authentication model as Claude Code CLI

### Architecture
- **Claude Code IS the Agent SDK runtime** - they share the same harness
- The SDK provides the programmatic interface to the same agent loop
- E2B (cloud sandboxing) is optional - can run entirely locally
- Local execution is simpler for personal knowledge work

### Minimal Tool Set
For knowledge work agents, start with just 4 tools:
| Tool | Purpose |
|------|---------|
| `Read` | Read file contents |
| `Write` | Write/overwrite files |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |

This covers 80% of knowledge work automation needs.

## Planned First Agent: Knowledge Base Organizer

An agent that:
1. Scans a directory of notes/documents
2. Identifies organizational patterns
3. Suggests or applies consistent structure
4. Fixes broken links and references

## Getting Started

```bash
# Install the SDK
pip install claude-agent-sdk

# Set up authentication (if using Claude Max)
export CLAUDE_CODE_OAUTH_TOKEN="your-token"

# Or use API key
export ANTHROPIC_API_KEY="your-key"
```

## Official Documentation

- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python)

## Project Structure

```
.
├── agents/           # Agent implementations
├── tools/            # Custom tool definitions
├── experiments/      # One-off experiments
└── docs/             # Notes and learnings
```

## License

Private repository - personal experiments only.
