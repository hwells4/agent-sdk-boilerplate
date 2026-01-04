#!/usr/bin/env python3
"""
Run script for the Knowledge Base Organizer agent.

Usage:
    python run.py                        # Interactive mode
    python run.py "organize my files"    # With initial prompt
    python run.py --workspace /path      # With local workspace to sync

This script:
1. Creates an E2B sandbox from the organizer template
2. Optionally syncs a local directory to the sandbox workspace
3. Runs Claude Code with the agent configuration
4. Streams output back to the terminal

Prerequisites:
    - E2B_API_KEY environment variable
    - ANTHROPIC_API_KEY environment variable
    - Template built with build.py
"""

import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path

try:
    from e2b import Sandbox
except ImportError:
    print("Error: e2b package not installed. Run: pip install e2b", file=sys.stderr)
    sys.exit(1)


def sync_workspace(sandbox: Sandbox, local_path: Path) -> None:
    """Sync a local directory to the sandbox workspace."""
    print(f"Syncing {local_path} to sandbox workspace...")

    for file_path in local_path.rglob("*"):
        if file_path.is_file():
            relative = file_path.relative_to(local_path)
            sandbox_path = f"/home/user/workspace/{relative}"

            # Create parent directories
            sandbox.commands.run(f"mkdir -p $(dirname {sandbox_path})")

            # Upload file
            content = file_path.read_bytes()
            sandbox.files.write(sandbox_path, content)
            print(f"  Uploaded: {relative}")

    print("Sync complete!")


def run_agent(
    sandbox: Sandbox,
    prompt: str | None = None,
    interactive: bool = True,
) -> None:
    """Run Claude Code agent in the sandbox."""

    # Set up the Claude Code command
    cmd_parts = [
        "cd /home/user/agent &&",
        "claude",
        "--dangerously-skip-permissions",  # We've pre-configured safe permissions
    ]

    if prompt:
        # Non-interactive mode with a specific prompt
        cmd_parts.extend(["--print", f'"{prompt}"'])
        interactive = False

    cmd = " ".join(cmd_parts)

    print("\nStarting Knowledge Base Organizer agent...")
    print("-" * 50)

    if interactive:
        # For interactive mode, we need to handle stdin/stdout
        # This is a simplified version - real implementation would use PTY
        print("Running in non-interactive mode (use --prompt for commands)")
        print("Type your request and press Enter:")

        try:
            user_input = input("> ")
            if user_input.strip():
                cmd = f'cd /home/user/agent && claude --dangerously-skip-permissions --print "{user_input}"'
                result = sandbox.commands.run(cmd, timeout=300)
                print(result.stdout)
                if result.stderr:
                    print(f"Errors: {result.stderr}", file=sys.stderr)
        except KeyboardInterrupt:
            print("\nExiting...")

    else:
        # Run with the provided prompt
        result = sandbox.commands.run(cmd, timeout=300)
        print(result.stdout)
        if result.stderr:
            print(f"Errors: {result.stderr}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="Run the Knowledge Base Organizer agent"
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        default=None,
        help="Initial prompt for the agent",
    )
    parser.add_argument(
        "--workspace",
        "-w",
        type=str,
        default=None,
        help="Local directory to sync to sandbox workspace",
    )
    parser.add_argument(
        "--template",
        "-t",
        type=str,
        default="knowledge-base-organizer",
        help="Template alias to use",
    )
    parser.add_argument(
        "--keep-alive",
        "-k",
        action="store_true",
        help="Keep sandbox running after agent completes",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Sandbox timeout in seconds (default: 300)",
    )

    args = parser.parse_args()

    # Check for required API keys
    if not os.environ.get("E2B_API_KEY"):
        print("Error: E2B_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    print(f"Creating sandbox from template: {args.template}")

    try:
        # Create the sandbox
        sandbox = Sandbox(
            template=args.template,
            timeout=args.timeout,
            envs={
                "ANTHROPIC_API_KEY": os.environ["ANTHROPIC_API_KEY"],
            },
        )

        print(f"Sandbox created: {sandbox.sandbox_id}")

        # Sync workspace if provided
        if args.workspace:
            workspace_path = Path(args.workspace).resolve()
            if not workspace_path.exists():
                print(f"Error: Workspace path does not exist: {workspace_path}", file=sys.stderr)
                sys.exit(1)
            sync_workspace(sandbox, workspace_path)

        # Run the agent
        run_agent(sandbox, prompt=args.prompt)

        # Handle sandbox lifecycle
        if args.keep_alive:
            print(f"\nSandbox kept alive: {sandbox.sandbox_id}")
            print("Connect with: e2b sandbox connect {sandbox.sandbox_id}")
        else:
            sandbox.kill()
            print("\nSandbox terminated.")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
