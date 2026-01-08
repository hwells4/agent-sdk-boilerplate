# Convex Framework Documentation

> Comprehensive technical documentation for Convex integration, gathered January 2026

## Summary

Convex is a reactive backend-as-a-service platform that provides:
- **Real-time database** with automatic subscriptions
- **Serverless functions** (queries, mutations, actions)
- **HTTP endpoints** for webhooks and APIs
- **File storage** for blobs and artifacts
- **Built-in authentication** with Clerk integration
- **Scheduled functions** and cron jobs

This document covers the key patterns needed for integrating Convex into applications that orchestrate external services (like E2B sandboxes).

---

## 1. Schema Definition

### Basic Schema with `defineSchema` and `defineTable`

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Basic table with typed fields
  users: defineTable({
    name: v.string(),
    email: v.string(),
    createdAt: v.number(),
  }),

  // Table with foreign key reference
  sessions: defineTable({
    userId: v.id("users"),           // References users table
    status: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_userId", ["userId"])   // Index for efficient queries
    .index("by_status", ["status"]),

  // Table with multiple relationships
  messages: defineTable({
    sessionId: v.id("sessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    toolCalls: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      input: v.any(),
    }))),
  }).index("by_sessionId", ["sessionId"]),
});
```

### Index Patterns for Efficient Queries

```typescript
// Single-field index
.index("by_channel", ["channel"])

// Compound index (order matters for range queries)
.index("by_channel_user", ["channel", "user"])

// Index on foreign key for relationship lookups
.index("by_authorId", ["authorId"])

// Staged index for large tables (non-blocking deployment)
.index("by_created_staged", {
  fields: ["createdAt"],
  staged: true  // Won't block push; enable later
})
```

### Modeling Relationships

```typescript
// One-to-One: User -> AuthorProfile
authorProfiles: defineTable({
  userId: v.id("users"),  // Foreign key
  bio: v.string(),
}).index("by_userId", ["userId"]),

// One-to-Many: Author -> Posts
posts: defineTable({
  authorId: v.id("authorProfiles"),
  title: v.string(),
  content: v.string(),
}).index("by_authorId", ["authorId"]),

// Many-to-Many: Posts <-> Categories (junction table)
postCategories: defineTable({
  postId: v.id("posts"),
  categoryId: v.id("categories"),
}).index("by_postId", ["postId"])
  .index("by_categoryId", ["categoryId"]),
```

### Type Validators Reference

```typescript
import { v } from "convex/values";

v.string()                    // String
v.number()                    // Number (int or float)
v.boolean()                   // Boolean
v.null()                      // Null
v.id("tableName")             // Document ID reference
v.array(v.string())           // Array of strings
v.object({ key: v.string() }) // Object with typed fields
v.optional(v.string())        // Optional field
v.union(v.string(), v.null()) // Union types
v.literal("pending")          // Literal value
v.any()                       // Any JSON value
v.bytes()                     // Binary data
```

---

## 2. Convex Actions

### Basic Action (Calling External APIs)

```typescript
// convex/actions.ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const callExternalAPI = action({
  args: {
    prompt: v.string(),
    timeout: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Actions can use fetch to call external APIs
    const response = await fetch("https://api.example.com/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: args.prompt }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  },
});
```

### Action Calling E2B Sandbox

```typescript
// convex/e2b.ts
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import Sandbox from "@e2b/code-interpreter";

export const runAgentInSandbox = action({
  args: {
    sessionId: v.id("sessions"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    // Update session status via internal mutation
    await ctx.runMutation(internal.sessions.updateStatus, {
      sessionId: args.sessionId,
      status: "running",
    });

    try {
      // Create E2B sandbox
      const sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY,
      });

      // Execute code in sandbox
      const result = await sandbox.runCode(`
        print("Processing: ${args.prompt}")
      `);

      // Store result via mutation
      await ctx.runMutation(internal.sessions.saveResult, {
        sessionId: args.sessionId,
        result: result.logs.stdout.join("\n"),
        status: "completed",
      });

      await sandbox.kill();
      return { success: true };
    } catch (error) {
      await ctx.runMutation(internal.sessions.updateStatus, {
        sessionId: args.sessionId,
        status: "failed",
        error: String(error),
      });
      throw error;
    }
  },
});
```

### Node.js Runtime for NPM Packages

```typescript
// convex/nodeActions.ts
"use node";  // Required directive at top of file

import { action } from "./_generated/server";
import SomeNpmPackage from "some-npm-package";

export const doSomethingWithNpm = action({
  args: {},
  handler: async () => {
    // Can use Node.js-specific packages
    // Trade-off: Potential cold starts
    return SomeNpmPackage.process();
  },
});
```

### Internal Actions (Not Exposed to Clients)

```typescript
// convex/internal.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

