FROM e2bdev/code-interpreter:latest

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code@latest

# Install Python dependencies
RUN pip install --no-cache-dir \
    claude-agent-sdk \
    httpx \
    pydantic \
    python-dotenv

WORKDIR /workspace

CMD ["/bin/bash"]
