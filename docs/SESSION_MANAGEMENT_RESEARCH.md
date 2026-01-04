# Session Management Research for Claude Agent SDK

**Research Date:** 2026-01-04
**Focus:** Session management patterns, storage backends, and production-ready architectures for stateful agent systems

---

## Executive Summary

This research identifies session management as **the most critical missing feature** in the Claude Agent SDK ecosystem. While the SDK provides basic session resumption capabilities, there is no standardized approach for:

1. **Persistent session storage** across application restarts
2. **Multi-tenant session isolation** for SaaS applications
3. **Pluggable storage backends** (Redis, SQLite, S3, database)
4. **Session lifecycle management** (creation, resumption, forking, cleanup)
5. **Cross-request continuity** for web applications

This research analyzes official documentation, real-world implementations (OpenAI Agents SDK, LangGraph, Google ADK), and production patterns to provide actionable recommendations for building a robust session management system.

**Key Finding:** Session management is the single highest-impact feature that enables stateful applications. Without it, developers cannot build:
- Multi-turn chatbots with conversation history
- Long-running workflows that span multiple API requests
- Multi-tenant SaaS applications with isolated user sessions
- Collaborative agent systems with shared context

---

## 1. How Session Management Works in Claude Agent SDK

### Current Official Capabilities

The Claude Agent SDK provides native session management through the following mechanisms:

#### **Session Creation**
When you start a new query, the SDK automatically creates a session and returns a session ID in the initial system message.

```typescript
// Hypothetical based on documentation
async function startNewSession(prompt: string) {
  const response = await query({ prompt })
  // Session ID is returned in the initial system message
  const sessionId = extractSessionId(response)
  return sessionId
}
```

#### **Session Resumption**
Use the `resume` option with a session ID to continue a previous conversation:

```typescript
// Resume existing session
const response = await query({
  prompt: "Continue our discussion",
  sessionId: "session_abc123"
})
```

The SDK automatically:
- Loads conversation history
- Restores file system context
- Maintains working directory and permissions
- Preserves background processes and environment variables

#### **Session Forking**
When resuming a session, you can choose to either continue the original session or fork it into a new branch:

```typescript
// Fork creates a new session branch
const forkedResponse = await query({
  prompt: "Try an alternative approach",
  sessionId: "session_abc123",
  fork: true  // Creates new branch
})
```

### What Data Needs to Be Persisted Between Turns

Based on official documentation and SDK behavior:

1. **Conversation History**
   - All previous messages (user prompts + assistant responses)
   - Tool use blocks and their results
   - Thinking blocks (extended reasoning)

2. **Complete Development Environment State**
   - File system contents and modifications
   - File contexts and permissions
   - Current working directory
   - Background processes
   - Loaded variables and data in memory
   - Installed packages and dependencies

3. **Session Metadata**
   - Session ID (unique identifier)
   - Creation timestamp
   - Last activity timestamp
   - User/tenant ID (for multi-tenant apps)
   - Fork relationships (parent/child sessions)

4. **Cost Tracking Data**
   - Cumulative token usage (input, output, cache)
   - Total cost in USD
   - Number of turns
   - Duration metrics

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                      Session Lifecycle                       │
└─────────────────────────────────────────────────────────────┘

CREATE
  ↓
  • Generate unique session ID
  • Initialize empty conversation history
  • Set up development environment
  • Store metadata (user, timestamp)
  ↓
ACTIVE
  ↓
  • Accept user prompts
  • Execute agent turns
  • Accumulate conversation history
  • Track costs and metrics
  ↓
PAUSE (optional)
  ↓
  • Preserve full state in storage
  • Release compute resources
  • Maintain session ID for resumption
  ↓
RESUME
  ↓
  • Load conversation history
  • Restore file system state
  • Reconstruct environment
  • Continue from last checkpoint
  ↓
FORK (optional)
  ↓
  • Create new session ID
  • Copy state up to fork point
  • Diverge from original session
  ↓
END
  ↓
  • Archive conversation history
  • Clean up temporary resources
  • Mark session as completed
  • Optional: Delete or retain for analytics
```

### Known Gaps and Limitations

From official GitHub issues and community feedback:

**Issue #3 on claude-agent-sdk-typescript:**
> "Session management is not clearly documented and exposed"

**Community Pain Points:**
1. **Storage location unclear** - Documentation doesn't indicate where sessions are stored (local vs remote)
2. **No storage backend customization** - Cannot change storage backend or bring your own persistence layer
3. **No programmatic state replay** - Difficult to replay agents to specific states
4. **Multi-tenant challenges** - No built-in isolation for SaaS applications
5. **Session cleanup undefined** - No clear guidance on when/how sessions expire

**Critical Gap:** The SDK handles session state internally, but provides no mechanism for applications to:
- Persist sessions across application restarts
- Store sessions in external databases (Redis, PostgreSQL, etc.)
- Implement custom expiration policies
- Isolate sessions by user/tenant in multi-tenant systems

---

## 2. Storage Backend Options

### Evaluation Criteria

For production agent systems, storage backends should be evaluated on:

1. **Zero External Dependencies** - Can it run without SaaS/freemium services?
2. **Multi-Tenant Support** - Can it isolate sessions by user/organization?
3. **Performance** - Read/write latency for session retrieval
4. **Durability** - Resistance to data loss
5. **Scalability** - Horizontal scaling capabilities
6. **Development Experience** - Setup complexity and debugging

### Option 1: File-Based (JSON/SQLite)

#### JSON Files

**Implementation Pattern:**
```typescript
// examples/lib/storage/file-storage.ts
import { promises as fs } from 'fs'
import path from 'path'

