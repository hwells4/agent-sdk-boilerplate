# Permission Patterns Reference

## Permission Levels

### Restricted (Read-Only)

**Use for:**
- Audit agents
- Analysis agents
- Reporting agents
- Agents that should never modify files

**Configuration:**
```json
{
  "permissions": {
    "bash": {
      "allow": [
        "ls", "cat", "grep", "find", "head", "tail",
        "wc", "du", "df", "ps", "top"
      ],
      "deny": ["*"]
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": [
        "**/.*",
        "**/node_modules/**",
        "**/.git/**"
      ]
    },
    "tools": {
      "Write": false,
      "Edit": false,
      "Bash": {
        "allow_commands": ["ls", "cat", "grep", "find"]
      }
    }
  }
}
```

### Standard (Default)

**Use for:**
- Development agents
- Build agents
- Testing agents
- Most general-purpose agents

**Configuration:**
```json
{
  "permissions": {
    "bash": {
      "allow": [
        "git", "npm", "npx", "pip", "pip3", "python", "python3",
        "node", "make", "pytest", "ls", "cat", "grep", "find",
        "mkdir", "cp", "mv", "touch"
      ],
      "deny": [
        "rm -rf /",
        "rm -rf /*",
        "chmod 777",
        "chmod -R 777",
        "dd if=",
        "mkfs",
        "sudo su",
        "sudo -i",
        "> /dev/sda",
        ":(){ :|:& };:"
      ]
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": [
        "/etc/**",
        "/sys/**",
        "/proc/**",
        "/root/**",
        "/home/user/.ssh/**"
      ]
    }
  }
}
```

### Elevated (Use with Caution)

**Use for:**
- Infrastructure deployment agents
- System configuration agents
- Agents that need sudo access

**Configuration:**
```json
{
  "permissions": {
    "bash": {
      "allow": ["*"],
      "deny": [
        "rm -rf /",
        "rm -rf /*",
        "dd if=/dev/zero of=/dev/sda",
        "mkfs.ext4 /dev/sda",
        ":(){ :|:& };:",
        "chmod -R 777 /",
        "chown -R root:root /"
      ]
    },
    "files": {
      "allow": ["**"],
      "deny": [
        "/proc/**",
        "/sys/**"
      ]
    },
    "tools": {
      "Bash": {
        "require_approval": false
      }
    }
  }
}
```

## Dangerous Commands to Always Deny

```json
{
  "bash": {
    "deny": [
      "rm -rf /",                    // Delete root filesystem
      "rm -rf /*",                   // Delete everything
      ":(){ :|:& };:",               // Fork bomb
      "dd if=/dev/zero of=/dev/sda", // Wipe disk
      "mkfs",                        // Format filesystem
      "chmod -R 777 /",              // Insecure permissions on root
      "chown -R root:root /",        // Change ownership of root
      "sudo su",                     // Become root user
      "sudo -i",                     // Interactive root shell
      "> /dev/sda",                  // Redirect to disk device
      "cat /dev/urandom > /dev/sda", // Fill disk with random data
      "curl ... | bash",             // Execute remote scripts (context-dependent)
      "wget ... -O - | sh"           // Execute remote scripts (context-dependent)
    ]
  }
}
```

## File Access Patterns

### Workspace-Only Access
```json
{
  "files": {
    "allow": ["/home/user/workspace/**"],
    "deny": ["**"]
  }
}
```

### Home Directory Access
```json
{
  "files": {
    "allow": ["/home/user/**"],
    "deny": [
      "/home/user/.ssh/**",
      "/home/user/.gnupg/**",
      "/home/user/.aws/**"
    ]
  }
}
```

### System-Wide Access (Elevated)
```json
{
  "files": {
    "allow": ["**"],
    "deny": [
      "/etc/shadow",
      "/etc/passwd",
      "/proc/**",
      "/sys/**",
      "/root/.ssh/**"
    ]
  }
}
```

## Tool-Specific Permissions

### Git Operations
```json
{
  "bash": {
    "allow": [
      "git clone",
      "git pull",
      "git fetch",
      "git status",
      "git diff",
      "git log",
      "git add",
      "git commit",
      "git push"
    ],
    "deny": [
      "git push --force origin main",
      "git push --force origin master",
      "git reset --hard HEAD~",
      "git clean -fdx"
    ]
  }
}
```

### Package Management
```json
{
  "bash": {
    "allow": [
      "npm install",
      "npm ci",
      "npm run",
      "pip install",
      "pip install -r requirements.txt"
    ],
    "deny": [
      "npm install -g",
      "pip install --break-system-packages"
    ]
  }
}
```

### Docker Operations (Elevated Only)
```json
{
  "bash": {
    "allow": [
      "docker build",
      "docker run",
      "docker ps",
      "docker logs",
      "docker exec"
    ],
    "deny": [
      "docker run --privileged",
      "docker run --pid=host",
      "docker system prune -a -f"
    ]
  }
}
```

## MCP Server Permissions

### Memory MCP (Safe for all levels)
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

### Filesystem MCP (Standard+)
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/workspace"
      ],
      "permissions": {
        "allow_write": true,
        "allow_delete": false
      }
    }
  }
}
```

### Browser MCP (Standard)
```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-playwright"]
    }
  }
}
```

### Database MCP (Elevated or with credentials)
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:pass@localhost/db"
      ]
    }
  }
}
```

## Security Best Practices

1. **Default Deny**: Start with minimal permissions, add as needed
2. **Explicit Allow**: Whitelist specific commands rather than patterns
3. **Defense in Depth**: Layer multiple restrictions (bash + files + tools)
4. **Audit Trail**: Log all elevated operations
5. **Credential Isolation**: Never bake secrets into templates
6. **Sandbox Boundaries**: Respect E2B's isolation guarantees
7. **Regular Review**: Audit permissions when agent behavior changes

## Permission Decision Tree

```
Is the agent modifying files?
├─ No  → Restricted
└─ Yes → Does it need system access?
    ├─ No  → Standard
    └─ Yes → Does it need sudo/root?
        ├─ No  → Standard with specific allowlist
        └─ Yes → Elevated with specific denylist
```

## Examples by Use Case

### Code Review Agent
```json
{
  "permissions": {
    "bash": {
      "allow": ["git", "grep", "find", "cat", "diff"],
      "deny": ["git push", "git commit"]
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": []
    }
  }
}
```

### Deployment Agent
```json
{
  "permissions": {
    "bash": {
      "allow": ["kubectl", "docker", "helm", "aws", "gcloud"],
      "deny": ["kubectl delete namespace", "kubectl delete all"]
    },
    "files": {
      "allow": ["**"],
      "deny": ["/etc/**", "/sys/**"]
    }
  }
}
```

### Data Analysis Agent
```json
{
  "permissions": {
    "bash": {
      "allow": ["python", "jupyter", "pandas"],
      "deny": []
    },
    "files": {
      "allow": ["/home/user/workspace/**"],
      "deny": []
    }
  }
}
```
