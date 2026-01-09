import { v } from "convex/values";

/**
 * Shared validators for Convex schema and mutations
 * Single source of truth for enum-like values
 */

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
