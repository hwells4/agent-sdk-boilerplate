#!/usr/bin/env python3
"""
Build script for the Knowledge Base Organizer agent template.

Usage:
    python build.py              # Build with default alias
    python build.py --dev        # Build with -dev suffix
    python build.py --alias NAME # Build with custom alias

This script builds the E2B template and registers it with your E2B account.
Make sure you have E2B_API_KEY set in your environment.
"""

import argparse
import sys
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from e2b import Template, default_build_logger

from template import template


def main():
    parser = argparse.ArgumentParser(
        description="Build the Knowledge Base Organizer agent template"
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Build as development template (adds -dev suffix)",
    )
    parser.add_argument(
        "--alias",
        type=str,
        default=None,
        help="Custom alias for the template",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show verbose build output",
    )

    args = parser.parse_args()

    # Determine the template alias
    if args.alias:
        alias = args.alias
    elif args.dev:
        alias = "knowledge-base-organizer-dev"
    else:
        alias = "knowledge-base-organizer"

    print(f"Building template: {alias}")
    print("-" * 40)

    try:
        result = Template.build(
            template,
            alias=alias,
            on_build_logs=default_build_logger() if args.verbose else None,
        )

        print("-" * 40)
        print(f"Template built successfully!")
        print(f"  Alias: {alias}")
        print(f"  Template ID: {result.template_id}")
        print()
        print("To use this template:")
        print(f'  sandbox = Sandbox.create("{alias}")')

    except Exception as e:
        print(f"Error building template: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
