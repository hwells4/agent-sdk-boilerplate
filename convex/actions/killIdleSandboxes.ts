"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Sandbox } from "@e2b/code-interpreter";

/**
 * Kill idle sandboxes to prevent runaway costs.
 *
 * This action:
 * 1. Queries for running sandboxes that have been idle > 15 minutes
 * 2. Connects to each sandbox and kills it
 * 3. Updates the sandboxRun status to 'canceled' with finishedAt timestamp
 *
 * Designed to be run by a cron job every 30 seconds.
 */
export const killIdleSandboxes = internalAction({
  args: {},
  handler: async (ctx): Promise<{ killed: number; errors: number }> => {
    // 15 minute idle timeout
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

    // Query for idle running sandboxes
    const idleRuns = await ctx.runQuery(internal.sandboxRuns.internalFindIdle, {
      maxIdleMs: IDLE_TIMEOUT_MS,
    });

    if (idleRuns.length === 0) {
      return { killed: 0, errors: 0 };
    }

    let killed = 0;
    let errors = 0;

    // Kill each idle sandbox
    for (const run of idleRuns) {
      try {
        // Connect to the sandbox and kill it
        // Note: sandbox.kill() may throw if sandbox is already dead
        if (run.sandboxId) {
          try {
            const sandbox = await Sandbox.connect(run.sandboxId);
            await sandbox.kill();
          } catch (sandboxError) {
            // Sandbox may already be dead - this is fine, continue with status update
            console.log(
              `Sandbox ${run.sandboxId} may already be terminated: ${sandboxError}`
            );
          }
        }

        // Update the run status to 'canceled' with finishedAt
        await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
          sandboxRunId: run._id,
          status: "canceled",
          finishedAt: Date.now(),
        });

        killed++;
      } catch (error) {
        // Log error but continue processing other sandboxes
        console.error(
          `Failed to kill sandbox run ${run._id}: ${error instanceof Error ? error.message : String(error)}`
        );
        errors++;
      }
    }

    console.log(
      `Idle sandbox cleanup: killed ${killed}, errors ${errors}, total found ${idleRuns.length}`
    );

    return { killed, errors };
  },
});
