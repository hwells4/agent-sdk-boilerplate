# Tests

This directory contains tests for the Claude Agent SDK Experiments project.

## Running Tests

### Install Test Dependencies

```bash
pip install pytest pytest-asyncio
```

### Run All Tests

```bash
pytest
```

### Run Specific Test Files

```bash
pytest tests/test_environment.py
pytest tests/test_imports.py
```

### Run with Verbose Output

```bash
pytest -v
```

## Test Categories

### Unit Tests
- `test_environment.py` - Project structure and configuration validation
- `test_imports.py` - Module import verification

### Integration Tests (Future)
- `test_sandbox_integration.py` - E2B sandbox creation and execution
- `test_agent_execution.py` - End-to-end agent runs

## Test Markers

Tests can be marked with custom markers:

- `@pytest.mark.slow` - Slow-running tests
- `@pytest.mark.integration` - Integration tests requiring API keys
- `@pytest.mark.sandbox` - Tests that create E2B sandboxes

### Running Specific Markers

```bash
# Run only fast tests
pytest -m "not slow"

# Run only integration tests
pytest -m integration

# Skip sandbox tests
pytest -m "not sandbox"
```

## Adding New Tests

1. Create a new test file in `tests/` with the naming pattern `test_*.py`
2. Define test functions with the prefix `test_`
3. Use appropriate markers for categorization
4. Add docstrings to explain what each test validates

Example:

```python
import pytest

def test_my_feature():
    """Test that my feature works correctly."""
    # Arrange
    expected = "result"

    # Act
    actual = my_function()

    # Assert
    assert actual == expected
```

## Continuous Integration

These tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: |
    pip install pytest pytest-asyncio
    pytest
```

## Future Tests

Planned test additions:

- [ ] Sandbox creation and cleanup tests
- [ ] Agent execution tests (mocked)
- [ ] Error handling tests
- [ ] Security tests (injection prevention)
- [ ] Performance benchmarks
