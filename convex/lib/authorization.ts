import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Shared authorization helpers for Convex functions
 *
 * These helpers provide consistent authorization checks across mutations and queries,
 * using proper TypeScript types and efficient index-based lookups.
 */

/** Role type for workspace members */
export type MemberRole = "owner" | "admin" | "member";

/** Context type that includes both query and mutation contexts */
type AuthContext = QueryCtx | MutationCtx;

/**
 * Get the current user's membership in a workspace
 *
 * Uses the by_workspace_user composite index for O(1) lookup.
 *
 * @param ctx - Convex query or mutation context
 * @param workspaceId - The workspace to check membership for
 * @returns The membership document or null if not a member
 */
export async function getUserMembership(
  ctx: AuthContext,
  workspaceId: Id<"workspaces">
): Promise<Doc<"workspaceMembers"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return null;
  }

  // Use composite index for efficient O(1) lookup
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", identity.subject)
    )
    .first();

  return membership;
}

/**
 * Require workspace membership, optionally with specific roles
 *
 * Throws an error if the user is not authenticated, not a member,
 * or doesn't have one of the required roles.
 *
 * @param ctx - Convex query or mutation context
 * @param workspaceId - The workspace to check membership for
 * @param requiredRoles - Optional array of roles that are allowed (defaults to any role)
 * @returns The membership document
 * @throws Error if not authorized
 */
export async function requireWorkspaceMembership(
  ctx: AuthContext,
  workspaceId: Id<"workspaces">,
  requiredRoles?: MemberRole[]
): Promise<Doc<"workspaceMembers">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Unauthenticated: must be logged in");
  }

  const membership = await getUserMembership(ctx, workspaceId);
  if (membership === null) {
    throw new Error("Unauthorized: not a member of this workspace");
  }

  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(membership.role as MemberRole)) {
      throw new Error(
        `Unauthorized: requires one of these roles: ${requiredRoles.join(", ")}`
      );
    }
  }

  return membership;
}

/**
 * Result type for getSandboxRunAccess
 */
export interface SandboxRunAccess {
  sandboxRun: Doc<"sandboxRuns">;
  membership: Doc<"workspaceMembers">;
}

/**
 * Get sandbox run with authorization check
 *
 * Returns the sandbox run and membership if the user has access,
 * or null if the run doesn't exist or user doesn't have access.
 *
 * @param ctx - Convex query or mutation context
 * @param sandboxRunId - The sandbox run to get access for
 * @returns The sandbox run and membership, or null
 */
export async function getSandboxRunAccess(
  ctx: AuthContext,
  sandboxRunId: Id<"sandboxRuns">
): Promise<SandboxRunAccess | null> {
  const sandboxRun = await ctx.db.get(sandboxRunId);
  if (sandboxRun === null) {
    return null;
  }

  const membership = await getUserMembership(ctx, sandboxRun.workspaceId);
  if (membership === null) {
    return null;
  }

  return { sandboxRun, membership };
}

/**
 * Result type for getArtifactAccess
 */
export interface ArtifactAccess {
  artifact: Doc<"artifacts">;
  sandboxRun: Doc<"sandboxRuns">;
  membership: Doc<"workspaceMembers">;
}

/**
 * Get artifact with authorization check
 *
 * Returns the artifact, its associated sandbox run, and membership if the user has access,
 * or null if the artifact doesn't exist, the sandbox run doesn't exist,
 * or user doesn't have access.
 *
 * @param ctx - Convex query or mutation context
 * @param artifactId - The artifact to get access for
 * @returns The artifact, sandbox run, and membership, or null
 */
export async function getArtifactAccess(
  ctx: AuthContext,
  artifactId: Id<"artifacts">
): Promise<ArtifactAccess | null> {
  const artifact = await ctx.db.get(artifactId);
  if (artifact === null) {
    return null;
  }

  const sandboxRun = await ctx.db.get(artifact.sandboxRunId);
  if (sandboxRun === null) {
    return null;
  }

  const membership = await getUserMembership(ctx, sandboxRun.workspaceId);
  if (membership === null) {
    return null;
  }

  return { artifact, sandboxRun, membership };
}
