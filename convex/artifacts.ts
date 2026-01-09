import { v } from "convex/values";
import { paginationOptsValidator, PaginationResult } from "convex/server";
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
      workspaceId: access.sandboxRun.workspaceId, // Denormalized for efficient queries
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
    workspaceId: v.id("workspaces"),
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
    // Validate sandbox run exists (FK check)
    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (sandboxRun === null) {
      throw new Error(`Sandbox run not found: ${args.sandboxRunId}`);
    }

    // Validate workspace exists (FK check)
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throw new Error(`Workspace not found: ${args.workspaceId}`);
    }

    // Validate consistency: sandbox run belongs to specified workspace
    if (sandboxRun.workspaceId !== args.workspaceId) {
      throw new Error(
        `Workspace mismatch: sandbox run belongs to workspace ${sandboxRun.workspaceId}, not ${args.workspaceId}`
      );
    }

    const now = Date.now();
    const artifactId = await ctx.db.insert("artifacts", {
      sandboxRunId: args.sandboxRunId,
      workspaceId: args.workspaceId,
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
 * List artifacts for a sandbox run with pagination
 * Uses Convex's built-in .paginate() for O(page_size) memory usage
 * @param sandboxRunId - The sandbox run ID
 * @param paginationOpts - Pagination options (numItems, cursor)
 * @returns PaginationResult with page, continueCursor, and isDone
 */
export const listByRun = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<Doc<"artifacts">>> => {
    // Check workspace membership via sandbox run
    const access = await getSandboxRunAccess(ctx, args.sandboxRunId);
    if (access === null) {
      return { page: [], continueCursor: "", isDone: true };
    }

    // Use built-in pagination - only loads requested page size
    return await ctx.db
      .query("artifacts")
      .withIndex("by_run", (q) => q.eq("sandboxRunId", args.sandboxRunId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Backfill workspaceId for existing artifacts that don't have it set.
 * Run this after schema migration to populate denormalized workspaceId field.
 * Processes in batches to avoid timeouts.
 *
 * @param batchSize - Number of artifacts to process per call (default: 100)
 * @returns Number of artifacts updated, or 0 if backfill is complete
 */
export const backfillWorkspaceId = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<number> => {
    const batchSize = args.batchSize ?? 100;

    // Find artifacts without workspaceId (using type assertion since field is now required)
    const artifacts = await ctx.db
      .query("artifacts")
      .take(batchSize);

    let updated = 0;
    for (const artifact of artifacts) {
      // Check if workspaceId is missing (pre-migration artifacts)
      // TypeScript thinks it's always present, but old data won't have it
      if ((artifact as { workspaceId?: unknown }).workspaceId === undefined) {
        const sandboxRun = await ctx.db.get(artifact.sandboxRunId);
        if (sandboxRun) {
          await ctx.db.patch(artifact._id, {
            workspaceId: sandboxRun.workspaceId,
          });
          updated++;
        }
      }
    }

    return updated;
  },
});

/**
 * List artifacts with pending review state for a workspace with pagination
 * Uses composite index by_workspace_review for O(1) query complexity.
 *
 * @param workspaceId - The workspace to filter artifacts by
 * @param paginationOpts - Pagination options (numItems, cursor)
 * @returns PaginationResult with pending artifacts for this workspace
 */
export const listPending = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<Doc<"artifacts">>> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      return { page: [], continueCursor: "", isDone: true };
    }

    // Use composite index for O(1) query - no post-fetch filtering needed
    return await ctx.db
      .query("artifacts")
      .withIndex("by_workspace_review", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("reviewState", "pending")
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
