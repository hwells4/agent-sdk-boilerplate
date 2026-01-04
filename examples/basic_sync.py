#!/usr/bin/env python3
"""Run Claude Agent SDK inside E2B sandbox."""

import os
from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

TEMPLATE_ID = os.getenv("E2B_TEMPLATE_ID")
OAUTH_TOKEN = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")


def run_agent_in_sandbox():
    """Spin up sandbox and run Claude Agent SDK inside it."""
    print(f"🚀 Starting sandbox...")

    # Create sandbox with OAuth token as env var
    sandbox = Sandbox.create(
        template=TEMPLATE_ID,
        timeout=120,
        envs={"CLAUDE_CODE_OAUTH_TOKEN": OAUTH_TOKEN}
    )

    try:
        print("✅ Sandbox started")
        print("🤖 Running Claude Agent SDK inside sandbox...\n")

        # Write a simple agent script to the sandbox
        agent_code = '''
import asyncio
from claude_agent_sdk import query

async def main():
    print("Agent starting...")
    async for msg in query(prompt="What is 2 + 2? Reply in exactly 5 words."):
        if hasattr(msg, "content"):
            for block in msg.content:
                if hasattr(block, "text"):
                    print(f"Agent response: {block.text}")
        elif hasattr(msg, "result"):
            print(f"Final result: {msg.result}")

asyncio.run(main())
'''

        # Write the agent script to sandbox
        sandbox.files.write("/home/user/agent.py", agent_code)

        # Run the agent inside the sandbox
        result = sandbox.commands.run(
            "python3 /home/user/agent.py",
            timeout=60
        )

        print("--- Sandbox Output ---")
        print(result.stdout)
        if result.stderr:
            print("--- Stderr ---")
            print(result.stderr)

    finally:
        sandbox.kill()
        print("\n✅ Sandbox terminated")


if __name__ == "__main__":
    run_agent_in_sandbox()