// Only callable from other Convex functions, not from client
export const processInBackground = internalAction({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    const result = await fetch("https://api.example.com/process", {
      method: "POST",
      body: args.data,
    });
    return result.json();
  },
});
```

---

## 3. HTTP Endpoints

### Basic HTTP Router Setup

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Simple GET endpoint
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

### Webhook Receiver with Token Validation

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/webhook/e2b-callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Validate webhook token
    const authHeader = request.headers.get("Authorization");
    const expectedToken = process.env.WEBHOOK_SECRET;

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse payload
    const payload = await request.json();

    // Process via internal mutation
    await ctx.runMutation(internal.sessions.handleCallback, {
      sessionId: payload.sessionId,
      result: payload.result,
      status: payload.status,
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

### Webhook with HMAC-SHA256 Signature Verification

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";  // For Clerk/Svix webhooks

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = await request.text();

    // Svix signature validation
    const svixHeaders = {
      "svix-id": request.headers.get("svix-id")!,
      "svix-timestamp": request.headers.get("svix-timestamp")!,
      "svix-signature": request.headers.get("svix-signature")!,
    };

    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

    try {
      const event = wh.verify(payload, svixHeaders);

      // Handle event based on type
      switch (event.type) {
        case "user.created":
          await ctx.runMutation(internal.users.create, { data: event.data });
          break;
        case "user.updated":
          await ctx.runMutation(internal.users.update, { data: event.data });
          break;
      }

      return new Response(null, { status: 200 });
    } catch (error) {
      console.error("Webhook verification failed:", error);
      return new Response("Invalid signature", { status: 400 });
    }
  }),
});

export default http;
```

### CORS Headers for Cross-Origin Requests

```typescript
// Handle CORS preflight
http.route({
  path: "/api/submit",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN!,
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        }),
      });
    }
    return new Response();
  }),
});

// Actual endpoint with CORS headers
http.route({
  path: "/api/submit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const data = await request.json();
    // ... process data

    return new Response(JSON.stringify({ success: true }), {
      headers: new Headers({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN!,
        "Vary": "origin",
      }),
    });
  }),
});
```

---

## 4. Real-time Subscriptions

### useQuery Hook (Automatic Subscriptions)

