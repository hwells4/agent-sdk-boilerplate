/**
 * Shared constants for sandbox management
 */

/**
 * Idle timeout in milliseconds (15 minutes)
 * Sandboxes with no activity for this duration will be killed by the cron job
 */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Boot timeout in milliseconds (5 minutes)
 * Sandboxes stuck in 'booting' state for this duration will be canceled
 */
export const BOOT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Default maximum duration for sandbox runs in milliseconds (2 minutes)
 * Individual runs can override this value
 */
export const DEFAULT_MAX_DURATION_MS = 2 * 60 * 1000;
