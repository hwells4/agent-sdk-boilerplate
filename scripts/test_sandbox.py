#!/usr/bin/env python3
"""Test E2B sandbox template with Claude Agent SDK."""

import os
from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

TEMPLATE_ID = os.getenv("E2B_TEMPLATE_ID", "1c7p8fashnxt22bhluv1")


def test_sandbox():
    """Spin up sandbox and verify Claude Code is installed."""
    print(f"Starting sandbox with template: {TEMPLATE_ID}")

    sandbox = Sandbox.create(template=TEMPLATE_ID, timeout=60)
    try:
        print("✅ Sandbox started")

        # Test Claude Code is installed
        result = sandbox.commands.run("claude --version")
        print(f"✅ Claude Code version: {result.stdout.strip()}")

        # Test ripgrep is installed
        result = sandbox.commands.run("rg --version")
        print(f"✅ ripgrep: {result.stdout.split()[0]} {result.stdout.split()[1]}")

        # Test Python SDK is installed
        result = sandbox.commands.run("python3 -c 'import claude_agent_sdk; print(claude_agent_sdk.__version__)'")
        print(f"✅ claude-agent-sdk: {result.stdout.strip()}")

        # Test we can run a simple command
        result = sandbox.commands.run("echo 'Hello from E2B sandbox!'")
        print(f"✅ Echo test: {result.stdout.strip()}")

    finally:
        sandbox.kill()

    print("\n🎉 All tests passed! Sandbox is ready for agents.")


if __name__ == "__main__":
    test_sandbox()
