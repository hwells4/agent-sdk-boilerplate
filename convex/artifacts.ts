import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import {
  getUserMembership,
  getSandboxRunAccess,
  getArtifactAccess,
} from "./lib/authorization";
import { artifactTypeValidator, reviewStateValidator } from "./lib/validators";

/**
 * Artifact mutations and queries
 *
 * Manages artifacts produced by sandbox runs, including files, images, code, and logs.
 * Supports a human-in-the-loop (HITL) review workflow with pending/approved/rejected states.
 */

/**
 * Create a new artifact (public, requires auth)
 * @param sandboxRunId - The sandbox run that produced this artifact
 * @param threadId - The thread this artifact is associated with
 * @param type - The type of artifact (file, image, code, log, other)
 * @param title - Human-readable title for the artifact
 * @param storageId - Convex storage ID for the artifact content
 * @param contentType - MIME type of the artifact
 * @param size - Size in bytes
 * @param sandboxPath - Optional path within the sandbox filesystem
 * @param previewText - Optional preview/snippet of the content
 * @returns The ID of the created artifact
 */
export const create = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    threadId: v.string(),
    type: artifactTypeValidator,
    title: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sandboxPath: v.optional(v.string()),
    previewText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"artifacts">> => {
    // Check workspace membership via sandbox run
    const access = await getSandboxRunAccess(ctx, args.sandboxRunId);
    if (access === null) {
      throw new Error("Unauthorized: not a member of this workspace or sandbox run not found");
    }

    const now = Date.now();
    const artifactId = await ctx.db.insert("artifacts", {
      sandboxRunId: args.sandboxRunId,
      threadId: args.threadId,
      type: args.type,
      title: args.title,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      sandboxPath: args.sandboxPath,
      previewText: args.previewText,
      reviewState: "pending",
      createdAt: now,
    });

    return artifactId;
  },
});

/**
 * Create a new artifact (internal, bypasses auth for actions)
 * Used by actions that have already validated authorization
 */
export const internalCreate = internalMutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    threadId: v.string(),
    type: artifactTypeValidator,
    title: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sandboxPath: v.optional(v.string()),
    previewText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"artifacts">> => {
    const now = Date.now();
    const artifactId = await ctx.db.insert("artifacts", {
      sandboxRunId: args.sandboxRunId,
      threadId: args.threadId,
      type: args.type,
      title: args.title,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      sandboxPath: args.sandboxPath,
      previewText: args.previewText,
      reviewState: "pending",
      createdAt: now,
    });

    return artifactId;
  },
});

/**
 * Update the review state of an artifact
 * Only owners and admins can review artifacts (members cannot)
 * @param artifactId - The ID of the artifact to update
 * @param reviewState - The new review state (pending, approved, rejected)
 */
export const updateReviewState = mutation({
  args: {
    artifactId: v.id("artifacts"),
    reviewState: reviewStateValidator,
  },
  handler: async (ctx, args): Promise<void> => {
    // Check workspace membership via artifact
    const access = await getArtifactAccess(ctx, args.artifactId);
    if (access === null) {
      throw new Error("Unauthorized: not a member of this workspace or artifact not found");
    }

    // Only owners and admins can review artifacts
    if (access.membership.role === "member") {
      throw new Error("Unauthorized: only owners and admins can review artifacts");
    }

    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    await ctx.db.patch(args.artifactId, {
      reviewState: args.reviewState,
      reviewedBy: identity!.subject,
      reviewedAt: now,
    });
  },
});

/**
 * Get an artifact by ID
 * Returns null if artifact not found or user doesn't have access
 * @param artifactId - The ID of the artifact
 * @returns The artifact or null if not found or unauthorized
 */
export const get = query({
  args: {
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args): Promise<Doc<"artifacts"> | null> => {
    const access = await getArtifactAccess(ctx, args.artifactId);
    if (access === null) {
      return null;
    }
    return access.artifact;
  },
});

/**
 * Pagination result type for artifacts
 */
type PaginatedArtifacts = {
  items: Doc<"artifacts">[];
  cursor: string | null;
};

/**
 * List artifacts for a sandbox run with pagination
 * Returns empty result if user doesn't have access
 * @param sandboxRunId - The sandbox run ID
 * @param cursor - Optional cursor to continue from (document ID from previous page)
 * @param limit - Optional limit (default 50)
 * @returns Paginated result with items and cursor for next page
 */
export const listByRun = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PaginatedArtifacts> => {
    // Check workspace membership via sandbox run
    const access = await getSandboxRunAccess(ctx, args.sandboxRunId);
    if (access === null) {
      return { items: [], cursor: null };
    }

    const limit = args.limit ?? 50;

    // Build query with descending order for consistent pagination
    const query = ctx.db
      .query("artifacts")
      .withIndex("by_run", (q) => q.eq("sandboxRunId", args.sandboxRunId))
      .order("desc");

    // Collect all results to enable cursor-based filtering
    const allResults = await query.collect();

    // If we have a cursor, find its position and start after it
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = allResults.findIndex((r) => r._id === args.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    // Take limit + 1 to detect if there are more items
    const slice = allResults.slice(startIndex, startIndex + limit + 1);

    // Determine if there are more items
    const hasMore = slice.length > limit;
    const items = hasMore ? slice.slice(0, limit) : slice;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id : null;

    return {
      items,
      cursor: nextCursor,
    };
  },
});

/**
 * List artifacts with pending review state for a workspace with pagination
 * Requires workspaceId to prevent multi-tenant data leakage
 * @param workspaceId - The workspace to filter artifacts by
 * @param cursor - Optional cursor to continue from (document ID from previous page)
 * @param limit - Optional limit (default 50)
 * @returns Paginated result with pending artifacts and cursor for next page
 */
export const listPending = query({
  args: {
    workspaceId: v.id("workspaces"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PaginatedArtifacts> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return { items: [], cursor: null };
    }

    const limit = args.limit ?? 50;

    // Get all pending artifacts with descending order
    const allPending = await ctx.db
      .query("artifacts")
      .withIndex("by_review_state", (q) => q.eq("reviewState", "pending"))
      .order("desc")
      .collect();

    // Filter to only artifacts belonging to this workspace's sandbox runs
    const workspaceArtifacts: Doc<"artifacts">[] = [];
    for (const artifact of allPending) {
      const sandboxRun = await ctx.db.get(artifact.sandboxRunId);
      if (sandboxRun && sandboxRun.workspaceId === args.workspaceId) {
        workspaceArtifacts.push(artifact);
      }
    }

    // If we have a cursor, find its position and start after it
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = workspaceArtifacts.findIndex((r) => r._id === args.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    // Take limit + 1 to detect if there are more items
    const slice = workspaceArtifacts.slice(startIndex, startIndex + limit + 1);

    // Determine if there are more items
    const hasMore = slice.length > limit;
    const items = hasMore ? slice.slice(0, limit) : slice;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id : null;

    return {
      items,
      cursor: nextCursor,
    };
  },
});
