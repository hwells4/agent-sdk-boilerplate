import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getUserMembership, getSandboxRunAccess } from "./lib/authorization";

/**
 * Storage mutations for artifact file uploads.
 *
 * Convex storage flow:
 * 1. Client calls generateUploadUrl to get a signed URL
 * 2. Client uploads file to that URL via HTTP POST
 * 3. Upload returns a storageId
 * 4. Client passes storageId to artifact creation mutation
 */

/**
 * Generate a URL for uploading a file to Convex storage.
 *
 * This is a public mutation that validates workspace membership
 * before generating the upload URL.
 *
 * @param workspaceId - The workspace to validate access for
 * @returns A signed URL for uploading a file
 */
export const generateUploadUrl = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<string> => {
    // Check workspace membership
    const membership = await getUserMembership(ctx, args.workspaceId);
    if (membership === null) {
      throw new Error("Unauthorized: not a member of this workspace");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Internal mutation for generating upload URLs.
 *
 * SECURITY CONTRACT:
 * Caller MUST verify user has workspace membership before calling.
 * This is designed for SDK integration where auth is handled at the SDK layer.
 *
 * @internal Only use from SDK or actions that have validated auth
 */
export const internalGenerateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get a URL for downloading a stored file.
 *
 * Validates access by finding the artifact that references this storageId
 * and checking that the user is a member of the artifact's workspace.
 *
 * @param storageId - The storage ID of the file
 * @returns A URL for downloading the file, or null if not found/unauthorized
 */
export const getDownloadUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<string | null> => {
    // Check user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    // Find the artifact that references this storage ID
    const artifact = await ctx.db
      .query("artifacts")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (artifact === null) {
      // No artifact references this storage ID
      return null;
    }

    // Check user has access to the artifact's workspace
    const membership = await getUserMembership(ctx, artifact.workspaceId);
    if (membership === null) {
      return null;
    }

    return await ctx.storage.getUrl(args.storageId);
  },
});
