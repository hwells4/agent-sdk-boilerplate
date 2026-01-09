"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Sandbox } from "@e2b/code-interpreter";
import { IDLE_TIMEOUT_MS, BOOT_TIMEOUT_MS } from "../lib/constants";
import { Doc } from "../_generated/dataModel";

/**
 * Kill idle and stuck booting sandboxes to prevent runaway costs.
 *
 * This action:
 * 1. Queries for running sandboxes that have been idle > 15 minutes
 * 2. Queries for sandboxes stuck in booting state > 5 minutes
 * 3. Connects to each sandbox and kills it (if sandboxId exists)
 * 4. Updates the sandboxRun status to 'canceled' with finishedAt timestamp
 *
 * Uses Promise.allSettled with batches of 10 for efficient parallelization.
 * Designed to be run by a cron job every 30 seconds.
 */
export const killIdleSandboxes = internalAction({
  args: {},
  handler: async (ctx): Promise<{ killed: number; errors: number }> => {
    // Query for idle running sandboxes and stuck booting sandboxes in parallel
    const [idleRuns, stuckBootingRuns] = await Promise.all([
      ctx.runQuery(internal.sandboxRuns.internalFindIdle, {
        maxIdleMs: IDLE_TIMEOUT_MS,
      }),
      ctx.runQuery(internal.sandboxRuns.internalFindStuckBooting, {
        maxBootMs: BOOT_TIMEOUT_MS,
      }),
    ]);

    // Combine both lists (avoiding duplicates by _id)
    const runMap = new Map<string, Doc<"sandboxRuns">>();
    for (const run of idleRuns) {
      runMap.set(run._id.toString(), run);
    }
    for (const run of stuckBootingRuns) {
      runMap.set(run._id.toString(), run);
    }
    const allRuns = Array.from(runMap.values());

    if (allRuns.length === 0) {
      return { killed: 0, errors: 0 };
    }

    let killed = 0;
    let errors = 0;

    /**
     * Process a single sandbox run - kill the sandbox and update status
     */
    const processRun = async (run: Doc<"sandboxRuns">): Promise<boolean> => {
      // Connect to the sandbox and kill it if sandboxId exists
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
      // Use skipTerminalStates to gracefully handle sandboxes that completed
      // between the query and this update (prevents race condition errors)
      const result = await ctx.runMutation(internal.sandboxRuns.internalUpdate, {
        sandboxRunId: run._id,
        status: "canceled",
        finishedAt: Date.now(),
        skipTerminalStates: true,
      });

      // Return whether we actually killed it (not just skipped)
      return result.updated;
    };

    // Process in batches of 10 for parallelization
    let skipped = 0;
    const BATCH_SIZE = 10;
    for (let i = 0; i < allRuns.length; i += BATCH_SIZE) {
      const batch = allRuns.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(processRun));

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value) {
            killed++;
          } else {
            // Sandbox was already in terminal state - this is expected (not an error)
            skipped++;
          }
        } else {
          console.error(
            `Failed to kill sandbox run: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
          );
          errors++;
        }
      }
    }

    console.log(
      `Sandbox cleanup: killed ${killed}, skipped ${skipped} (already terminated), errors ${errors}, total found ${allRuns.length} (idle: ${idleRuns.length}, stuck booting: ${stuckBootingRuns.length})`
    );

    return { killed, errors };
  },
});