```typescript
// React component
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export function SessionView({ sessionId }: { sessionId: string }) {
  // Automatically subscribes and re-renders on changes
  const session = useQuery(api.sessions.get, { sessionId });
  const messages = useQuery(api.messages.list, { sessionId });

  // Returns undefined while loading
  if (session === undefined || messages === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Session: {session.status}</h1>
      {messages.map((msg) => (
        <div key={msg._id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

### Conditional Queries with "skip"

```typescript
function UserProfile({ userId }: { userId: string | null }) {
  // Pass "skip" to prevent query execution when userId is null
  const user = useQuery(
    api.users.get,
    userId ? { id: userId } : "skip"
  );

  if (user === undefined) {
    return <div>Loading...</div>;
  }

  return <div>{user?.name}</div>;
}
```

### useMutation with Optimistic Updates

```typescript
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function MessageInput({ sessionId }: { sessionId: string }) {
  const sendMessage = useMutation(api.messages.send)
    .withOptimisticUpdate((localStore, args) => {
      // Immediately show message in UI before server confirms
      const existingMessages = localStore.getQuery(api.messages.list, {
        sessionId: args.sessionId
      });

      if (existingMessages !== undefined) {
        localStore.setQuery(api.messages.list, { sessionId: args.sessionId }, [
          ...existingMessages,
          {
            _id: "optimistic-" + Date.now(),
            _creationTime: Date.now(),
            sessionId: args.sessionId,
            role: "user",
            content: args.content,
          },
        ]);
      }
    });

  const handleSubmit = async (content: string) => {
    await sendMessage({ sessionId, content, role: "user" });
  };

  return <form onSubmit={/* ... */}>...</form>;
}
```

### Paginated Queries with usePaginatedQuery

```typescript
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function MessageHistory({ sessionId }: { sessionId: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listPaginated,
    { sessionId },
    { initialNumItems: 20 }
  );

  return (
    <div>
      {results?.map((message) => (
        <div key={message._id}>{message.content}</div>
      ))}

      <button
        onClick={() => loadMore(20)}
        disabled={status !== "CanLoadMore"}
      >
        {status === "LoadingMore" ? "Loading..." : "Load More"}
      </button>

      {status === "Exhausted" && <p>No more messages</p>}
    </div>
  );
}
```

### Paginated Query Function

```typescript
// convex/messages.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const listPaginated = query({
  args: {
    sessionId: v.id("sessions"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

---

## 5. File Storage

### Storing Files (Blobs, Checkpoints, Artifacts)

```typescript
// convex/storage.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Generate upload URL for client
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Store file reference after upload
export const saveFile = mutation({
  args: {
    storageId: v.id("_storage"),
    sessionId: v.id("sessions"),
    filename: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      storageId: args.storageId,
      sessionId: args.sessionId,
      filename: args.filename,
      contentType: args.contentType,
      createdAt: Date.now(),
    });
  },
});

// Get download URL
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

### HTTP Action for Direct File Upload

```typescript
// convex/http.ts
http.route({
  path: "/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Get file from request body
    const blob = await request.blob();

    // Store directly to Convex storage
    const storageId = await ctx.storage.store(blob);

    // Optionally save metadata
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (sessionId) {
      await ctx.runMutation(internal.artifacts.save, {
        storageId,
        sessionId,
        contentType: request.headers.get("Content-Type") || "application/octet-stream",
      });
    }

    return new Response(JSON.stringify({ storageId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

### Client-Side Upload Pattern

```typescript
// React component
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function FileUpload({ sessionId }: { sessionId: string }) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const saveFile = useMutation(api.storage.saveFile);

  const handleUpload = async (file: File) => {
    // Step 1: Get upload URL from Convex
    const uploadUrl = await generateUploadUrl();

    // Step 2: Upload file directly to Convex storage
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await response.json();

    // Step 3: Save file reference in database
    await saveFile({
      storageId,
      sessionId,
      filename: file.name,
      contentType: file.type,
    });
  };

  return <input type="file" onChange={(e) => handleUpload(e.target.files![0])} />;
}
```

### Storage Schema Pattern

```typescript
// convex/schema.ts
export default defineSchema({
  // Artifacts table with storage references
  artifacts: defineTable({
    storageId: v.id("_storage"),  // Reference to _storage system table
    sessionId: v.id("sessions"),
    filename: v.string(),
    contentType: v.string(),
    size: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),

  // Checkpoints for session state
  checkpoints: defineTable({
    sessionId: v.id("sessions"),
    storageId: v.id("_storage"),  // Serialized state blob
    version: v.number(),
    createdAt: v.number(),
  }).index("by_sessionId_version", ["sessionId", "version"]),
});
```

---

## 6. Authentication

### Clerk Integration Setup

```typescript
// src/main.tsx (React)
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function App() {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <YourApp />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

### Convex Auth Config

```typescript
// convex/auth.config.ts
import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
```

### Accessing User Identity in Functions

```typescript
// convex/sessions.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listMySessions = query({
  args: {},
  handler: async (ctx) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Query sessions for this user
    return await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) =>
        q.eq("userId", identity.tokenIdentifier)
      )
      .collect();
  },
});

export const createSession = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    return await ctx.db.insert("sessions", {
      userId: identity.tokenIdentifier,
      name: args.name,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});
```

### Multi-Tenant / Workspace Pattern

```typescript
// convex/schema.ts
export default defineSchema({
  // Workspaces (tenants)
  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(),  // tokenIdentifier
    createdAt: v.number(),
  }),

  // Workspace memberships
  memberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),  // tokenIdentifier
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  }).index("by_userId", ["userId"])
    .index("by_workspaceId", ["workspaceId"]),

  // Sessions scoped to workspace
  sessions: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    status: v.string(),
  }).index("by_workspaceId", ["workspaceId"]),
});
```

```typescript
// convex/workspaces.ts
export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get all workspaces user is a member of
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) =>
        q.eq("userId", identity.tokenIdentifier)
      )
      .collect();

    const workspaces = await Promise.all(
      memberships.map((m) => ctx.db.get(m.workspaceId))
    );

    return workspaces.filter(Boolean);
  },
});

// Helper to verify workspace access
async function verifyWorkspaceAccess(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  requiredRole?: "owner" | "admin"
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
    .first();

  if (!membership) throw new Error("Not a member of this workspace");

  if (requiredRole === "owner" && membership.role !== "owner") {
    throw new Error("Owner access required");
  }
  if (requiredRole === "admin" && !["owner", "admin"].includes(membership.role)) {
    throw new Error("Admin access required");
  }

  return membership;
}
```

### Row-Level Security Pattern

```typescript
// convex/rls.ts
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  Rules,
  RLSConfig,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { DataModel } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";

