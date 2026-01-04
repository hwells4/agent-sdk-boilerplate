"""
Knowledge Base Organizer - E2B Template Definition

This template creates a sandboxed environment with Claude Code pre-installed,
along with all agent configuration files (skills, hooks, MCP servers).

The template:
1. Starts from e2bdev/code-interpreter base image
2. Installs Claude Code CLI and SDK
3. Copies agent configuration into the sandbox
"""

from pathlib import Path

from e2b import Template

# Get the directory containing this template
TEMPLATE_DIR = Path(__file__).parent

# Define what gets copied into the sandbox
AGENT_CONFIG_FILES = [
    # Agent instructions
    ("CLAUDE.md", "/home/user/agent/CLAUDE.md"),
    # Claude Code settings with MCP config
    (".claude/settings.json", "/home/user/agent/.claude/settings.json"),
    # Hooks
    (".claude/hooks/on-organize.sh", "/home/user/agent/.claude/hooks/on-organize.sh"),
    # Skills
    ("skills/organize-files/SKILL.md", "/home/user/agent/.claude/skills/organize-files/SKILL.md"),
]


def create_template() -> Template:
    """Create the E2B template for the Knowledge Base Organizer agent."""

    template = (
        Template()
        .from_image("e2bdev/code-interpreter")

        # Install system dependencies
        .run_cmd("sudo apt-get update && sudo apt-get install -y curl git ripgrep tree")

        # Install Claude Code CLI
        .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")

        # Install Python dependencies for the agent
        .run_cmd("pip install claude-agent-sdk httpx pydantic python-dotenv")

        # Create agent directory structure
        .run_cmd("mkdir -p /home/user/agent/.claude/hooks /home/user/agent/.claude/skills")

        # Set up working directory
        .run_cmd("mkdir -p /home/user/workspace")
    )

    # Copy agent configuration files into the template
    for local_path, sandbox_path in AGENT_CONFIG_FILES:
        local_file = TEMPLATE_DIR / local_path
        if local_file.exists():
            template = template.copy_file(str(local_file), sandbox_path)

    # Make hooks executable
    template = template.run_cmd("chmod +x /home/user/agent/.claude/hooks/*.sh 2>/dev/null || true")

    return template


# Export the template for use by build scripts
template = create_template()
