/**
 * Shared constants for sandbox management
 *
 * NOTE: Timeout values are synced with examples/lib/constants.ts TIMEOUTS object.
 * When changing these values, update both files to maintain consistency.
 */

/**
 * Idle timeout in milliseconds (15 minutes)
 * Sandboxes with no activity for this duration will be killed by the cron job
 * Synced with: TIMEOUTS.IDLE_CLEANUP_TIMEOUT in examples/lib/constants.ts
 */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Boot timeout in milliseconds (5 minutes)
 * Sandboxes stuck in 'booting' state for this duration will be canceled
 * Synced with: TIMEOUTS.BOOT_CLEANUP_TIMEOUT in examples/lib/constants.ts
 */
export const BOOT_TIMEOUT_MS = 5 * 60 * 1000;

// ============================================================================
// String Length Limits
// ============================================================================

/**
 * Maximum length for workspace/entity names
 */
export const MAX_NAME_LENGTH = 100;

/**
 * Maximum length for artifact titles
 */
export const MAX_TITLE_LENGTH = 200;

/**
 * Maximum length for thread IDs
 */
export const MAX_THREAD_ID_LENGTH = 100;

/**
 * Maximum length for error messages
 */
export const MAX_ERROR_MESSAGE_LENGTH = 1000;

/**
 * Maximum length for error codes
 */
export const MAX_ERROR_CODE_LENGTH = 50;

/**
 * Maximum length for error details
 */
export const MAX_ERROR_DETAILS_LENGTH = 2000;

/**
 * Maximum length for user IDs
 */
export const MAX_USER_ID_LENGTH = 100;

/**
 * Maximum length for prompts
 */
export const MAX_PROMPT_LENGTH = 50000;

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Maximum sandbox runs per user per minute
 * Used for rate limiting in startSandboxRun action
 */
export const RATE_LIMIT_MAX_RUNS_PER_MINUTE = 10;

