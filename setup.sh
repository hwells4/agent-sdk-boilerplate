#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  Claude Agent SDK + E2B Setup"
echo "  Automated onboarding in 3 steps"
echo "=================================================="
echo ""

# Helper function to update .env file
update_env() {
    local key=$1
    local value=$2
    local env_file=".env"

    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        # Update existing key (works on both macOS and Linux)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$env_file"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
        fi
    else
        # Add new key
        echo "${key}=${value}" >> "$env_file"
    fi
}

# Step 0: Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "   Install from: https://nodejs.org/"
    exit 1
fi
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required (found v$node_version)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v)${NC}"

# Check claude CLI
if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}⚠️  Claude CLI not found${NC}"
    echo ""
    echo "   Installing Claude CLI..."
    npm install -g @anthropics/claude-code
    echo ""
fi
echo -e "${GREEN}✅ Claude CLI installed${NC}"

echo ""

# Step 1: Setup .env file
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Environment Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
else
    echo -e "${YELLOW}ℹ️  .env file already exists${NC}"
fi

# Source existing .env to check what's already configured
set -a
source .env 2>/dev/null || true
set +a

# Step 2: Get Claude OAuth Token
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Claude OAuth Token${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ "$CLAUDE_CODE_OAUTH_TOKEN" == sk-ant-oat* ]]; then
    echo -e "${GREEN}✅ OAuth token already configured${NC}"
    echo "   Current token: ${CLAUDE_CODE_OAUTH_TOKEN:0:20}...${CLAUDE_CODE_OAUTH_TOKEN: -5}"
    echo ""
    read -p "   Get a new token? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        SKIP_OAUTH=true
    fi
fi

if [ "$SKIP_OAUTH" != true ]; then
    echo "   This will open your browser to authenticate with Claude."
    echo "   You'll need a Claude Max subscription (or API key alternative)."
    echo ""
    read -p "   Press Enter to continue (or Ctrl+C to skip)..."
    echo ""

    # Run claude setup-token and capture output
    echo -e "${YELLOW}Running: claude setup-token${NC}"
    echo ""

    # Create a temporary file to capture output
    temp_output=$(mktemp)

    # Run the command, showing output to user and capturing it
    if claude setup-token 2>&1 | tee "$temp_output"; then
        # Try to extract token from output
        # The token format is: sk-ant-oat followed by base64-like characters
        token=$(grep -o 'sk-ant-oat[a-zA-Z0-9_-]*' "$temp_output" | head -1 || echo "")

        if [ -n "$token" ]; then
            echo ""
            echo -e "${GREEN}✅ Token extracted successfully${NC}"
            echo "   Token: ${token:0:20}...${token: -5}"
            echo ""
            read -p "   Write this token to .env? (Y/n): " -n 1 -r
            echo

            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                update_env "CLAUDE_CODE_OAUTH_TOKEN" "$token"
                echo -e "${GREEN}✅ OAuth token saved to .env${NC}"
                CLAUDE_CODE_OAUTH_TOKEN=$token
            else
                echo -e "${YELLOW}⚠️  Skipped saving token${NC}"
                echo "   You can manually add it to .env:"
                echo "   CLAUDE_CODE_OAUTH_TOKEN=$token"
            fi
        else
            echo ""
            echo -e "${YELLOW}⚠️  Could not auto-extract token${NC}"
            echo "   Please manually add it to .env:"
            echo "   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat..."
        fi
    else
        echo ""
        echo -e "${YELLOW}⚠️  Token setup failed or was cancelled${NC}"
        echo "   You can run this manually later: claude setup-token"
    fi

    rm -f "$temp_output"
fi

# Step 3: Get E2B API Key
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: E2B Sandbox API Key${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ "$E2B_API_KEY" == e2b_* ]]; then
    echo -e "${GREEN}✅ E2B API key already configured${NC}"
    echo "   Current key: ${E2B_API_KEY:0:15}...${E2B_API_KEY: -5}"
    echo ""
    read -p "   Get a new key? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        SKIP_E2B=true
    fi
fi

