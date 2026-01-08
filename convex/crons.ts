import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Kill idle sandboxes every 30 seconds.
 *
 * This prevents runaway sandbox costs by terminating sandboxes that have been
 * inactive for more than 15 minutes (configured in killIdleSandboxes action).
 */
crons.interval(
  "kill idle sandboxes",
  { seconds: 30 },
  internal.actions.killIdleSandboxes.killIdleSandboxes,
  {}
);

export default crons;
