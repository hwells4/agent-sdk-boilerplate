/**
 * Centralized constants for the Claude Agent SDK.
 *
 * This module provides a single source of truth for magic strings and configuration
 * values used throughout the SDK, including model IDs, paths, tool lists, and timeouts.
 */

// ============================================================================
// Claude Model Identifiers
// ============================================================================

/**
 * Default Claude model used for agent execution
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929' as const

/**
 * Supported Claude models with their identifiers
 */
export const SUPPORTED_MODELS = {
  SONNET: 'claude-sonnet-4-5-20250929',
  OPUS: 'claude-opus-4-5-20251101',
} as const

export type SupportedModel = typeof SUPPORTED_MODELS[keyof typeof SUPPORTED_MODELS]

// ============================================================================
// Sandbox Configuration
// ============================================================================

/**
 * E2B sandbox paths and scripts
 */
export const SANDBOX_CONFIG = {
  /** Default working directory inside sandbox */
  HOME_DIR: '/home/user',
  /** Main agent script filename */
  AGENT_SCRIPT: 'agent.py',
  /** Streaming agent script filename */
  STREAMING_SCRIPT: 'streaming_agent.py',
  /** Python interpreter command */
  PYTHON_COMMAND: 'python3',
} as const

/**
 * Full path to the agent script
 */
export const AGENT_SCRIPT_PATH = `${SANDBOX_CONFIG.HOME_DIR}/${SANDBOX_CONFIG.AGENT_SCRIPT}` as const

/**
 * Full path to the streaming agent script
 */
export const STREAMING_SCRIPT_PATH = `${SANDBOX_CONFIG.HOME_DIR}/${SANDBOX_CONFIG.STREAMING_SCRIPT}` as const

// ============================================================================
// Default Allowed Tools
// ============================================================================

/**
 * Default set of tools available to Claude agents in sandboxes.
 *
 * These tools provide file system, command execution, and web access capabilities
 * that enable autonomous operation.
 */
export const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
] as const

export type AllowedTool = typeof DEFAULT_ALLOWED_TOOLS[number]

// ============================================================================
// Timeouts (in milliseconds)
// ============================================================================

/**
 * Timeout configuration for sandbox operations
 */
export const TIMEOUTS = {
  /** Default sandbox execution timeout (2 minutes) */
  DEFAULT_SANDBOX_TIMEOUT: 120_000,
  /** Maximum allowed sandbox timeout (10 minutes) */
  MAX_SANDBOX_TIMEOUT: 600_000,
  /** Idle timeout for cleanup (15 minutes) - synced with convex/lib/constants.ts */
  IDLE_CLEANUP_TIMEOUT: 15 * 60 * 1000,
  /** Boot timeout for cleanup (5 minutes) - synced with convex/lib/constants.ts */
  BOOT_CLEANUP_TIMEOUT: 5 * 60 * 1000,
  /** Heartbeat interval for long-running tasks (30 seconds) */
  HEARTBEAT_INTERVAL: 30_000,
} as const

// ============================================================================
// E2B Resource Defaults
// ============================================================================

/**
 * Default E2B sandbox resource configuration (from e2b.toml)
 */
export const E2B_DEFAULTS = {
  /** Default CPU count for sandboxes */
  CPU_COUNT: 2,
  /** Default memory in GB */
  MEMORY_GB: 4,
} as const

// ============================================================================
// String Length Limits (for Convex storage)
// ============================================================================

/**
 * String length limits for Convex storage.
 * Values synced with convex/lib/constants.ts
 */
export const STRING_LIMITS = {
  /** Maximum length for result storage */
  MAX_RESULT_LENGTH: 10_000,
  /** Maximum length for prompt storage */
  MAX_PROMPT_LENGTH: 50_000,
  /** Maximum length for error messages */
  MAX_ERROR_MESSAGE_LENGTH: 1_000,
} as const

// ============================================================================
// Artifact Limits
// ============================================================================

/**
 * Limits for artifact capture and storage
 */
export const ARTIFACT_LIMITS = {
  /** Maximum file size for artifact capture (10MB) */
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  /** Maximum number of artifacts to capture per run */
  MAX_ARTIFACTS_PER_RUN: 50,
  /** Maximum title length for artifacts */
  MAX_TITLE_LENGTH: 200,
} as const

/**
 * Default patterns for artifact capture.
 * These patterns exclude system/temp files and focus on user-generated content.
 */
export const DEFAULT_ARTIFACT_PATTERNS = [
  '/home/user/**/*.py',
  '/home/user/**/*.js',
  '/home/user/**/*.ts',
  '/home/user/**/*.json',
  '/home/user/**/*.html',
  '/home/user/**/*.css',
  '/home/user/**/*.md',
  '/home/user/**/*.txt',
  '/home/user/**/*.csv',
  '/home/user/**/*.png',
  '/home/user/**/*.jpg',
  '/home/user/**/*.svg',
] as const

/**
 * Files to exclude from artifact capture (SDK-generated files)
 */
export const ARTIFACT_EXCLUDE_PATTERNS = [
  'agent.py',
  'streaming_agent.py',
] as const
