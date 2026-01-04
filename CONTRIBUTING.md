# Contributing to Claude Agent SDK Experiments

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/claude-agent-sdk-experiments.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit your changes: `git commit -m "Add: brief description of changes"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Open a Pull Request

## Development Setup

1. Install Python 3.12+
2. Install dependencies: `pip install -e .`
3. Copy `.env.example` to `.env` and add your API keys
4. Run the onboarding script: `python onboarding.py`

## Code Style

- Follow PEP 8 for Python code
- Use type hints for function signatures
- Add docstrings to all public functions and classes
- Keep functions focused and concise
- Use meaningful variable names

## Security Guidelines

- Never commit API keys, tokens, or credentials
- Use `shlex.quote()` for shell command arguments
- Use `json.dumps()` for string escaping in code generation
- Validate all user inputs
- Test for injection vulnerabilities

## Testing

- Add tests for new features
- Ensure all tests pass before submitting PR
- Include both unit tests and integration tests where appropriate

## Documentation

- Update README.md if adding new features
- Add docstrings to new functions
- Update CLAUDE.md files if changing agent behavior
- Include examples for new functionality

## Pull Request Process

1. Ensure your code follows the style guidelines
2. Update documentation as needed
3. Add tests for new functionality
4. Ensure all tests pass
5. Update CHANGELOG.md with your changes
6. Reference any related issues in your PR description

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect differing opinions and experiences

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about usage
- Clarification on documentation

Thank you for contributing!
