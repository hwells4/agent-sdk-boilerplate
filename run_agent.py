#!/usr/bin/env python3
"""
Run a Claude agent in an E2B sandbox.

This is the main entry point for running agents. It spins up an isolated
sandbox with the Claude Agent SDK pre-installed and runs your prompt.

Usage:
    python run_agent.py "Your prompt here"
    python run_agent.py --prompt "Your prompt here" --timeout 120
"""

import argparse
import asyncio
import json
import os
import sys

from dotenv import load_dotenv
from e2b import AsyncSandbox


load_dotenv()


async def run_agent(prompt: str, timeout: int = 120, verbose: bool = False) -> str:
    """
    Run a Claude agent in an E2B sandbox.

    Args:
        prompt: The task/prompt for the agent
        timeout: Sandbox timeout in seconds
        verbose: Print debug output

    Returns:
        The agent's final result
    """
    template_id = os.getenv("E2B_TEMPLATE_ID")
    oauth_token = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")

    if not template_id:
        raise ValueError("E2B_TEMPLATE_ID not set. Run: ./setup.sh")
    if not oauth_token:
        raise ValueError("CLAUDE_CODE_OAUTH_TOKEN not set. Run: ./setup.sh")

    # Agent code to run inside sandbox
    # Use json.dumps to safely escape the prompt
    agent_code = f'''
import asyncio
import json
from claude_agent_sdk import query

async def main():
    result = None
    prompt = json.loads({json.dumps(json.dumps(prompt))})
    async for msg in query(prompt=prompt):
        if hasattr(msg, "result"):
            result = msg.result
    if result:
        print(result)

asyncio.run(main())
'''

    if verbose:
        print(f"Starting sandbox (template: {template_id})...")

    sandbox = await AsyncSandbox.create(
        template=template_id,
        timeout=timeout,
        envs={"CLAUDE_CODE_OAUTH_TOKEN": oauth_token}
    )

    try:
        if verbose:
            print("Sandbox started. Running agent...")

        # Write and execute agent
        await sandbox.files.write("/home/user/agent.py", agent_code)
        result = await sandbox.commands.run(
            "python3 /home/user/agent.py",
            timeout=timeout
        )

        if result.exit_code != 0:
            raise RuntimeError(f"Agent failed: {result.stderr}")

        return result.stdout.strip()

    finally:
        await sandbox.kill()
        if verbose:
            print("Sandbox terminated.")


def main():
    parser = argparse.ArgumentParser(
        description="Run a Claude agent in an E2B sandbox"
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="The prompt/task for the agent"
    )
    parser.add_argument(
        "-p", "--prompt",
        dest="prompt_flag",
        help="The prompt/task for the agent (alternative)"
    )
    parser.add_argument(
        "-t", "--timeout",
        type=int,
        default=120,
        help="Sandbox timeout in seconds (default: 120)"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Print debug output"
    )

    args = parser.parse_args()

    # Get prompt from either positional or flag argument
    prompt = args.prompt or args.prompt_flag

    if not prompt:
        parser.print_help()
        sys.exit(1)

    try:
        result = asyncio.run(run_agent(
            prompt=prompt,
            timeout=args.timeout,
            verbose=args.verbose
        ))
        print(result)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
