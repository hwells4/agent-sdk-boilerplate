import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Workspace Member CRUD operations
 *
 * All functions use ctx.auth for user identification.
 * Role validation: only owner/admin can add/remove members
 */

// Helper type for roles
type Role = "owner" | "admin" | "member";

/**
 * Get the current user's membership in a workspace
 * Returns null if not a member
 */
async function getUserMembership(
  ctx: { db: any; auth: any },
  workspaceId: Id<"workspaces">
): Promise<{ role: Role } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return null;
  }

  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspaceId))
    .filter((q: any) => q.eq(q.field("userId"), identity.subject))
    .first();

  return membership;
}

/**
 * Check if the current user can manage members (owner or admin)
 */
async function canManageMembers(
  ctx: { db: any; auth: any },
  workspaceId: Id<"workspaces">
): Promise<boolean> {
  const membership = await getUserMembership(ctx, workspaceId);
  if (membership === null) {
    return false;
  }
  return membership.role === "owner" || membership.role === "admin";
}

/**
 * Add a member to a workspace
 * @param workspaceId - The ID of the workspace
 * @param userId - The user ID to add
 * @param role - The role to assign (admin or member)
 * @returns The ID of the created membership
 */
export const addMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args): Promise<Id<"workspaceMembers">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to add a member");
    }

    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check if current user can manage members
    if (!(await canManageMembers(ctx, args.workspaceId))) {
      throw new Error("Unauthorized: only owner or admin can add members");
    }

    // Check if user is already a member
    const existingMembership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existingMembership !== null) {
      throw new Error("User is already a member of this workspace");
    }

    // Add the member
    const membershipId = await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    });

    return membershipId;
  },
});

/**
 * Remove a member from a workspace
 * @param workspaceId - The ID of the workspace
 * @param userId - The user ID to remove
 */
export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to remove a member");
    }

    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check if current user can manage members
    if (!(await canManageMembers(ctx, args.workspaceId))) {
      throw new Error("Unauthorized: only owner or admin can remove members");
    }

    // Find the membership to remove
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (membership === null) {
      throw new Error("User is not a member of this workspace");
    }

    // Cannot remove the owner
    if (membership.role === "owner") {
      throw new Error("Cannot remove the workspace owner");
    }

    // Delete the membership
    await ctx.db.delete(membership._id);
  },
});

/**
 * Update a member's role
 * @param workspaceId - The ID of the workspace
 * @param userId - The user ID to update
 * @param newRole - The new role to assign (admin or member)
 */
export const updateRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    newRole: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to update a role");
    }

    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check if current user can manage members
    if (!(await canManageMembers(ctx, args.workspaceId))) {
      throw new Error("Unauthorized: only owner or admin can update roles");
    }

    // Find the membership to update
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (membership === null) {
      throw new Error("User is not a member of this workspace");
    }

    // Cannot change the owner's role
    if (membership.role === "owner") {
      throw new Error("Cannot change the workspace owner's role");
    }

    // Update the role
    await ctx.db.patch(membership._id, {
      role: args.newRole,
    });
  },
});

/**
 * List all members of a workspace
 * @param workspaceId - The ID of the workspace
 * @returns Array of workspace members
 */
export const listMembers = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return [];
    }

    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      return [];
    }

    // Check if user is a member
    const userMembership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (userMembership === null) {
      return [];
    }

    // Get all members
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return members;
  },
});

/**
 * Get workspaces the current user belongs to
 * @returns Array of workspaces with the user's role in each
 */
export const getUserWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return [];
    }

    // Get all memberships for the current user
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Get workspace details for each membership
    const workspacesWithRole = [];
    for (const membership of memberships) {
      const workspace = await ctx.db.get(membership.workspaceId);
      if (workspace !== null) {
        workspacesWithRole.push({
          ...workspace,
          role: membership.role,
          joinedAt: membership.joinedAt,
        });
      }
    }

    return workspacesWithRole;
  },
});
