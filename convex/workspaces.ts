import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Workspace CRUD operations
 *
 * All functions use ctx.auth for user identification.
 * Users can only access workspaces they own.
 */

/**
 * Create a new workspace
 * @param name - The name of the workspace
 * @returns The ID of the created workspace
 */
export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"workspaces">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to create a workspace");
    }

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      ownerId: identity.subject,
      createdAt: Date.now(),
    });

    // Also add the creator as an owner member
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: identity.subject,
      role: "owner",
      joinedAt: Date.now(),
    });

    return workspaceId;
  },
});

/**
 * Update a workspace's name
 * @param workspaceId - The ID of the workspace to update
 * @param name - The new name for the workspace
 */
export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to update a workspace");
    }

    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Only the owner can update the workspace
    if (workspace.ownerId !== identity.subject) {
      throw new Error("Unauthorized: only the workspace owner can update it");
    }

    await ctx.db.patch(args.workspaceId, {
      name: args.name,
    });
  },
});

/**
 * Remove (delete) a workspace
 * Performs cascade deletion in the correct order to prevent orphaned records:
 * 1. artifacts (for each sandboxRun)
 * 2. sandboxRuns
 * 3. workspaceMembers
 * 4. workspace
 *
 * Storage blobs are left for Convex GC (no manual deletion needed)
 *
 * @param workspaceId - The ID of the workspace to delete
 */
export const remove = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to remove a workspace");
    }

    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error("Workspace not found");
    }

    // Only the owner can delete the workspace
    if (workspace.ownerId !== identity.subject) {
      throw new Error("Unauthorized: only the workspace owner can delete it");
    }

    // 1. Get all sandboxRuns for this workspace
    const sandboxRuns = await ctx.db
      .query("sandboxRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // 2. Delete all artifacts for each sandboxRun, then delete the sandboxRun
    for (const run of sandboxRuns) {
      // Get all artifacts for this run
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_run", (q) => q.eq("sandboxRunId", run._id))
        .collect();

      // Delete all artifacts for this run
      for (const artifact of artifacts) {
        await ctx.db.delete(artifact._id);
      }

      // Delete the sandboxRun
      await ctx.db.delete(run._id);
    }

    // 3. Delete all workspace members
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    // 4. Delete the workspace
    await ctx.db.delete(args.workspaceId);
  },
});

/**
 * Get a workspace by ID
 * @param workspaceId - The ID of the workspace to retrieve
 * @returns The workspace document or null if not found/unauthorized
 */
export const get = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      return null;
    }

    // Check if user has access (is owner or member)
    if (workspace.ownerId === identity.subject) {
      return workspace;
    }

    // Check membership
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (membership === null) {
      return null;
    }

    return workspace;
  },
});

/**
 * List all workspaces for the current user
 * Returns workspaces where the user is the owner
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return [];
    }

    // Get workspaces owned by the user
    const ownedWorkspaces = await ctx.db
      .query("workspaces")
      .filter((q) => q.eq(q.field("ownerId"), identity.subject))
      .collect();

    // Get workspaces where user is a member (but not owner)
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Get the workspace details for memberships
    const memberWorkspaceIds = new Set(ownedWorkspaces.map((w) => w._id));
    const memberWorkspaces = [];

    for (const membership of memberships) {
      // Skip if already in owned workspaces
      if (memberWorkspaceIds.has(membership.workspaceId)) {
        continue;
      }

      const workspace = await ctx.db.get(membership.workspaceId);
      if (workspace !== null) {
        memberWorkspaces.push(workspace);
        memberWorkspaceIds.add(workspace._id);
      }
    }

    // Combine and return all workspaces
    return [...ownedWorkspaces, ...memberWorkspaces];
  },
});
