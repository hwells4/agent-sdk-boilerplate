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

