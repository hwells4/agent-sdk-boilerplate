/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type { Id } from "./dataModel";

// Type definitions for internal mutations
type SandboxRunsInternalCreate = FunctionReference<
  "mutation",
  "internal",
  {
    threadId: string;
    workspaceId: Id<"workspaces">;
    createdBy: string;
    maxDurationMs?: number;
    idleTimeoutMs?: number;
  },
  Id<"sandboxRuns">
>;

type SandboxRunsInternalUpdate = FunctionReference<
  "mutation",
  "internal",
  {
    sandboxRunId: Id<"sandboxRuns">;
    sandboxId?: string;
    status?: "booting" | "running" | "succeeded" | "failed" | "canceled";
    finishedAt?: number;
    lastActivityAt?: number;
    e2bCost?: number;
    error?: {
      message: string;
      code?: string;
      details?: string;
    };
  },
  void
>;

// Type definition for internal query to find idle sandboxes
type SandboxRunsInternalFindIdle = FunctionReference<
  "query",
  "internal",
  {
    maxIdleMs: number;
  },
  Array<{
    _id: Id<"sandboxRuns">;
    _creationTime: number;
    threadId: string;
    workspaceId: Id<"workspaces">;
    createdBy: string;
    sandboxId?: string;
    status: "booting" | "running" | "succeeded" | "failed" | "canceled";
    startedAt: number;
    finishedAt?: number;
    lastActivityAt: number;
    maxDurationMs?: number;
    idleTimeoutMs?: number;
    e2bCost?: number;
    error?: {
      message: string;
      code?: string;
      details?: string;
    };
  }>
>;

// Type definition for killIdleSandboxes action
type KillIdleSandboxesAction = FunctionReference<
  "action",
  "internal",
  {},
  { killed: number; errors: number }
>;

declare const fullApi: ApiFromModules<{}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  sandboxRuns: {
    internalCreate: SandboxRunsInternalCreate;
    internalUpdate: SandboxRunsInternalUpdate;
    internalFindIdle: SandboxRunsInternalFindIdle;
  };
  actions: {
    killIdleSandboxes: {
      killIdleSandboxes: KillIdleSandboxesAction;
    };
  };
} & FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {};