export interface Session {
  id: string
  userId: string
  conversationHistory: any[]
  metadata: Record<string, any>
  createdAt: Date
  lastActivityAt: Date
}

export class FileSessionStorage {
  constructor(private baseDir: string = './sessions') {}

  async save(session: Session): Promise<void> {
    const dir = path.join(this.baseDir, session.userId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, `${session.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(session, null, 2))
  }

  async load(sessionId: string, userId: string): Promise<Session | null> {
    const filePath = path.join(this.baseDir, userId, `${sessionId}.json`)

    try {
      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    const filePath = path.join(this.baseDir, userId, `${sessionId}.json`)
    await fs.unlink(filePath)
  }

  async list(userId: string): Promise<Session[]> {
    const dir = path.join(this.baseDir, userId)

    try {
      const files = await fs.readdir(dir)
      const sessions = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(f => this.load(f.replace('.json', ''), userId))
      )
      return sessions.filter(s => s !== null) as Session[]
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  async cleanup(olderThan: Date): Promise<number> {
    let cleaned = 0
    const userDirs = await fs.readdir(this.baseDir)

    for (const userId of userDirs) {
      const sessions = await this.list(userId)
      for (const session of sessions) {
        if (new Date(session.lastActivityAt) < olderThan) {
          await this.delete(session.id, userId)
          cleaned++
        }
      }
    }

    return cleaned
  }
}
```

**Pros:**
- ✅ Zero external dependencies
- ✅ Simple to understand and debug
- ✅ Version control friendly (can commit session files)
- ✅ Works offline
- ✅ Easy backup/restore

**Cons:**
- ❌ Not suitable for high concurrency
- ❌ No built-in locking mechanism
- ❌ Poor performance with large numbers of sessions
- ❌ Limited query capabilities

**Best For:**
- Development and testing
- Single-user applications
- Simple chatbots with low traffic

---

#### SQLite

**Implementation Pattern:**
```typescript
// examples/lib/storage/sqlite-storage.ts
import Database from 'better-sqlite3'

export class SQLiteSessionStorage {
  private db: Database.Database

  constructor(dbPath: string = './sessions.db') {
    this.db = new Database(dbPath)
    this.initializeSchema()
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_history TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_last_activity ON sessions(last_activity_at);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON sessions(expires_at);
    `)
  }

  async save(session: Session): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions
      (id, user_id, conversation_history, metadata, created_at, last_activity_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      session.id,
      session.userId,
      JSON.stringify(session.conversationHistory),
      JSON.stringify(session.metadata),
      session.createdAt.getTime(),
      session.lastActivityAt.getTime(),
      session.expiresAt?.getTime() || null
    )
  }

  async load(sessionId: string, userId: string): Promise<Session | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND user_id = ?
    `)

    const row = stmt.get(sessionId, userId)
    if (!row) return null

    return {
      id: row.id,
      userId: row.user_id,
      conversationHistory: JSON.parse(row.conversation_history),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      lastActivityAt: new Date(row.last_activity_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
    }
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE id = ? AND user_id = ?
    `)
    stmt.run(sessionId, userId)
  }

  async list(userId: string, limit: number = 100): Promise<Session[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ?
      ORDER BY last_activity_at DESC
      LIMIT ?
    `)

    const rows = stmt.all(userId, limit)
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      conversationHistory: JSON.parse(row.conversation_history),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      lastActivityAt: new Date(row.last_activity_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
    }))
  }

  async cleanup(olderThan: Date): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM sessions
      WHERE last_activity_at < ? OR expires_at < ?
    `)
    const result = stmt.run(olderThan.getTime(), Date.now())
    return result.changes
  }

  close() {
    this.db.close()
  }
}
```

**Pros:**
- ✅ Zero external dependencies (single file database)
- ✅ ACID transactions
- ✅ Fast reads and writes
- ✅ Built-in indexing and querying
- ✅ Concurrent read support
- ✅ Easy backup (copy single file)

**Cons:**
- ❌ Single writer limitation (can be bottleneck)
- ❌ Not suitable for distributed systems
- ❌ File size can grow large
- ❌ No built-in replication

**Best For:**
- Small to medium production applications
- Single-server deployments
- Applications requiring SQL queries
- Cost-conscious projects (no hosting fees)

---

### Option 2: In-Memory with Persistence (Redis-Compatible)

#### Redis

**Implementation Pattern:**
```typescript
// examples/lib/storage/redis-storage.ts
import { createClient, RedisClientType } from 'redis'

export class RedisSessionStorage {
  private client: RedisClientType

  constructor(private config: { url?: string; ttl?: number } = {}) {}

  async connect(): Promise<void> {
    this.client = createClient({
      url: this.config.url || 'redis://localhost:6379'
    })
    await this.client.connect()
  }

