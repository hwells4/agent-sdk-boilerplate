# Claude Agent SDK Experiments

This project demonstrates how to run Claude agents in isolated E2B sandboxes.

## Optional: Linear Integration

If you want to use Linear for issue tracking with Claude Code, you can configure the Linear MCP server:

1. Install the Linear MCP server (see `.mcp.json.example`)
2. Get your Linear team and project IDs from Linear's API
3. Update this file with your specific configuration

### Example Linear Integration

```markdown
**Team:** YourTeam
- ID: `your-team-id`
- Prefix: `ABC`

**Project:** YourProject
- ID: `your-project-id`

### Creating Issues

mcp__linear-server__create_issue
  team: "YourTeam"
  project: "YourProject"
  title: "Your issue title"
  description: "Description in markdown"
```

You can remove this section entirely if you don't use Linear.
