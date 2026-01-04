#!/usr/bin/env python3
"""Validate E2B sandbox template and credentials setup."""

import os
import sys
from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()


def check_environment() -> bool:
    """Check that required environment variables are set."""
    print("Checking environment variables...")

    required_vars = {
        "E2B_API_KEY": "E2B API key",
        "E2B_TEMPLATE_ID": "E2B template ID",
        "CLAUDE_CODE_OAUTH_TOKEN": "Claude OAuth token"
    }

    missing = []
    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value:
            print(f"❌ {var} not set ({description})")
            missing.append(var)
        else:
            # Show partial value for verification
            preview = value[:10] + "..." if len(value) > 10 else value
            print(f"✅ {var}: {preview}")

    if missing:
        print(f"\n❌ Missing {len(missing)} required environment variable(s)")
        print("Run: python onboarding.py")
        return False

    return True


def validate_sandbox() -> bool:
    """Spin up sandbox and verify Claude Code is installed."""
    template_id = os.getenv("E2B_TEMPLATE_ID")

    if not template_id:
        print("❌ E2B_TEMPLATE_ID not found in environment")
        return False

    print(f"\nCreating sandbox from template: {template_id}")

    try:
        sandbox = Sandbox.create(template=template_id, timeout=60)
    except Exception as e:
        print(f"❌ Failed to create sandbox: {e}")
        print("\nPossible solutions:")
        print("- Check your E2B_API_KEY is valid")
        print("- Rebuild the template: npm run build:template")
        print("- Check E2B status: https://status.e2b.dev/")
        return False

    try:
        print("✅ Sandbox created successfully")
        print(f"   Sandbox ID: {sandbox.sandbox_id}")

        # Test Claude Code is installed
        result = sandbox.commands.run("claude --version")
        if result.exit_code == 0:
            print(f"✅ Claude Code: {result.stdout.strip()}")
        else:
            print(f"❌ Claude Code not found: {result.stderr}")
            return False

        # Test ripgrep is installed
        result = sandbox.commands.run("rg --version")
        if result.exit_code == 0:
            version_parts = result.stdout.split()
            version = f"{version_parts[0]} {version_parts[1]}" if len(version_parts) > 1 else result.stdout.strip()
            print(f"✅ ripgrep: {version}")
        else:
            print(f"⚠️  ripgrep not found (optional)")

        # Test Python SDK is installed
        result = sandbox.commands.run(
            "python3 -c 'import claude_agent_sdk; print(claude_agent_sdk.__version__)'"
        )
        if result.exit_code == 0:
            print(f"✅ claude-agent-sdk: {result.stdout.strip()}")
        else:
            print(f"❌ claude-agent-sdk not found: {result.stderr}")
            return False

        # Test basic command execution
        result = sandbox.commands.run("echo 'Hello from E2B!'")
        if result.exit_code == 0:
            print(f"✅ Command execution: {result.stdout.strip()}")
        else:
            print(f"❌ Command execution failed")
            return False

        print("\n✅ Sandbox validation successful!")
        return True

    finally:
        sandbox.kill()
        print("✅ Sandbox cleaned up")


def main():
    """Run all validation checks."""
    print("=" * 50)
    print("Claude Agent SDK - Setup Validation")
    print("=" * 50)
    print()

    # Check environment variables
    if not check_environment():
        sys.exit(1)

    # Validate sandbox template
    if not validate_sandbox():
        sys.exit(1)

    print()
    print("=" * 50)
    print("🎉 All validation checks passed!")
    print("=" * 50)
    print()
    print("You're ready to run agents:")
    print('  python run_agent.py "Your prompt here"')
    print()


if __name__ == "__main__":
    main()
