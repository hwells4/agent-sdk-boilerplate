"""Test that all modules can be imported without errors."""

import pytest


def test_import_run_agent():
    """Test that run_agent module can be imported."""
    try:
        import run_agent
        assert hasattr(run_agent, "run_agent")
        assert hasattr(run_agent, "main")
    except ImportError as e:
        pytest.fail(f"Failed to import run_agent: {e}")


def test_import_examples_basic_async():
    """Test that basic_async example can be imported."""
    try:
        import sys
        from pathlib import Path

        examples_dir = Path(__file__).parent.parent / "examples"
        sys.path.insert(0, str(examples_dir))

        # Import would fail if syntax errors exist
        with open(examples_dir / "basic_async.py") as f:
            compile(f.read(), "basic_async.py", "exec")
    except SyntaxError as e:
        pytest.fail(f"Syntax error in basic_async.py: {e}")


def test_import_examples_api_server():
    """Test that api_server example can be imported."""
    try:
        import sys
        from pathlib import Path

        examples_dir = Path(__file__).parent.parent / "examples"
        sys.path.insert(0, str(examples_dir))

        # Import would fail if syntax errors exist
        with open(examples_dir / "api_server.py") as f:
            compile(f.read(), "api_server.py", "exec")
    except SyntaxError as e:
        pytest.fail(f"Syntax error in api_server.py: {e}")


def test_import_validate_setup():
    """Test that validate_setup script can be imported."""
    try:
        import sys
        from pathlib import Path

        scripts_dir = Path(__file__).parent.parent / "scripts"
        sys.path.insert(0, str(scripts_dir))

        with open(scripts_dir / "validate_setup.py") as f:
            compile(f.read(), "validate_setup.py", "exec")
    except SyntaxError as e:
        pytest.fail(f"Syntax error in validate_setup.py: {e}")
