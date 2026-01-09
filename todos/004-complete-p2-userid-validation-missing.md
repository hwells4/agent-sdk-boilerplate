---
status: pending
priority: p2
issue_id: "004"
tags: [code-review, security, validation]
dependencies: []
---

# Missing userId Format Validation in workspaceMembers

## Problem Statement

The `addMember`, `removeMember`, and `updateRole` mutations accept a `userId: v.string()` but don't validate its format. Invalid or malformed user IDs could be inserted.

**Why it matters**: User IDs should follow a specific format (e.g., Clerk's `user_xxx` pattern). Accepting arbitrary strings allows garbage data.

## Findings

### Locations
- `convex/workspaceMembers.ts:16` - addMember accepts any string
- `convex/workspaceMembers.ts:66` - removeMember accepts any string
- `convex/workspaceMembers.ts:114` - updateRole accepts any string
- `convex/workspaceMembers.ts:193` - internalGetMembership accepts any string

### Current Validation
```typescript
args: {
  workspaceId: v.id("workspaces"),
  userId: v.string(),  // No format validation
  role: v.union(v.literal("admin"), v.literal("member")),
},
```

## Proposed Solutions

### Option 1: Add userId Format Validator (Recommended)
**Pros**: Prevents garbage data, documents expected format
**Cons**: Must handle different auth providers
**Effort**: Low (30 min)

```typescript
// In lib/validators.ts
export function validateUserId(userId: string): void {
  // Adjust pattern based on your auth provider (Clerk, Auth0, etc.)
  if (!userId || userId.length < 5 || userId.length > 100) {
    throw new Error("Invalid user ID format");
  }
}
```

### Option 2: Use v.string() with Length Constraint
```typescript
userId: v.string(), // Then validate in handler
// In handler:
if (args.userId.length > 100) {
  throw new Error("User ID too long");
}
```

## Acceptance Criteria

- [ ] User ID length validated (min/max)
- [ ] Empty strings rejected
- [ ] Consistent validation across all member mutations

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-09 | Created | Found in security review |
