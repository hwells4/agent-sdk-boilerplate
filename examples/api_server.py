#!/usr/bin/env python3
"""FastAPI server for Claude Agent SDK in E2B sandboxes."""

import os
import asyncio
from typing import Optional
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from e2b import AsyncSandbox

load_dotenv()

TEMPLATE_ID = os.getenv("E2B_TEMPLATE_ID")
OAUTH_TOKEN = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")
E2B_API_KEY = os.getenv("E2B_API_KEY")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate config on startup."""
    missing = []
    if not TEMPLATE_ID:
        missing.append("E2B_TEMPLATE_ID")
    if not OAUTH_TOKEN:
        missing.append("CLAUDE_CODE_OAUTH_TOKEN")
    if not E2B_API_KEY:
        missing.append("E2B_API_KEY")

    if missing:
        print(f"⚠️  Missing env vars: {', '.join(missing)}")
        print("Run: python onboarding.py")
    else:
        print("✅ All credentials configured")
        print(f"📦 Template ID: {TEMPLATE_ID}")

    yield


app = FastAPI(
    title="Claude Agent API",
    description="Run Claude Agent SDK in isolated E2B sandboxes",
    version="0.1.0",
    lifespan=lifespan
)


class AgentRequest(BaseModel):
    """Request to run an agent."""
    prompt: str
    model: str = "claude-sonnet-4-5"
    timeout: int = 120
    allowed_tools: list[str] = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"]


class AgentResponse(BaseModel):
    """Response from agent execution."""
    success: bool
    result: Optional[str] = None
    error: Optional[str] = None
    sandbox_id: Optional[str] = None


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "template_id": TEMPLATE_ID,
        "credentials_configured": bool(OAUTH_TOKEN and E2B_API_KEY)
    }


@app.post("/agent/run", response_model=AgentResponse)
async def run_agent(request: AgentRequest):
    """Run a Claude agent in an E2B sandbox."""

    if not all([TEMPLATE_ID, OAUTH_TOKEN, E2B_API_KEY]):
        raise HTTPException(status_code=500, detail="Server not configured. Run onboarding.py")

    # Build the agent script using json for safe serialization
    import json

    agent_code = f'''
import asyncio
import json
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    result = None
    prompt = json.loads({json.dumps(json.dumps(request.prompt))})
    allowed_tools = json.loads({json.dumps(json.dumps(request.allowed_tools))})

    async for msg in query(
        prompt=prompt,
        options=ClaudeAgentOptions(
            model="{request.model}",
            allowed_tools=allowed_tools,
            max_turns=20
        )
    ):
        if hasattr(msg, "result"):
            result = msg.result

    if result:
        print(result)

asyncio.run(main())
'''

    sandbox = None
    try:
        # Create sandbox
        sandbox = await AsyncSandbox.create(
            template=TEMPLATE_ID,
            timeout=request.timeout,
            envs={"CLAUDE_CODE_OAUTH_TOKEN": OAUTH_TOKEN}
        )

        # Write and run agent
        await sandbox.files.write("/home/user/agent.py", agent_code)
        result = await sandbox.commands.run(
            "python3 /home/user/agent.py",
            timeout=request.timeout
        )

        if result.exit_code != 0:
            return AgentResponse(
                success=False,
                error=result.stderr or "Agent failed",
                sandbox_id=sandbox.sandbox_id
            )

        return AgentResponse(
            success=True,
            result=result.stdout.strip(),
            sandbox_id=sandbox.sandbox_id
        )

    except Exception as e:
        return AgentResponse(
            success=False,
            error=str(e),
            sandbox_id=sandbox.sandbox_id if sandbox else None
        )

    finally:
        if sandbox:
            await sandbox.kill()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
