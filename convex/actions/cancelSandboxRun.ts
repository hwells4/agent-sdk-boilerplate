"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { killSandboxSafely } from "../lib/e2b";

/**
 * Cancel a running sandbox run.
 *
 * This action:
 * 1. Fetches the sandbox run and verifies user has workspace access
 * 2. Kills the E2B sandbox (if sandboxId exists)
 * 3. Updates the sandboxRun status to 'canceled' with finishedAt timestamp
 *
 * Gracefully handles already-dead sandboxes - the E2B kill may fail if
 * the sandbox has already terminated, but we still update the status.
 *
 * @param sandboxRunId - The ID of the sandbox run to cancel
 * @returns Object with canceled flag and optional message
 */
export const cancelSandboxRun = action({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ canceled: boolean; message?: string }> => {
    // Step 1: Get the current user's identity
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to cancel a sandbox run");
    }

    // Step 2: Fetch the sandbox run
    const sandboxRun = await ctx.runQuery(internal.sandboxRuns.internalGet, {
      sandboxRunId: args.sandboxRunId,
    });
    if (sandboxRun === null) {
      throw new Error("Sandbox run not found");
    }

    // Step 3: Verify the user has access to the workspace
    const membership = await ctx.runQuery(internal.workspaceMembers.internalGetMembership, {
      workspaceId: sandboxRun.workspaceId,
      userId: identity.subject,
    });
    if (membership === null) {
      throw new Error("Unauthorized: must be a workspace member to cancel this sandbox run");
    }

    // Only allow creator, admins, or owners to cancel
    if (sandboxRun.createdBy !== identity.subject && membership.role === "member") {
      throw new Error("Unauthorized: only the creator or workspace admins can cancel this sandbox run");
    }

    // Step 4: Kill the E2B sandbox (handles already-dead sandboxes gracefully)
    await killSandboxSafely(sandboxRun.sandboxId);

    // Step 5: Update the run status to 'canceled' with finishedAt
    // Use skipTerminalStates to gracefully handle sandboxes that completed
    // between the query and this update (prevents race condition errors)
    const result = await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
      sandboxRunId: args.sandboxRunId,
      status: "canceled",
      finishedAt: Date.now(),
      skipTerminalStates: true,
    });

    if (result.skipped) {
      return {
        canceled: false,
        message: result.reason ?? "Sandbox already in terminal state",
      };
    }

    return { canceled: true };
  },
});
