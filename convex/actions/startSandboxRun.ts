"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { IDLE_TIMEOUT_MS } from "../lib/constants";
import { Sandbox } from "@e2b/code-interpreter";

/**
 * Start a new sandbox run for executing Claude agents in E2B.
 *
 * This action:
 * 1. Creates a sandboxRun record with status 'booting'
 * 2. Creates an E2B sandbox using Sandbox.create()
 * 3. Updates sandboxRun with sandboxId and status 'running'
 * 4. On error: updates status to 'failed' with error details
 *
 * @param threadId - The thread ID this sandbox run is associated with
 * @param workspaceId - The workspace this run belongs to
 * @param prompt - The prompt to execute in the sandbox
 * @param maxDurationMs - Optional maximum duration in milliseconds (default: 120000)
 * @returns The sandboxRun ID and sandbox ID
 */
export const startSandboxRun = action({
  args: {
    threadId: v.string(),
    workspaceId: v.id("workspaces"),
    prompt: v.string(),
    maxDurationMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ sandboxRunId: Id<"sandboxRuns">; sandboxId: string }> => {
    // Get the current user's identity
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated: must be logged in to start a sandbox run");
    }

    // Check workspace membership BEFORE creating any records
    const membership = await ctx.runQuery(internal.workspaceMembers.internalGetMembership, {
      workspaceId: args.workspaceId,
      userId: identity.subject,
    });
    if (membership === null) {
      throw new Error("Unauthorized: must be a workspace member");
    }

    const templateId = process.env.E2B_TEMPLATE_ID;
    if (!templateId) {
      throw new Error("E2B_TEMPLATE_ID environment variable is not set");
    }

    const maxDurationMs = args.maxDurationMs ?? 2 * 60 * 1000; // Default 2 minutes
    const idleTimeoutMs = IDLE_TIMEOUT_MS;

    // Step 1: Create sandboxRun record with status 'booting'
    const sandboxRunId = await ctx.runMutation(internal.sandboxRuns.internalCreate, {
      threadId: args.threadId,
      workspaceId: args.workspaceId,
      createdBy: identity.subject,
      maxDurationMs,
      idleTimeoutMs,
    });

    let sandbox: Sandbox | null = null;

    try {
      // Step 2: Create E2B sandbox
      sandbox = await Sandbox.create(templateId, {
        timeoutMs: maxDurationMs,
        metadata: {
          threadId: args.threadId,
          workspaceId: args.workspaceId as string,
          sandboxRunId: sandboxRunId as string,
          prompt: args.prompt.substring(0, 100), // Truncate for metadata
        },
      });

      // Step 3: Update sandboxRun with sandboxId and status 'running'
      await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
        sandboxRunId,
        sandboxId: sandbox.sandboxId,
        status: "running",
        lastActivityAt: Date.now(),
      });

      return {
        sandboxRunId,
        sandboxId: sandbox.sandboxId,
      };
    } catch (error) {
      // Step 4: On error, update status to 'failed'
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error && "code" in error
        ? String((error as Error & { code?: string }).code)
        : undefined;

      await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
        sandboxRunId,
        status: "failed",
        finishedAt: Date.now(),
        error: {
          message: errorMessage,
          code: errorCode,
          details: undefined,
        },
      });

      // Clean up sandbox if it was partially created
      if (sandbox) {
        try {
          await sandbox.kill();
        } catch {
          // Ignore cleanup errors
        }
      }

      throw new Error(`Failed to start sandbox: ${errorMessage}`);
    }
  },
});
