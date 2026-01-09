import { PaginationResult } from "convex/server";

/**
 * Empty pagination result for unauthorized access or empty queries.
 * Returns a valid PaginationResult structure with no items.
 *
 * Use this when a user is not authorized to view paginated data.
 * The result signals "no results, pagination complete" to the client.
 *
 * @example
 * if (membership === null) {
 *   return emptyPaginationResult<Doc<"sandboxRuns">>();
 * }
 */
export function emptyPaginationResult<T>(): PaginationResult<T> {
  return { page: [], continueCursor: "", isDone: true };
}