async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  return {
    sessions: {
      read: async (_, session) => {
        if (!identity) return false;
        // Can only read sessions in user's workspaces
        const membership = await ctx.db
          .query("memberships")
          .withIndex("by_workspaceId", (q) =>
            q.eq("workspaceId", session.workspaceId)
          )
          .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
          .first();
        return !!membership;
      },
      modify: async (_, session) => {
        if (!identity) return false;
        // Same logic for writes
        const membership = await ctx.db
          .query("memberships")
          .withIndex("by_workspaceId", (q) =>
            q.eq("workspaceId", session.workspaceId)
          )
          .filter((q) => q.eq(q.field("userId"), identity.tokenIdentifier))
          .first();
        return membership?.role === "owner" || membership?.role === "admin";
      },
    },
  } satisfies Rules<QueryCtx, DataModel>;
}

const config: RLSConfig = { defaultPolicy: "deny" };

export const queryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => ({
    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx), config),
  })),
);

export const mutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx), config),
  })),
);
```

---

## 7. Background Jobs and Scheduling

### Scheduling with ctx.scheduler

```typescript
// convex/actions.ts
import { action, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";

export const startLongRunningTask = action({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    // Do the external work
    const result = await fetch("https://api.example.com/process");
    const data = await result.json();

    // Schedule the result to be saved (runs immediately after this action)
    await ctx.scheduler.runAfter(0, api.sessions.saveResult, {
      sessionId: args.sessionId,
      result: data,
    });

    // Schedule a follow-up check in 5 minutes
    await ctx.scheduler.runAfter(5 * 60 * 1000, internal.tasks.checkStatus, {
      sessionId: args.sessionId,
    });

    return { scheduled: true };
  },
});

// Schedule at specific time
export const scheduleReminder = mutation({
  args: {
    sessionId: v.id("sessions"),
    reminderTime: v.number(),  // Unix timestamp
  },
  handler: async (ctx, args) => {
    const scheduledId = await ctx.scheduler.runAt(
      args.reminderTime,
      internal.notifications.sendReminder,
      { sessionId: args.sessionId }
    );

    // Store the scheduled function ID if you need to cancel later
    await ctx.db.patch(args.sessionId, {
      reminderScheduledId: scheduledId
    });
  },
});
```

### Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run every hour
crons.hourly(
  "cleanup-stale-sessions",
  { minuteUTC: 0 },  // At minute 0 of every hour
  internal.maintenance.cleanupStaleSessions
);

// Run daily at midnight UTC
crons.daily(
  "generate-daily-report",
  { hourUTC: 0, minuteUTC: 0 },
  internal.reports.generateDaily
);

// Custom cron expression (every 5 minutes)
crons.cron(
  "health-check",
  "*/5 * * * *",
  internal.monitoring.healthCheck
);

// Weekly on Sundays at 3am UTC
crons.weekly(
  "weekly-cleanup",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.maintenance.weeklyCleanup
);

export default crons;
```

### Cancel Scheduled Functions

```typescript
// convex/tasks.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const cancelScheduledTask = mutation({
  args: {
    scheduledId: v.id("_scheduled_functions"),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.cancel(args.scheduledId);
  },
});
```

---

## 8. Best Practices

### Function Organization

```
convex/
  schema.ts           # Database schema
  auth.config.ts      # Auth configuration
  http.ts             # HTTP endpoints
  crons.ts            # Cron jobs

  # Feature-based organization
  sessions/
    queries.ts        # Public queries
    mutations.ts      # Public mutations
    actions.ts        # Actions (external API calls)
    internal.ts       # Internal functions

  messages/
    queries.ts
    mutations.ts

  # Shared utilities
  lib/
    validators.ts     # Shared validators
    helpers.ts        # Helper functions
```

### Internal vs Public Functions

```typescript
// Public: Callable from client
export const getSessions = query({...});
export const createSession = mutation({...});

// Internal: Only callable from other Convex functions
export const processInternal = internalMutation({...});
export const fetchExternal = internalAction({...});

// Use internal functions to:
// 1. Hide implementation details from clients
// 2. Reuse logic across multiple public functions
// 3. Perform privileged operations after validation
```

### Error Handling

```typescript
export const safeAction = action({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    try {
      const result = await fetch("https://api.example.com");
      if (!result.ok) {
        // Log and update status
        await ctx.runMutation(internal.sessions.setError, {
          sessionId: args.sessionId,
          error: `API returned ${result.status}`,
        });
        throw new Error(`API error: ${result.status}`);
      }
      return result.json();
    } catch (error) {
      // Ensure state is updated even on failure
      await ctx.runMutation(internal.sessions.setError, {
        sessionId: args.sessionId,
        error: String(error),
      });
      throw error;
    }
  },
});
```

---

## References

- [Convex Documentation](https://docs.convex.dev/)
- [Convex Stack Blog](https://stack.convex.dev/)
- [convex-helpers GitHub](https://github.com/get-convex/convex-helpers)
- [Convex API Reference](https://docs.convex.dev/api/)

---

*Documentation gathered January 2026 using Context7*
