import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { requireWorkspaceMembership } from "./lib/authorization";

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
    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check if current user can manage members (owner or admin)
    const currentMembership = await requireWorkspaceMembership(ctx, args.workspaceId, ["owner", "admin"]);

    // Restrict admin privilege escalation: only owners can add admins
    if (args.role === "admin" && currentMembership.role !== "owner") {
      throw new Error("Unauthorized: only owners can add admin members");
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
    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check if current user can manage members (owner or admin)
    await requireWorkspaceMembership(ctx, args.workspaceId, ["owner", "admin"]);

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
    // Check if workspace exists
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Check if current user can manage members (owner or admin)
    await requireWorkspaceMembership(ctx, args.workspaceId, ["owner", "admin"]);

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
 * Internal query to get a user's membership in a workspace
 * Used by actions to check authorization without ctx.auth
 * @param workspaceId - The ID of the workspace
 * @param userId - The user ID to check
 * @returns The membership document or null
 */
export const internalGetMembership = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"workspaceMembers"> | null> => {
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId)
      )
      .first();

    return membership;
  },
});