  async save(session: Session): Promise<void> {
    const key = `session:${session.userId}:${session.id}`
    const data = JSON.stringify(session)

    const ttl = this.config.ttl || 86400 // 24 hours default
    await this.client.setEx(key, ttl, data)

    // Add to user's session set
    await this.client.sAdd(`user:${session.userId}:sessions`, session.id)
  }

  async load(sessionId: string, userId: string): Promise<Session | null> {
    const key = `session:${userId}:${sessionId}`
    const data = await this.client.get(key)

    if (!data) return null

    const session = JSON.parse(data)

    // Refresh TTL on access
    const ttl = this.config.ttl || 86400
    await this.client.expire(key, ttl)

    return session
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    const key = `session:${userId}:${sessionId}`
    await this.client.del(key)
    await this.client.sRem(`user:${userId}:sessions`, sessionId)
  }

  async list(userId: string): Promise<Session[]> {
    const sessionIds = await this.client.sMembers(`user:${userId}:sessions`)

    const sessions = await Promise.all(
      sessionIds.map(id => this.load(id, userId))
    )

    return sessions.filter(s => s !== null) as Session[]
  }

  async cleanup(): Promise<number> {
    // Redis TTL handles automatic cleanup
    // This method could scan for orphaned entries
    return 0
  }

  async disconnect(): Promise<void> {
    await this.client.quit()
  }
}
```

**Pros:**
- ✅ Extremely fast (in-memory)
- ✅ Built-in TTL/expiration
- ✅ Atomic operations
- ✅ Pub/Sub for real-time updates
- ✅ Horizontal scaling support
- ✅ Industry-standard for sessions
- ✅ Rich data structures (sets, hashes, sorted sets)

**Cons:**
- ❌ Requires Redis server
- ❌ Data can be lost if Redis crashes (without persistence)
- ❌ Memory constraints (more expensive than disk)
- ❌ Additional infrastructure complexity

**Best For:**
- High-traffic production applications
- Multi-server deployments
- Applications requiring real-time features
- Systems needing horizontal scaling

**Redis Alternatives (Self-Hosted):**
- **Valkey** - Redis fork by AWS (100% compatible)
- **KeyDB** - Multi-threaded Redis alternative
- **DragonflyDB** - Modern Redis replacement (faster, less memory)

---

### Option 3: Database Storage (PostgreSQL/MySQL)

#### PostgreSQL

**Implementation Pattern:**
```typescript
// examples/lib/storage/postgres-storage.ts
import { Pool } from 'pg'

export class PostgresSessionStorage {
  private pool: Pool

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString })
    this.initializeSchema()
  }

  private async initializeSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_history JSONB NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        last_activity_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_last_activity ON sessions(last_activity_at);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON sessions(expires_at);

      -- JSONB index for querying conversation history
      CREATE INDEX IF NOT EXISTS idx_conversation_gin ON sessions
      USING GIN (conversation_history);
    `)
  }

  async save(session: Session): Promise<void> {
    await this.pool.query(`
      INSERT INTO sessions (id, user_id, conversation_history, metadata, created_at, last_activity_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id)
      DO UPDATE SET
        conversation_history = EXCLUDED.conversation_history,
        metadata = EXCLUDED.metadata,
        last_activity_at = EXCLUDED.last_activity_at,
        expires_at = EXCLUDED.expires_at
    `, [
      session.id,
      session.userId,
      JSON.stringify(session.conversationHistory),
      JSON.stringify(session.metadata),
      session.createdAt,
      session.lastActivityAt,
      session.expiresAt || null
    ])
  }

  async load(sessionId: string, userId: string): Promise<Session | null> {
    const result = await this.pool.query(`
      SELECT * FROM sessions WHERE id = $1 AND user_id = $2
    `, [sessionId, userId])

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      conversationHistory: row.conversation_history,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at
    }
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    await this.pool.query(`
      DELETE FROM sessions WHERE id = $1 AND user_id = $2
    `, [sessionId, userId])
  }

  async list(userId: string, limit: number = 100): Promise<Session[]> {
    const result = await this.pool.query(`
      SELECT * FROM sessions
      WHERE user_id = $1
      ORDER BY last_activity_at DESC
      LIMIT $2
    `, [userId, limit])

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      conversationHistory: row.conversation_history,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at
    }))
  }

  async cleanup(olderThan: Date): Promise<number> {
    const result = await this.pool.query(`
      DELETE FROM sessions
      WHERE last_activity_at < $1 OR expires_at < NOW()
    `, [olderThan])

    return result.rowCount
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
```

**Pros:**
- ✅ ACID transactions
- ✅ Complex queries with JSONB
- ✅ Mature ecosystem
- ✅ Strong consistency guarantees
- ✅ Excellent for analytics
- ✅ Built-in replication
- ✅ Can share database with main app

**Cons:**
- ❌ Requires database server
- ❌ Slower than Redis for simple reads
- ❌ More complex setup
- ❌ Connection pooling required

**Best For:**
- Applications already using PostgreSQL
- Need for complex session queries
- Strict consistency requirements
- Analytics on conversation history

---

### Comparison Matrix

