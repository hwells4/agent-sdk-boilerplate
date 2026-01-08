import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";

/**
 * Artifact mutations and queries
 *
 * Manages artifacts produced by sandbox runs, including files, images, code, and logs.
 * Supports a human-in-the-loop (HITL) review workflow with pending/approved/rejected states.
 */

/**
 * Create a new artifact
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
    type: v.union(
      v.literal("file"),
      v.literal("image"),
      v.literal("code"),
      v.literal("log"),
      v.literal("other")
    ),
    title: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sandboxPath: v.optional(v.string()),
    previewText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"artifacts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to create an artifact");
    }

    // Verify the sandbox run exists
    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (sandboxRun === null) {
      throw new Error("Sandbox run not found");
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
 * Update the review state of an artifact
 * @param artifactId - The ID of the artifact to update
 * @param reviewState - The new review state (pending, approved, rejected)
 */
export const updateReviewState = mutation({
  args: {
    artifactId: v.id("artifacts"),
    reviewState: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to update artifact review state");
    }

    const artifact = await ctx.db.get(args.artifactId);
    if (artifact === null) {
      throw new Error("Artifact not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.artifactId, {
      reviewState: args.reviewState,
      reviewedBy: identity.subject,
      reviewedAt: now,
    });
  },
});

/**
 * Get an artifact by ID
 * @param artifactId - The ID of the artifact
 * @returns The artifact or null if not found
 */
export const get = query({
  args: {
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args): Promise<Doc<"artifacts"> | null> => {
    return await ctx.db.get(args.artifactId);
  },
});

/**
 * List all artifacts for a sandbox run
 * @param sandboxRunId - The sandbox run ID
 * @returns Array of artifacts
 */
export const listByRun = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args): Promise<Doc<"artifacts">[]> => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_run", (q) => q.eq("sandboxRunId", args.sandboxRunId))
      .collect();
  },
});

/**
 * List all artifacts with pending review state
 * @returns Array of artifacts with reviewState 'pending'
 */
export const listPending = query({
  args: {},
  handler: async (ctx): Promise<Doc<"artifacts">[]> => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_review_state", (q) => q.eq("reviewState", "pending"))
      .collect();
  },
});
