#!/usr/bin/env python3
"""
Simple example: Run a Claude agent in an E2B sandbox.

This is a minimal example showing how to:
1. Create an E2B sandbox with our template
2. Run Claude Agent SDK inside it
3. Get the result back

For production use, see the root run_agent.py
"""

import asyncio
import os

from dotenv import load_dotenv
from e2b import AsyncSandbox


load_dotenv()


async def main():
    template_id = os.getenv("E2B_TEMPLATE_ID")
    oauth_token = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")

    # Simple prompt
    prompt = "What is 2 + 2? Reply in exactly 5 words."

    # Agent code to run in sandbox
    agent_code = f'''
import asyncio
from claude_agent_sdk import query

async def run():
    async for msg in query(prompt="{prompt}"):
        if hasattr(msg, "result"):
            print(msg.result)

asyncio.run(run())
'''

    print(f"Starting sandbox...")
    sandbox = await AsyncSandbox.create(
        template=template_id,
        timeout=60,
        envs={"CLAUDE_CODE_OAUTH_TOKEN": oauth_token}
    )

    try:
        print("Running agent...")
        await sandbox.files.write("/home/user/agent.py", agent_code)
        result = await sandbox.commands.run("python3 /home/user/agent.py", timeout=60)

        print(f"\n--- Result ---")
        print(result.stdout)

        if result.stderr:
            print(f"--- Errors ---")
            print(result.stderr)

    finally:
        await sandbox.kill()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