| Feature | JSON Files | SQLite | Redis | PostgreSQL |
|---------|-----------|--------|-------|------------|
| **Setup Complexity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Performance (Read)** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Performance (Write)** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Scalability** | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Durability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Query Capabilities** | ⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cost** | Free | Free | $ (self-hosted) | $ (self-hosted) |
| **Multi-Tenant** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **External Deps** | None | None | Redis server | PostgreSQL |

### Recommendation

**Tiered Approach:**

1. **Development:** SQLite (fast, zero config, easy debugging)
2. **Small Production:** SQLite or self-hosted Redis
3. **Large Production:** Redis + PostgreSQL hybrid
   - Redis for active sessions (fast access)
   - PostgreSQL for long-term storage and analytics

---

## 3. Architecture Patterns

### Pattern 1: Interface-Based Pluggable Storage

**Core Abstraction:**
```typescript
// examples/lib/storage/interface.ts

export interface SessionStorage {
  save(session: Session): Promise<void>
  load(sessionId: string, userId: string): Promise<Session | null>
  delete(sessionId: string, userId: string): Promise<void>
  list(userId: string): Promise<Session[]>
  cleanup(olderThan: Date): Promise<number>
}

export interface Session {
  id: string
  userId: string
  conversationHistory: Message[]
  metadata: {
    costUSD?: number
    tokenUsage?: TokenUsage
    createdBy?: string
    tags?: string[]
  }
  createdAt: Date
  lastActivityAt: Date
  expiresAt?: Date
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  timestamp: Date
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  [key: string]: any
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}
```

**Session Manager:**
```typescript
// examples/lib/session-manager.ts

export class SessionManager {
  constructor(private storage: SessionStorage) {}

  async create(userId: string, metadata: Record<string, any> = {}): Promise<Session> {
    const session: Session = {
      id: this.generateSessionId(),
      userId,
      conversationHistory: [],
      metadata,
      createdAt: new Date(),
      lastActivityAt: new Date()
    }

    await this.storage.save(session)
    return session
  }

  async resume(sessionId: string, userId: string): Promise<Session | null> {
    const session = await this.storage.load(sessionId, userId)

    if (!session) return null

    // Update last activity
    session.lastActivityAt = new Date()
    await this.storage.save(session)

    return session
  }

  async fork(sessionId: string, userId: string): Promise<Session> {
    const original = await this.storage.load(sessionId, userId)
    if (!original) throw new Error('Session not found')

    const forked: Session = {
      ...original,
      id: this.generateSessionId(),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        ...original.metadata,
        parentSessionId: sessionId
      }
    }

    await this.storage.save(forked)
    return forked
  }

  async addMessage(sessionId: string, userId: string, message: Message): Promise<void> {
    const session = await this.storage.load(sessionId, userId)
    if (!session) throw new Error('Session not found')

    session.conversationHistory.push(message)
    session.lastActivityAt = new Date()

    await this.storage.save(session)
  }

  async updateMetadata(
    sessionId: string,
    userId: string,
    updates: Partial<Session['metadata']>
  ): Promise<void> {
    const session = await this.storage.load(sessionId, userId)
    if (!session) throw new Error('Session not found')

    session.metadata = { ...session.metadata, ...updates }
    session.lastActivityAt = new Date()

    await this.storage.save(session)
  }

  async end(sessionId: string, userId: string): Promise<void> {
    await this.storage.delete(sessionId, userId)
  }

  async listUserSessions(userId: string): Promise<Session[]> {
    return await this.storage.list(userId)
  }

  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days
    return await this.storage.cleanup(cutoff)
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}
```

**Usage:**
```typescript
// Choose storage backend at runtime
import { SessionManager } from './lib/session-manager'
import { SQLiteSessionStorage } from './lib/storage/sqlite-storage'
import { RedisSessionStorage } from './lib/storage/redis-storage'

// Development
const storage = new SQLiteSessionStorage('./dev-sessions.db')

// Production
// const storage = new RedisSessionStorage({
//   url: process.env.REDIS_URL,
//   ttl: 86400
// })

const sessionManager = new SessionManager(storage)

// Create session
const session = await sessionManager.create('user_123', {
  userAgent: 'Mozilla/5.0...',
  ipAddress: '192.168.1.1'
})

// Add messages
await sessionManager.addMessage(session.id, 'user_123', {
  role: 'user',
  content: 'Hello, Claude!',
  timestamp: new Date()
})

// Resume later
const resumed = await sessionManager.resume(session.id, 'user_123')
```

---

### Pattern 2: Session Isolation (Multi-Tenant)

**Namespace-Based Isolation:**
```typescript
// examples/lib/storage/multi-tenant-storage.ts

export class MultiTenantSessionStorage implements SessionStorage {
  constructor(
    private baseStorage: SessionStorage,
    private tenantIdProvider: () => string
  ) {}

  async save(session: Session): Promise<void> {
    const tenantId = this.tenantIdProvider()
    const namespacedSession = {
      ...session,
      id: `${tenantId}:${session.id}`
    }
    return this.baseStorage.save(namespacedSession)
  }

  async load(sessionId: string, userId: string): Promise<Session | null> {
    const tenantId = this.tenantIdProvider()
    const namespacedId = `${tenantId}:${sessionId}`
    const session = await this.baseStorage.load(namespacedId, userId)

    if (session) {
      // Remove tenant prefix from returned session
      session.id = session.id.replace(`${tenantId}:`, '')
    }

    return session
  }

  // ... similar for delete, list, cleanup
}
```

