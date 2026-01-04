"""Test environment configuration and setup."""

import os
import pytest
from pathlib import Path


def test_project_structure():
    """Verify expected project structure exists."""
    project_root = Path(__file__).parent.parent

    expected_files = [
        "run_agent.py",
        "requirements.txt",
        "README.md",
        "LICENSE",
        ".env.example",
    ]

    for file in expected_files:
        assert (project_root / file).exists(), f"Missing file: {file}"


def test_example_files_exist():
    """Verify example files are present."""
    project_root = Path(__file__).parent.parent
    examples_dir = project_root / "examples"

    expected_examples = [
        "basic_async.py",
        "basic_sync.py",
        "api_server.py",
    ]

    for example in expected_examples:
        assert (examples_dir / example).exists(), f"Missing example: {example}"


def test_agents_directory():
    """Verify agents directory structure."""
    project_root = Path(__file__).parent.parent
    agents_dir = project_root / "agents"

    assert agents_dir.exists(), "agents/ directory not found"
    assert (agents_dir / "base").exists(), "agents/base/ not found"
    assert (agents_dir / "base" / "template.py").exists(), "base template not found"


def test_env_example_has_required_vars():
    """Verify .env.example contains required variables."""
    project_root = Path(__file__).parent.parent
    env_example = project_root / ".env.example"

    content = env_example.read_text()

    required_vars = [
        "CLAUDE_CODE_OAUTH_TOKEN",
        "E2B_API_KEY",
        "E2B_TEMPLATE_ID",
    ]

    for var in required_vars:
        assert var in content, f"Missing variable in .env.example: {var}"


@pytest.mark.skipif(
    not os.getenv("E2B_API_KEY"), reason="E2B_API_KEY not configured"
)
def test_e2b_api_key_format():
    """Verify E2B API key has expected format."""
    api_key = os.getenv("E2B_API_KEY")
    assert api_key.startswith("e2b_"), "E2B_API_KEY should start with 'e2b_'"


@pytest.mark.skipif(
    not os.getenv("CLAUDE_CODE_OAUTH_TOKEN"),
    reason="CLAUDE_CODE_OAUTH_TOKEN not configured",
)
def test_oauth_token_format():
    """Verify OAuth token has expected format."""
    token = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")
    assert token.startswith("sk-ant-oat"), "OAuth token should start with 'sk-ant-oat'"
