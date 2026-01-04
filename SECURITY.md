# Security Policy

## Supported Versions

This is an experimental project. We recommend always using the latest version from the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### For Security Issues

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues by:

1. Opening a private security advisory on GitHub (if available)
2. Or emailing the maintainers directly (check README for contact)

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any suggested fixes (optional)

### Response Timeline

- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide a detailed response within 7 days
- We will work on a fix and keep you updated on progress
- Once fixed, we will publicly acknowledge your responsible disclosure (unless you prefer to remain anonymous)

## Security Best Practices

When using this project:

### API Keys and Credentials

- **Never commit** `.env` files or credentials to version control
- Use environment variables for all sensitive data
- Rotate API keys regularly
- Use separate API keys for development and production

### Sandbox Security

- E2B sandboxes provide isolation, but treat them as untrusted environments
- Don't put sensitive data in sandboxes unless necessary
- Review all agent code before execution
- Set appropriate timeouts to prevent runaway processes

### Code Injection Prevention

- This project uses JSON serialization to prevent prompt injection
- Always use `shlex.quote()` when passing user input to shell commands
- Never use string interpolation with untrusted user input
- Validate and sanitize all external inputs

### Dependencies

- Keep all dependencies up to date
- Review security advisories for `claude-agent-sdk`, `e2b`, and other dependencies
- Use `pip install --upgrade` regularly
- Consider using `pip-audit` to scan for vulnerabilities

## Known Security Considerations

### E2B Sandbox Isolation

E2B sandboxes provide process-level isolation but:
- Network access is available by default
- File system is isolated per sandbox
- Resource limits can be configured

### Agent Execution

Claude agents can execute arbitrary code in sandboxes:
- Review agent prompts and instructions carefully
- Use `--dangerously-skip-permissions` only when you trust the configuration
- Monitor sandbox resource usage
- Set appropriate timeouts

### Third-Party Integrations

- MCP servers may have their own security considerations
- Review MCP server documentation and source code
- Use HTTPS for all MCP HTTP connections
- Validate MCP server responses

## Security Updates

We will:
- Address security vulnerabilities promptly
- Publish security advisories for confirmed vulnerabilities
- Credit researchers who responsibly disclose vulnerabilities
- Update this document as security practices evolve

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [E2B Security Documentation](https://e2b.dev/docs/security)
- [Claude API Security Best Practices](https://docs.anthropic.com/claude/docs/security)

Thank you for helping keep this project secure!