**Row-Level Security (PostgreSQL):**
```sql
-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own sessions
CREATE POLICY user_isolation ON sessions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id'));

-- Set current user in connection
SET app.current_user_id = 'user_123';
```

---

### Pattern 3: Session Expiration and Cleanup

**Time-Based Expiration:**
```typescript
export class ExpiringSessionStorage implements SessionStorage {
  constructor(
    private baseStorage: SessionStorage,
    private ttlSeconds: number = 86400 // 24 hours
  ) {}

  async save(session: Session): Promise<void> {
    const expiringSession = {
      ...session,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000)
    }
    return this.baseStorage.save(expiringSession)
  }

  async load(sessionId: string, userId: string): Promise<Session | null> {
    const session = await this.baseStorage.load(sessionId, userId)

    if (!session) return null

    // Check expiration
    if (session.expiresAt && session.expiresAt < new Date()) {
      await this.baseStorage.delete(sessionId, userId)
      return null
    }

    // Refresh expiration on access
    session.expiresAt = new Date(Date.now() + this.ttlSeconds * 1000)
    await this.baseStorage.save(session)

    return session
  }
}
```

**Background Cleanup Job:**
```typescript
// examples/lib/session-cleanup.ts

export class SessionCleanupScheduler {
  private intervalId?: NodeJS.Timeout

  constructor(
    private sessionManager: SessionManager,
    private intervalMs: number = 60 * 60 * 1000 // 1 hour
  ) {}

  start() {
    this.intervalId = setInterval(async () => {
      const cleaned = await this.sessionManager.cleanupExpired()
      console.log(`Cleaned up ${cleaned} expired sessions`)
    }, this.intervalMs)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }
}

// Usage in server startup
const cleanup = new SessionCleanupScheduler(sessionManager)
cleanup.start()

process.on('SIGTERM', () => cleanup.stop())
```

---

## 4. Real-World Implementations

### OpenAI Agents SDK (TypeScript)

**Key Features:**
- Interface-based storage abstraction
- Ships with two implementations:
  - `OpenAIConversationsSession` for Conversations API
  - `MemorySession` for local development
- Pluggable: "Provide any object that implements the Session interface"
- Only **5 async methods required** to implement custom storage

**Sample Backends:**
From `examples/memory/`:
- Prisma (database ORM)
- File-backed storage
- Custom implementations

