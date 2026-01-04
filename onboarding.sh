#!/bin/bash
set -e

echo "=================================================="
echo "Claude Agent SDK + E2B Onboarding"
echo "=================================================="
echo ""

# Check Python 3.12+
echo "Checking Python..."
if command -v python3.12 &> /dev/null; then
    PYTHON=python3.12
elif command -v python3 &> /dev/null; then
    version=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    if [[ $(echo "$version >= 3.12" | bc -l) -eq 1 ]]; then
        PYTHON=python3
    else
        echo "   Python 3.12+ required, found $version"
        echo "   Install with: brew install python@3.12"
        exit 1
    fi
else
    echo "   Python not found"
    exit 1
fi
echo "   Using $PYTHON"

# Create venv if needed
echo ""
echo "Setting up virtual environment..."
if [ ! -d ".venv" ]; then
    $PYTHON -m venv .venv
    echo "   Created .venv"
else
    echo "   .venv exists"
fi

# Activate and install deps
echo ""
echo "Installing dependencies..."
source .venv/bin/activate
pip install -q claude-agent-sdk e2b python-dotenv httpx pydantic
echo "   Dependencies installed"

# Check .env
echo ""
echo "Checking .env..."
if [ ! -f ".env" ]; then
    cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
# Claude Agent SDK Authentication
CLAUDE_CODE_OAUTH_TOKEN=

# E2B Sandbox
E2B_API_KEY=
E2B_TEMPLATE_ID=
EOF
    echo "   Created .env - needs configuration"
else
    echo "   .env exists"
fi

# Source .env for checks
set -a
source .env 2>/dev/null || true
set +a

# Check OAuth token
echo ""
echo "Checking OAuth token..."
if [[ "$CLAUDE_CODE_OAUTH_TOKEN" == sk-ant-oat* ]]; then
    echo "   OAuth token configured"
else
    echo "   OAuth token not set"
    echo ""
    echo "   Run: claude setup-token"
    echo "   Then add to .env: CLAUDE_CODE_OAUTH_TOKEN=<token>"
    echo ""
fi

# Check E2B
echo "Checking E2B..."
if [[ "$E2B_API_KEY" == e2b_* ]]; then
    echo "   E2B API key configured"
else
    echo "   E2B API key not set"
    echo ""
    echo "   Run: e2b auth login"
    echo "   Get key from: https://e2b.dev/dashboard"
    echo "   Add to .env: E2B_API_KEY=<key>"
    echo ""
fi

# Check template
echo "Checking E2B template..."
if [ -n "$E2B_TEMPLATE_ID" ]; then
    echo "   Template ID: $E2B_TEMPLATE_ID"
else
    echo "   Template not built"
    echo ""
    echo "   Build it with:"
    echo "   cd agents/base"
    echo "   source ../../.venv/bin/activate"
    echo "   export E2B_API_KEY=<your-key>"
    echo "   python build_dev.py"
    echo ""
fi

# Summary
echo ""
echo "=================================================="
echo "Status"
echo "=================================================="

all_good=true

if [[ "$CLAUDE_CODE_OAUTH_TOKEN" == sk-ant-oat* ]]; then
    echo "   [ok] OAuth Token"
else
    echo "   [  ] OAuth Token"
    all_good=false
fi

if [[ "$E2B_API_KEY" == e2b_* ]]; then
    echo "   [ok] E2B API Key"
else
    echo "   [  ] E2B API Key"
    all_good=false
fi

if [ -n "$E2B_TEMPLATE_ID" ]; then
    echo "   [ok] E2B Template"
else
    echo "   [  ] E2B Template"
    all_good=false
fi

echo ""

if [ "$all_good" = true ]; then
    echo "Ready! Run an agent with:"
    echo ""
    echo "   source .venv/bin/activate"
    echo "   python run_agent.py \"Your prompt here\""
    echo ""
    echo "Or run the test:"
    echo ""
    echo "   python scripts/test_sandbox.py"
else
    echo "Fix the issues above, then run: ./onboarding.sh"
fi
