# Claude Agent SDK Experiments

## Linear Integration

When working with Linear issues in this project, use these IDs:

**Team:** Personal
- ID: `ba448a94-9034-45a1-8130-85262a1b45bd`
- Prefix: `PER`

**Project:** Claude Agent SDK Experiments
- ID: `3971156d-d0f5-47ea-8f12-c1a11583254d`

### Creating Issues

```
mcp__linear-server__create_issue
  team: "Personal"
  project: "Claude Agent SDK Experiments"
  title: "Your issue title"
  description: "Description in markdown"
```

### Listing Project Issues

```
mcp__linear-server__list_issues
  team: "Personal"
  project: "Claude Agent SDK Experiments"
```

### Getting an Issue

Use the `PER-XX` identifier format:
```
mcp__linear-server__get_issue
  id: "PER-68"
```