**Source:** [OpenAI Agents SDK Sessions](https://openai.github.io/openai-agents-js/guides/sessions/)

---

### LangGraph (LangChain)

**Memory Architecture:**
- **Short-term memory** - Thread-scoped checkpoints (per conversation)
- **Long-term memory** - Cross-thread persistent storage (namespaced)

**Storage Mechanisms:**
```python
# Short-term: Thread-scoped checkpointing
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver

# In-memory checkpointer
checkpointer = MemorySaver()

# Persistent SQLite checkpointer
checkpointer = SqliteSaver.from_conn_string("./checkpoints.db")

# MongoDB for long-term memory
from langgraph_checkpoint_mongodb import MongoDBSaver
checkpointer = MongoDBSaver(connection_string)
```

**Key Patterns:**
- **Threads** represent individual conversations/sessions
- **Checkpoints** save state at each graph step
- **Namespaces** isolate memories per agent/user
- **Store** API for long-term memory (JSON documents)

**Supported Backends:**
- InMemorySaver (development)
- SqliteSaver (file-based persistence)
- MongoDB Store (scalable long-term memory)
- Redis (via community packages)
- AWS AgentCore Memory

**Source:** [LangGraph Memory Overview](https://docs.langchain.com/oss/python/langgraph/memory)

---

### Google ADK (Agent Development Kit)

**SessionService Architecture:**
```typescript
import { VertexAiSessionService, InMemorySessionService } from '@iqai/adk'

// Vertex AI (cloud-hosted)
const sessionService = new VertexAiSessionService({
  project: 'your-gcp-project',
  location: 'us-central1',
  agentEngineId: 'your-agent-engine-id'
})

// In-memory (no persistence)
const sessionService = new InMemorySessionService()
```

**Features:**
- Unified interface across storage backends
- Automatic state scoping
- Event-driven state updates via `stateDelta`

**Source:** [ADK Session Management](https://adk.iqai.com/docs/framework/sessions/session)

---

### Community Patterns

#### Redis Agent Memory Server
[GitHub: redis/agent-memory-server](https://github.com/redis/agent-memory-server)

**Architecture:**
- **Working memory** - Session-scoped (short-term)
- **Long-term memory** - Persistent across sessions
- **Pluggable vector store factory** - Flexible backends

#### Mem0 + AWS
[AWS Blog: Mem0 with ElastiCache](https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/)

**Stack:**
- Mem0 (memory framework)
- Amazon ElastiCache for Valkey (Redis-compatible)
- Amazon Neptune Analytics (graph database)

---

## 5. E2B-Specific Considerations

### How E2B Pause/Resume Works with Sessions

E2B sandboxes provide **pause/resume functionality** that preserves:
- File system state
- Running processes
- Memory contents (loaded variables)
- Environment variables
- Network connections

**Pause Duration:**
- **Pro tier:** 24 hours
- **Hobby tier:** 1 hour
- **Data retention:** Up to 30 days (may be deleted after)

**Performance:**
- Pause time: ~4 seconds per 1 GiB RAM
- Resume time: ~150ms (sub-200ms startup)

**Source:** [E2B Sandbox Persistence](https://e2b.dev/docs/sandbox/persistence)

---

### Relationship: E2B Sandboxes vs Sessions

**Key Distinction:**
- **E2B Sandbox** = Execution environment (VM, filesystem, processes)
- **Agent Session** = Conversation state (messages, metadata, history)

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Session Management (Your Code)                 │ │
│  │                                                         │ │
│  │  - Session ID: "session_abc123"                        │ │
│  │  - User ID: "user_456"                                 │ │
│  │  - Conversation History (messages, context)            │ │
│  │  - Metadata (cost, tokens, tags)                       │ │
│  │                                                         │ │
│  │  Storage Backend: Redis / SQLite / PostgreSQL          │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↕                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          E2B Sandbox Management (E2B SDK)              │ │
│  │                                                         │ │
│  │  - Sandbox ID: "sandbox_xyz789"                        │ │
│  │  - Execution environment (Python runtime, filesystem)  │ │
│  │  - Running processes                                   │ │
│  │  - Memory state                                        │ │
│  │                                                         │ │
│  │  Persistence: E2B Pause/Resume (24 hours max)          │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Mapping Strategies:**

**1:1 Mapping (Simple)**
```typescript
// One sandbox per session
interface SessionSandboxMapping {
  sessionId: string
  sandboxId: string
  userId: string
}

// Create sandbox when session starts
const session = await sessionManager.create(userId)
const sandbox = await Sandbox.create(templateId)

await saveSandboxMapping({
  sessionId: session.id,
  sandboxId: sandbox.id,
  userId
})

// Resume both when continuing
const session = await sessionManager.resume(sessionId, userId)
const mapping = await getSandboxMapping(sessionId)
const sandbox = await Sandbox.reconnect(mapping.sandboxId)
```

**Pool-Based (Efficient)**
```typescript
// Reuse sandboxes across sessions
class SandboxPool {
  async acquire(sessionId: string): Promise<Sandbox> {
    // Get or create sandbox
    const sandbox = await this.getOrCreate()

    // Load session context into sandbox
    const session = await sessionManager.resume(sessionId, userId)
    await this.loadSessionContext(sandbox, session)

    return sandbox
  }

  async release(sandbox: Sandbox, sessionId: string): Promise<void> {
    // Save session state
    await sessionManager.save(/* ... */)

    // Return sandbox to pool
    await this.pool.push(sandbox)
  }
}
```

**Ephemeral Sandboxes + Persistent Sessions (Recommended)**
```typescript
// Sessions persist in database
// Sandboxes created on-demand and destroyed after use

async function runAgentWithSession(sessionId: string, prompt: string) {
  // 1. Load session from storage
  const session = await sessionManager.resume(sessionId, userId)

  // 2. Create fresh sandbox
  const sandbox = await Sandbox.create(templateId)

  try {
    // 3. Pass conversation history to agent
    const result = await runPythonAgent({
      sandbox,
      prompt,
      conversationHistory: session.conversationHistory
    })

    // 4. Update session with new messages
    await sessionManager.addMessage(sessionId, userId, {
      role: 'user',
      content: prompt,
      timestamp: new Date()
    })

    await sessionManager.addMessage(sessionId, userId, {
      role: 'assistant',
      content: result,
      timestamp: new Date()
    })

    return result
  } finally {
    // 5. Always destroy sandbox
    await sandbox.kill()
  }
}
```

**Pros of Ephemeral Approach:**
- ✅ No sandbox state management complexity
- ✅ Lower E2B costs (no paused sandboxes)
- ✅ Fresh environment for each request
- ✅ Session history stored in your database

**Cons:**
- ❌ 150ms sandbox startup latency per request
- ❌ No file system persistence (must re-upload files)

---

### Using E2B Built-in Persistence for Sessions

**Can E2B sandboxes be used as the session storage layer?**

**Short Answer:** No, not recommended.

**Reasoning:**
1. **Limited Duration** - Paused sandboxes only persist for 24 hours (Pro tier)
2. **No Query Capabilities** - Cannot list all sessions for a user
3. **No Multi-Tenant Isolation** - Sandboxes don't have user/tenant scoping
4. **Cost** - Paused sandboxes cost money; database storage is cheaper
5. **Data Loss Risk** - Paused data may be deleted after 30 days

**Recommended Hybrid Approach:**
- **Session metadata & history** → Your database (Redis/SQLite/PostgreSQL)
- **Sandbox execution environment** → E2B (create on-demand, destroy after use)
- **Generated files/artifacts** → Download and store in S3/filesystem before destroying sandbox

---

## 6. Architecture Recommendations

### Recommended Architecture

**Layered Approach:**
```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  - Next.js API routes, Express endpoints, CLI commands       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────────┐
│                    Session Manager                           │
│  - create(), resume(), fork(), addMessage()                  │
│  - Handles session lifecycle                                 │
│  - Delegates to storage backend                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────────┐
│                  Storage Interface                           │
│  - SessionStorage interface (5 methods)                      │
│  - Pluggable implementations                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┐
      │            │            │
      ↓            ↓            ↓
┌──────────┐  ┌──────────┐  ┌──────────┐
│  SQLite  │  │  Redis   │  │ Postgres │
│  (Dev)   │  │  (Prod)  │  │ (Scale)  │
└──────────┘  └──────────┘  └──────────┘
```

**Code Structure:**
```
examples/lib/
├── session-manager.ts         # Core session management
├── storage/
│   ├── interface.ts            # SessionStorage interface
│   ├── file-storage.ts         # JSON file backend
│   ├── sqlite-storage.ts       # SQLite backend
│   ├── redis-storage.ts        # Redis backend
│   └── postgres-storage.ts     # PostgreSQL backend
├── sandbox-session.ts          # Integration with E2B sandboxes
└── cleanup.ts                  # Background cleanup scheduler
```

**Environment-Based Configuration:**
```typescript
// examples/lib/create-session-manager.ts

import { SessionManager } from './session-manager'
import { SQLiteSessionStorage } from './storage/sqlite-storage'
import { RedisSessionStorage } from './storage/redis-storage'
import { PostgresSessionStorage } from './storage/postgres-storage'

export function createSessionManager(): SessionManager {
  const env = process.env.NODE_ENV || 'development'

  switch (env) {
    case 'production':
      // Use Redis for fast access
      const redisStorage = new RedisSessionStorage({
        url: process.env.REDIS_URL,
        ttl: 86400 // 24 hours
      })
      return new SessionManager(redisStorage)

    case 'test':
      // Use in-memory for fast tests
      const memoryStorage = new InMemorySessionStorage()
      return new SessionManager(memoryStorage)

    default:
      // Use SQLite for development
      const sqliteStorage = new SQLiteSessionStorage('./dev-sessions.db')
      return new SessionManager(sqliteStorage)
  }
}
```

---

## 7. Production-Ready Implementation Checklist

### Core Features
- [ ] Interface-based storage abstraction (`SessionStorage`)
- [ ] At least 3 storage backends (SQLite, Redis, PostgreSQL)
- [ ] Session CRUD operations (create, read, update, delete)
- [ ] Session lifecycle management (create, resume, fork, end)
- [ ] Conversation history persistence
- [ ] Metadata tracking (cost, tokens, timestamps)

### Multi-Tenant Support
- [ ] User/tenant ID scoping
- [ ] Namespace-based isolation
- [ ] Row-level security (for database backends)
- [ ] Per-tenant session quotas

### Performance & Scalability
- [ ] Connection pooling (for Redis/PostgreSQL)
- [ ] Caching layer for frequently accessed sessions
- [ ] Batch operations for cleanup
- [ ] Index optimization

### Reliability
- [ ] Automatic expiration/TTL
- [ ] Background cleanup scheduler
- [ ] Error handling and retry logic
- [ ] Data validation and sanitization

### Security
- [ ] Session ID randomness (cryptographically secure)
- [ ] Input validation (prevent injection attacks)
- [ ] Access control (user can only access own sessions)
- [ ] Sensitive data encryption (optional)

### Observability
- [ ] Logging (session creation, resumption, deletion)
- [ ] Metrics (active sessions, cleanup count, latency)
- [ ] Alerts (high session count, cleanup failures)

### Developer Experience
- [ ] TypeScript type definitions
- [ ] Comprehensive documentation
- [ ] Usage examples for each backend
- [ ] Migration scripts (for database schema changes)
- [ ] Testing utilities

---

## 8. Example Implementation

### Complete Session-Enabled Agent

```typescript
// examples/session-agent.ts

import { Sandbox } from '@e2b/code-interpreter'
import { runPythonAgent } from './lib/agent'
import { createSessionManager } from './lib/create-session-manager'

const sessionManager = createSessionManager()

export interface SessionAgentConfig {
  userId: string
  sessionId?: string  // Omit to create new session
  prompt: string
  timeout?: number
}

export async function runSessionAgent(config: SessionAgentConfig) {
  const { userId, sessionId, prompt, timeout } = config

  // Resume or create session
  let session
  if (sessionId) {
    session = await sessionManager.resume(sessionId, userId)
    if (!session) throw new Error('Session not found')
  } else {
    session = await sessionManager.create(userId)
  }

  try {
    // Add user message to history
    await sessionManager.addMessage(session.id, userId, {
      role: 'user',
      content: prompt,
      timestamp: new Date()
    })

    // Run agent (creates fresh sandbox)
    const result = await runPythonAgent({
      prompt,
      timeout,
      // Pass conversation history as context
      context: {
        conversationHistory: session.conversationHistory
      }
    })

    // Add assistant response to history
    await sessionManager.addMessage(session.id, userId, {
      role: 'assistant',
      content: result,
      timestamp: new Date()
    })

    return {
      sessionId: session.id,
      result,
      conversationHistory: session.conversationHistory
    }
  } catch (error) {
    // Update session metadata with error
    await sessionManager.updateMetadata(session.id, userId, {
      lastError: error.message,
      errorCount: (session.metadata.errorCount || 0) + 1
    })
    throw error
  }
}

// Usage Example
async function main() {
  // Request 1: Create new session
  const response1 = await runSessionAgent({
    userId: 'user_123',
    prompt: 'Hello, Claude! Tell me about TypeScript.'
  })

  console.log('Session ID:', response1.sessionId)
  console.log('Response:', response1.result)

  // Request 2: Continue conversation
  const response2 = await runSessionAgent({
    userId: 'user_123',
    sessionId: response1.sessionId,
    prompt: 'Can you give me an example?'
  })

  console.log('Response:', response2.result)
  console.log('Full History:', response2.conversationHistory)
}
```

---

## 9. Migration Path

### Phase 1: Core Infrastructure (Week 1)
- [ ] Define `SessionStorage` interface
- [ ] Implement SQLite backend
- [ ] Build `SessionManager` class
- [ ] Write tests

### Phase 2: Additional Backends (Week 2)
- [ ] Implement Redis backend
- [ ] Implement PostgreSQL backend
- [ ] Add environment-based configuration
- [ ] Performance benchmarking

### Phase 3: Integration (Week 3)
- [ ] Integrate with existing `runPythonAgent()`
- [ ] Add session-aware API endpoints
- [ ] Implement cleanup scheduler
- [ ] Documentation and examples

### Phase 4: Advanced Features (Week 4)
- [ ] Session forking
- [ ] Multi-tenant isolation
- [ ] Caching layer
- [ ] Observability (metrics, logging)

---

## 10. Summary

**Session management is the most critical missing piece** for building production agent applications with the Claude Agent SDK.

**Key Takeaways:**

1. **Claude SDK provides session resumption**, but no persistence layer
2. **Pluggable storage is essential** - Start with SQLite, scale to Redis/PostgreSQL
3. **E2B sandboxes ≠ sessions** - Use sandboxes for execution, database for conversation history
4. **Interface-based design** enables swapping backends without code changes
5. **Multi-tenant isolation** is non-negotiable for SaaS applications
6. **Automatic cleanup** prevents unbounded storage growth

**Recommended Stack:**
- **Development:** SQLite (zero dependencies, fast)
- **Production:** Redis (active sessions) + PostgreSQL (long-term storage)
- **Multi-Tenant:** Namespace-based isolation + row-level security

By implementing session management with pluggable storage, this boilerplate will enable:
- ✅ Multi-turn conversations across requests
- ✅ User-specific chat history
- ✅ Cost and usage tracking per session
- ✅ Session analytics and debugging
- ✅ Production-ready stateful applications

---

## Sources

### Official Documentation
- [Session Management - Claude Docs](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [E2B Sandbox Persistence](https://e2b.dev/docs/sandbox/persistence)
- [LangGraph Memory Overview](https://docs.langchain.com/oss/python/langgraph/memory)
- [OpenAI Agents SDK Sessions](https://openai.github.io/openai-agents-js/guides/sessions/)
- [ADK Session Management](https://adk.iqai.com/docs/framework/sessions/session)

### GitHub Issues & Discussions
- [Session management not documented - claude-agent-sdk-typescript #3](https://github.com/anthropics/claude-agent-sdk-typescript/issues/3)
- [E2B paused sandbox persistence bug #884](https://github.com/e2b-dev/E2B/issues/884)
- [LangGraph multi-agent memory discussion #1821](https://github.com/langchain-ai/langgraph/discussions/1821)

### Storage Implementations
- [Express Session Middleware](https://github.com/expressjs/session)
- [Redis Session Storage](https://redis.io/learn/develop/node/nodecrashcourse/sessionstorage)
- [Next.js Redis Session Store](https://vercel.com/templates/next.js/next-js-redis-session-store-template)
- [Redis Agent Memory Server](https://github.com/redis/agent-memory-server)

### Best Practices & Guides
- [Session Management with Redis](https://medium.com/@20011002nimeth/session-management-with-redis-a21d43ac7d5a)
- [Redis as #1 AI Agent Data Storage](https://redis.io/blog/best-ai-agent-data-storage-2025/)
- [Building Session Management with Node.js](https://fenilsonani.com/articles/building-a-session-management-system-with-redis-and-node-js)
- [LangGraph Long-Term Memory Guide](https://medium.com/@anil.jain.baba/long-term-agentic-memory-with-langgraph-824050b09852)
- [MongoDB + LangGraph Memory](https://www.mongodb.com/company/blog/product-release-announcements/powering-long-term-memory-for-agents-langgraph)
- [AWS Mem0 Integration](https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/)

### Research Documents
- [E2B Breakdown - memo.d.foundation](https://memo.d.foundation/breakdown/e2b)
- [E2B Production Recommendations](./E2B_PRODUCTION_RECOMMENDATIONS.md) (local file)
- [Claude Agent SDK Research Findings](../RESEARCH_FINDINGS.md) (local file)
- [Feature Priorities](../FEATURE_PRIORITIES.md) (local file)
