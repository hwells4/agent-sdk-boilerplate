import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getUserMembership } from "./lib/authorization";
import { validateName } from "./lib/validators";

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

    // Validate input lengths
    validateName(args.name);

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

    // Validate input lengths
    validateName(args.name);

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

    // Use Promise.all for batch deletions to avoid timeout on large workspaces
    // Queries can run in parallel, deletes must respect order (children before parents)

    // 1. Query all related data in parallel (single query per table using workspace indexes)
    const [sandboxRuns, members, allArtifacts] = await Promise.all([
      ctx.db
        .query("sandboxRuns")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect(),
    ]);

    // 2. Delete all artifacts in parallel (must complete before deleting runs)
    await Promise.all(allArtifacts.map((artifact) => ctx.db.delete(artifact._id)));

    // 3. Delete all sandboxRuns in parallel (must complete before deleting workspace)
    await Promise.all(sandboxRuns.map((run) => ctx.db.delete(run._id)));

    // 4. Delete all workspace members in parallel
    await Promise.all(members.map((member) => ctx.db.delete(member._id)));

    // 5. Delete the workspace
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
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      return null;
    }

    // Use shared helper with by_workspace_user composite index for O(1) lookup
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return null;
    }

    return workspace;
  },
});

/**
 * List all workspaces for the current user
 * Returns workspaces where the user is a member (including owner)
 *
 * Optimized: Uses by_user index on memberships and Promise.all for batch fetching
 * Note: Owner membership is already included in workspaceMembers (created on workspace creation)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return [];
    }

    // Get all memberships for the current user (includes owner membership)
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Batch fetch all workspaces in parallel using Promise.all
    const workspacePromises = memberships.map((membership) =>
      ctx.db.get(membership.workspaceId)
    );
    const workspaces = await Promise.all(workspacePromises);

    // Filter out null values with proper type narrowing
    return workspaces.filter(
      (workspace): workspace is NonNullable<typeof workspace> =>
        workspace !== null
    );
  },
});
