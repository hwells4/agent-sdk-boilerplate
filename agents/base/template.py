from e2b import Template

template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    # Install system dependencies (need sudo for apt)
    .run_cmd("sudo apt-get update && sudo apt-get install -y curl git ripgrep")
    # Install Claude Code CLI
    .run_cmd("sudo npm install -g @anthropic-ai/claude-code@latest")
    # Install Python dependencies
    .run_cmd("pip install claude-agent-sdk httpx pydantic python-dotenv")
)