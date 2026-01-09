/**
 * State machine for sandbox run status transitions
 *
 * Valid states: booting, running, succeeded, failed, canceled
 *
 * Valid transitions:
 * - booting -> running (sandbox started successfully)
 * - booting -> failed (sandbox failed to start)
 * - booting -> canceled (user canceled before start)
 * - running -> succeeded (sandbox completed successfully)
 * - running -> failed (sandbox encountered an error)
 * - running -> canceled (user canceled or idle timeout)
 */

/**
 * All possible sandbox run statuses
 */
export type SandboxStatus =
  | "booting"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

/**
 * Valid status transitions as a map from current status to allowed next statuses
 */
export const VALID_TRANSITIONS: Record<SandboxStatus, SandboxStatus[]> = {
  booting: ["running", "failed", "canceled"],
  running: ["succeeded", "failed", "canceled"],
  succeeded: [], // Terminal state
  failed: [], // Terminal state
  canceled: [], // Terminal state
};

/**
 * Validate whether a status transition is allowed
 * @param from - Current status
 * @param to - Proposed new status
 * @returns true if the transition is valid, false otherwise
 */
export function validateTransition(from: SandboxStatus, to: SandboxStatus): boolean {
  const allowedTransitions = VALID_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Get a human-readable error message for an invalid transition
 * @param from - Current status
 * @param to - Proposed new status
 * @returns Error message describing the invalid transition
 */
export function getTransitionError(from: SandboxStatus, to: SandboxStatus): string {
  const allowed = VALID_TRANSITIONS[from];
  if (allowed.length === 0) {
    return `Cannot transition from terminal state '${from}'`;
  }
  return `Invalid status transition from '${from}' to '${to}'. Allowed transitions: ${allowed.join(", ")}`;
}
