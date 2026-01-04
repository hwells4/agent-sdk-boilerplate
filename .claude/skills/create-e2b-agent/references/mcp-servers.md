# MCP Servers Reference

## Available MCP Servers

### Memory MCP

**Purpose:** Persistent key-value storage across sessions

**Use cases:**
- Remember user preferences
- Store conversation history
- Maintain entity relationships
- Track task progress

**Configuration:**
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

**Operations:**
- `store(key, value)` - Save data
- `retrieve(key)` - Get data
- `delete(key)` - Remove data
- `list()` - List all keys

**When to use:** Any agent that needs to remember information between sessions

---

### Filesystem MCP

**Purpose:** Enhanced file operations and watchers

**Use cases:**
- File monitoring and change detection
- Batch file operations
- Directory synchronization
- Advanced file search

**Configuration:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/workspace"
      ]
    }
  }
}
```

**Operations:**
- File watching and change notifications
- Batch read/write operations
- Directory tree operations
- File metadata queries

**When to use:** Agents that need advanced file operations beyond basic Read/Write tools

---

### Browser MCP

**Purpose:** Playwright browser automation

**Use cases:**
- Web scraping
- UI testing
- Screenshot capture
- Form automation

**Configuration:**
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

**Operations:**
- Navigate to URLs
- Click elements
- Fill forms
- Take screenshots
- Extract page content

**When to use:** Agents that need to interact with web pages programmatically

**Note:** Requires `e2bdev/desktop` base image for GUI support

---

### Database MCP

**Purpose:** Database connections and queries

**Supported databases:**
- PostgreSQL
- MySQL
- SQLite
- MongoDB

**Configuration (PostgreSQL):**
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:password@host:5432/database"
      ],
      "env": {
        "POSTGRES_CONNECTION_STRING": "${POSTGRES_CONNECTION_STRING}"
      }
    }
  }
}
```

**Configuration (SQLite):**
```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "/home/user/workspace/data.db"
      ]
    }
  }
}
```

**Operations:**
- Execute SQL queries
- Schema introspection
- Transaction management
- Prepared statements

**When to use:** Agents that need to read/write structured data

**Security:** Use environment variables for connection strings, never hardcode credentials

---

### GitHub MCP

**Purpose:** GitHub API integration

**Use cases:**
- Create/update issues
- Manage pull requests
- Repository operations
- Code review automation

**Configuration:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**Operations:**
- List/create/update issues
- List/create/merge pull requests
- Repository metadata
- File operations via GitHub API

**When to use:** Agents that automate GitHub workflows

---

### Slack MCP

**Purpose:** Slack API integration

**Use cases:**
- Send notifications
- Read messages
- Manage channels
- Bot interactions

**Configuration:**
```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"
      }
    }
  }
}
```

**When to use:** Agents that need to communicate via Slack

---

### Google Drive MCP

**Purpose:** Google Drive file operations

**Use cases:**
- Upload/download files
- Share documents
- Search Drive
- Manage permissions

**Configuration:**
```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gdrive"],
      "env": {
        "GDRIVE_CREDENTIALS": "${GDRIVE_CREDENTIALS}"
      }
    }
  }
}
```

**When to use:** Agents that integrate with Google Workspace

---

## Configuration Patterns

### Environment Variable Injection

**Never hardcode credentials:**
```json
// ❌ BAD
{
  "mcpServers": {
    "postgres": {
      "args": ["postgresql://user:password123@localhost/db"]
    }
  }
}

// ✅ GOOD
{
  "mcpServers": {
    "postgres": {
      "args": ["postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}"],
      "env": {
        "DB_USER": "${POSTGRES_USER}",
        "DB_PASSWORD": "${POSTGRES_PASSWORD}",
        "DB_HOST": "${POSTGRES_HOST}",
        "DB_NAME": "${POSTGRES_DB}"
      }
    }
  }
}
```

### Multiple MCP Servers

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${POSTGRES_URL}"],
      "env": {
        "POSTGRES_URL": "${POSTGRES_CONNECTION_STRING}"
      }
    }
  }
}
```

## Selection Guide

### By Use Case

| Use Case | Recommended MCP Servers |
|----------|------------------------|
| Data analysis | None (use built-in tools) |
| Web research | Memory (for caching results) |
| Code review | GitHub |
| Deployment | None (use external CLIs) |
| Web scraping | Browser |
| Report generation | SQLite or PostgreSQL |
| Chatbot | Slack + Memory |
| File organization | Filesystem (optional) |
| Persistent state | Memory |

### Decision Tree

```
Does the agent need to remember things between sessions?
├─ Yes → Add Memory MCP
└─ No → Continue

Does it need to interact with web pages (not just fetch)?
├─ Yes → Add Browser MCP (requires desktop base image)
└─ No → Continue

Does it need to store structured data?
├─ Yes → Add Database MCP (SQLite for local, PostgreSQL for production)
└─ No → Continue

Does it need to integrate with external services?
├─ Yes → Add relevant MCP (GitHub, Slack, Google Drive, etc.)
└─ No → Continue

Does it need advanced file operations?
├─ Yes → Consider Filesystem MCP (usually not needed)
└─ No → Done
```

## Performance Considerations

**MCP servers add overhead:**
- Each server is a separate process
- Network latency for remote servers (databases, APIs)
- Authentication handshake on startup

**Best practices:**
- Only include MCP servers you actually use
- Prefer built-in tools when possible
- Use Memory MCP for caching to reduce external calls
- Configure connection pooling for database MCPs

## Security Considerations

**Credential management:**
- Always use environment variables
- Never commit credentials to templates
- Use secrets management in production
- Rotate credentials regularly

**Access control:**
- Limit MCP permissions to minimum required
- Use read-only database users when possible
- Restrict filesystem MCP to specific directories
- Use scoped API tokens (GitHub, Slack, etc.)

**Network isolation:**
- MCP servers can access external networks
- Be cautious with untrusted input
- Validate all data before database operations
- Sanitize inputs to prevent injection attacks