if [ "$SKIP_E2B" != true ]; then
    # Check if e2b CLI is installed
    if ! command -v e2b &> /dev/null; then
        echo "   Installing E2B CLI..."
        npm install -g @e2b/cli
        echo ""
    fi

    echo "   This will open your browser to authenticate with E2B."
    echo "   A free account includes 100 sandboxes/month."
    echo ""
    read -p "   Press Enter to continue (or Ctrl+C to skip)..."
    echo ""

    echo -e "${YELLOW}Running: e2b auth login${NC}"
    echo ""

    if e2b auth login; then
        echo ""
        echo -e "${GREEN}✅ E2B authentication successful${NC}"

        # Try to get API key from e2b config
        e2b_config="$HOME/.e2b/config.json"
        if [ -f "$e2b_config" ]; then
            # Extract API key from config.json
            api_key=$(grep -o '"accessToken":"e2b_[^"]*"' "$e2b_config" | cut -d'"' -f4 || echo "")

            if [ -n "$api_key" ]; then
                echo ""
                echo -e "${GREEN}✅ API key extracted successfully${NC}"
                echo "   Key: ${api_key:0:15}...${api_key: -5}"
                echo ""
                read -p "   Write this key to .env? (Y/n): " -n 1 -r
                echo

                if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                    update_env "E2B_API_KEY" "$api_key"
                    echo -e "${GREEN}✅ E2B API key saved to .env${NC}"
                    E2B_API_KEY=$api_key
                else
                    echo -e "${YELLOW}⚠️  Skipped saving API key${NC}"
                    echo "   You can manually add it to .env:"
                    echo "   E2B_API_KEY=$api_key"
                fi
            fi
        fi

        # If we couldn't extract it, ask user to copy it
        if [ -z "$api_key" ]; then
            echo ""
            echo -e "${YELLOW}Could not auto-extract API key from E2B config${NC}"
            echo "   Get your key from: https://e2b.dev/dashboard"
            echo "   Then add it to .env:"
            echo "   E2B_API_KEY=e2b_..."
        fi
    else
        echo ""
        echo -e "${YELLOW}⚠️  E2B authentication failed or was cancelled${NC}"
        echo "   You can run this manually later: e2b auth login"
        echo "   Or get your key from: https://e2b.dev/dashboard"
    fi
fi

# Reload .env to get latest values
set -a
source .env 2>/dev/null || true
set +a

# Step 4: Install dependencies
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Install Dependencies${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Step 5: Build E2B Template
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Build E2B Template${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -n "$E2B_TEMPLATE_ID" ]; then
    echo -e "${GREEN}✅ E2B template already built${NC}"
    echo "   Template ID: $E2B_TEMPLATE_ID"
    echo ""
    read -p "   Rebuild template? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        SKIP_TEMPLATE=true
    fi
fi

if [ "$SKIP_TEMPLATE" != true ] && [ -n "$E2B_API_KEY" ]; then
    echo "Building E2B template (this may take 2-3 minutes)..."
    echo ""

    if npm run build:template; then
        # Reload .env to get the template ID that was just saved
        set -a
        source .env 2>/dev/null || true
        set +a

        echo ""
        echo -e "${GREEN}✅ E2B template built successfully${NC}"
        echo "   Template ID: $E2B_TEMPLATE_ID"
    else
        echo ""
        echo -e "${RED}❌ Template build failed${NC}"
        echo "   You can try manually:"
        echo "   npm run build:template"
    fi
elif [ -z "$E2B_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  Skipping template build (E2B API key not set)${NC}"
fi

# Final Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Setup Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

all_good=true

if [[ "$CLAUDE_CODE_OAUTH_TOKEN" == sk-ant-oat* ]]; then
    echo -e "${GREEN}✅ Claude OAuth Token${NC}"
else
    echo -e "${RED}❌ Claude OAuth Token${NC}"
    all_good=false
fi

if [[ "$E2B_API_KEY" == e2b_* ]]; then
    echo -e "${GREEN}✅ E2B API Key${NC}"
else
    echo -e "${RED}❌ E2B API Key${NC}"
    all_good=false
fi

if [ -n "$E2B_TEMPLATE_ID" ]; then
    echo -e "${GREEN}✅ E2B Template Built${NC}"
else
    echo -e "${RED}❌ E2B Template${NC}"
    all_good=false
fi

echo ""

if [ "$all_good" = true ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 Setup Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Try running your first agent:"
    echo ""
    echo "  npm run example"
    echo ""
    echo "Or explore the examples:"
    echo ""
    echo "  npm run streaming        # Streaming with callbacks"
    echo "  npm run console-stream   # Colored console output"
    echo "  npm run sse-api          # Full SSE server + web UI"
    echo ""
else
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠️  Setup Incomplete${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Please complete the missing steps:"
    echo ""

    if [[ "$CLAUDE_CODE_OAUTH_TOKEN" != sk-ant-oat* ]]; then
        echo "  1. Get OAuth token: claude setup-token"
        echo "     Then add to .env: CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat..."
        echo ""
    fi

    if [[ "$E2B_API_KEY" != e2b_* ]]; then
        echo "  2. Get E2B API key: e2b auth login"
        echo "     Or from: https://e2b.dev/dashboard"
        echo "     Then add to .env: E2B_API_KEY=e2b_..."
        echo ""
    fi

    if [ -z "$E2B_TEMPLATE_ID" ]; then
        echo "  3. Build E2B template: npm run build:template"
        echo ""
    fi

    echo "Then re-run: ./setup.sh"
    echo ""
fi
