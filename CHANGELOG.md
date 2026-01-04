# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure with E2B sandbox integration
- Base E2B template for Claude Agent SDK
- Knowledge Base Organizer agent example
- FastAPI server example (examples/api_server.py)
- Comprehensive README with setup instructions and troubleshooting
- LICENSE (MIT), CONTRIBUTING.md, and SECURITY.md files
- requirements.txt for dependency management
- Basic test infrastructure with pytest
- Validation script (scripts/validate_setup.py)
- CHANGELOG.md for tracking changes
- Automated setup.sh with credential capture and .env auto-configuration
  - Auto-runs `claude setup-token` and captures OAuth token
  - Auto-runs `e2b auth login` and extracts API key
  - Shows extracted credentials (partially masked) and asks for confirmation before writing
  - User can decline to save and script continues (no exit on 'no')
  - Automatically inserts credentials into .env file (with user approval)
  - Auto-installs missing CLIs (claude, e2b)
  - Auto-builds E2B template after credential setup
  - Color-coded output with step-by-step progress
  - Smart skip logic for already-configured credentials

### Changed
- Renamed example files for clarity:
  - `examples/run_agent.py` → `examples/basic_async.py`
  - `examples/run_agent_in_sandbox.py` → `examples/basic_sync.py`
  - `examples/server.py` → `examples/api_server.py`
- Renamed validation script:
  - `scripts/test_sandbox.py` → `scripts/validate_setup.py`
- Updated package.json scripts to reflect new file names
- Improved validation script with better error handling and env checks
- Removed hardcoded template ID fallback in validation script
- Updated CLAUDE.md to remove personal Linear configuration
- Completely rewrote setup.sh for automated onboarding experience

### Security
- Fixed prompt injection vulnerability in `run_agent.py` using JSON serialization
- Fixed shell injection vulnerability in `agents/organizer/run.py` using `shlex.quote()`
- Fixed syntax error in `examples/api_server.py` with proper JSON serialization
- Added proper input escaping for all user-provided strings
- Added security best practices documentation in SECURITY.md

### Removed
- Empty .claude/commands directory
- Personal Linear team and project IDs from CLAUDE.md
- Hardcoded template ID fallback in scripts
- Orphaned .mcp.json.example file (MCP configs belong in agent templates, not root level)
- Python-specific validation and testing from setup.sh (now TypeScript-first)

## [0.1.0] - Initial Release

### Added
- E2B sandbox integration with Claude Agent SDK
- Python-based agent runner with async support
- Onboarding scripts for environment setup
- Example agents and templates
- Documentation and examples
