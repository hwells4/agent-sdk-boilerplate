#!/usr/bin/env python3
"""Onboarding script for Claude Agent SDK + E2B setup."""

import os
import subprocess
import sys
from pathlib import Path


def run(cmd: str, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a shell command."""
    return subprocess.run(cmd, shell=True, capture_output=capture, text=True)


def check_python():
    """Check Python version."""
    print("📍 Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 12:
        print(f"   ✅ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"   ❌ Python 3.12+ required, found {version.major}.{version.minor}")
        return False


def check_venv():
    """Check/create virtual environment."""
    print("📍 Checking virtual environment...")
    venv_path = Path(".venv")

    if venv_path.exists():
        print("   ✅ .venv exists")
        return True

    print("   Creating .venv...")
    result = run("python3.12 -m venv .venv")
    if result.returncode == 0:
        print("   ✅ .venv created")
        return True
    else:
        print("   ❌ Failed to create .venv")
        return False


def check_dependencies():
    """Install Python dependencies."""
    print("📍 Checking dependencies...")

    deps = ["claude-agent-sdk", "e2b", "fastapi", "uvicorn", "python-dotenv", "httpx", "pydantic"]
    result = run(
        f"source .venv/bin/activate && pip install {' '.join(deps)} -q",
        capture=True
    )

    if result.returncode == 0:
        print("   ✅ All dependencies installed")
        return True
    else:
        print(f"   ❌ Failed: {result.stderr}")
        return False


def check_env_file():
    """Check/create .env file."""
    print("📍 Checking .env file...")
    env_path = Path(".env")

    if not env_path.exists():
        print("   Creating .env from .env.example...")
        if Path(".env.example").exists():
            run("cp .env.example .env")
        else:
            env_path.write_text("""# Claude Agent SDK Authentication
CLAUDE_CODE_OAUTH_TOKEN=

# E2B Sandbox
E2B_API_KEY=
E2B_TEMPLATE_ID=
""")
        print("   ✅ .env created (needs configuration)")
        return False

    print("   ✅ .env exists")
    return True


def check_oauth_token():
    """Check if OAuth token is configured."""
    print("📍 Checking OAuth token...")

    from dotenv import load_dotenv
    load_dotenv()

    token = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")

    if token and token.startswith("sk-ant-oat"):
        print("   ✅ OAuth token configured")
        return True

    print("   ❌ OAuth token not set")
    print("\n   To fix, run in your terminal:")
    print("   $ claude setup-token")
    print("   Then add the token to .env as CLAUDE_CODE_OAUTH_TOKEN=<token>")
    return False


def check_e2b_auth():
    """Check E2B authentication."""
    print("📍 Checking E2B authentication...")

    from dotenv import load_dotenv
    load_dotenv()

    api_key = os.getenv("E2B_API_KEY")

    if api_key and api_key.startswith("e2b_"):
        print("   ✅ E2B API key configured")
        return True

    print("   ❌ E2B API key not set")
    print("\n   To fix:")
    print("   1. Run: e2b auth login")
    print("   2. Get API key from https://e2b.dev/dashboard")
    print("   3. Add to .env as E2B_API_KEY=<key>")
    return False


def check_template():
    """Check if E2B template is configured."""
    print("📍 Checking E2B template...")

    from dotenv import load_dotenv
    load_dotenv()

    template_id = os.getenv("E2B_TEMPLATE_ID")

    if template_id:
        print(f"   ✅ Template ID: {template_id}")
        return True

    print("   ❌ Template ID not set")
    print("\n   To fix, build the template:")
    print("   $ cd agents/base")
    print("   $ python build_dev.py")
    print("   Then add the template ID to .env")
    return False


def test_sdk():
    """Test Claude Agent SDK locally."""
    print("📍 Testing Claude Agent SDK...")

    result = run(
        '''source .venv/bin/activate && source .env && python3 -c "
import asyncio
from claude_agent_sdk import query
async def test():
    async for msg in query(prompt='Say OK'):
        if hasattr(msg, 'result'):
            print(msg.result)
asyncio.run(test())
"''',
        capture=True
    )

    if result.returncode == 0 and result.stdout.strip():
        print(f"   ✅ SDK working: '{result.stdout.strip()}'")
        return True
    else:
        print(f"   ❌ SDK test failed: {result.stderr}")
        return False


def main():
    print("=" * 50)
    print("🚀 Claude Agent SDK + E2B Onboarding")
    print("=" * 50 + "\n")

    checks = [
        ("Python 3.12+", check_python),
        ("Virtual Environment", check_venv),
        ("Dependencies", check_dependencies),
        (".env File", check_env_file),
        ("OAuth Token", check_oauth_token),
        ("E2B Auth", check_e2b_auth),
        ("E2B Template", check_template),
    ]

    results = {}
    for name, check_fn in checks:
        try:
            results[name] = check_fn()
        except Exception as e:
            print(f"   ❌ Error: {e}")
            results[name] = False
        print()

    # Summary
    print("=" * 50)
    print("📋 Summary")
    print("=" * 50)

    all_passed = True
    for name, passed in results.items():
        status = "✅" if passed else "❌"
        print(f"   {status} {name}")
        if not passed:
            all_passed = False

    print()

    if all_passed:
        print("🎉 All checks passed!")
        print("\nRun SDK test? (tests authentication)")

        # Test SDK if everything else passed
        if test_sdk():
            print("\n✅ Ready to go!")
            print("\nRun an agent with:")
            print("   $ source .venv/bin/activate")
            print('   $ python run_agent.py "Your prompt here"')
            print("\nOr run the test:")
            print("   $ python scripts/test_sandbox.py")
    else:
        print("⚠️  Some checks failed. Fix the issues above and run again.")
        print("\n   $ python onboarding.py")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
