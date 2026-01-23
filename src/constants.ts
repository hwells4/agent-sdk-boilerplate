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
