import { Infer, v } from "convex/values";
import {
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_THREAD_ID_LENGTH,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_ERROR_CODE_LENGTH,
  MAX_ERROR_DETAILS_LENGTH,
  MAX_USER_ID_LENGTH,
} from "./constants";

/**
 * Shared validators for Convex schema and mutations
 * Single source of truth for enum-like values
 */

// ============================================================================
// String Length Validation
// ============================================================================

/**
 * Validate string length and throw a clear error if exceeded
 * @param value - The string to validate
 * @param fieldName - Human-readable field name for error message
 * @param maxLength - Maximum allowed length
 * @throws Error with clear message if length exceeded
 */
export function validateStringLength(
  value: string,
  fieldName: string,
  maxLength: number
): void {
  if (value.length > maxLength) {
    throw new Error(
      `${fieldName} exceeds maximum length of ${maxLength} characters (got ${value.length})`
    );
  }
}

/**
 * Validate workspace/entity name length
 */
export function validateName(value: string): void {
  validateStringLength(value, "Name", MAX_NAME_LENGTH);
}

/**
 * Validate artifact title length
 */
export function validateTitle(value: string): void {
  validateStringLength(value, "Title", MAX_TITLE_LENGTH);
}

/**
 * Validate thread ID length
 */
export function validateThreadId(value: string): void {
  validateStringLength(value, "Thread ID", MAX_THREAD_ID_LENGTH);
}

/**
 * Validate user ID format and length
 */
export function validateUserId(value: string): void {
  if (!value || value.length === 0) {
    throw new Error("User ID cannot be empty");
  }
  if (value.length > MAX_USER_ID_LENGTH) {
    throw new Error(`User ID exceeds maximum length of ${MAX_USER_ID_LENGTH} characters`);
  }
}

/**
 * Validate error object field lengths
 */
export function validateError(error: {
  message: string;
  code?: string;
  details?: string;
}): void {
  validateStringLength(error.message, "Error message", MAX_ERROR_MESSAGE_LENGTH);
  if (error.code !== undefined) {
    validateStringLength(error.code, "Error code", MAX_ERROR_CODE_LENGTH);
  }
  if (error.details !== undefined) {
    validateStringLength(error.details, "Error details", MAX_ERROR_DETAILS_LENGTH);
  }
}

/**
 * Sandbox run status validator
 * States: booting -> running -> succeeded/failed/canceled
 */
export const sandboxStatusValidator = v.union(
  v.literal("booting"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled")
);

/** Type inferred from sandboxStatusValidator */
export type SandboxStatus = Infer<typeof sandboxStatusValidator>;

/**
 * Artifact type validator
 * Categorizes artifacts produced by sandbox runs
 */
export const artifactTypeValidator = v.union(
  v.literal("file"),
  v.literal("image"),
  v.literal("code"),
  v.literal("log"),
  v.literal("other")
);

/**
 * Review state validator for HITL workflow
 * pending -> approved/rejected
 */
export const reviewStateValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);

/**
 * Workspace member role validator
 * owner has full control, admin can manage members, member has basic access
 */
export const memberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member")
);

/** Type inferred from memberRoleValidator */
export type MemberRole = Infer<typeof memberRoleValidator>;
