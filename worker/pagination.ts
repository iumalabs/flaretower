// Shared server-side pagination math for GET /inventory routes
// (specs/020-list-pagination) — LIMIT/OFFSET computation, the response
// envelope every paginated route returns alongside its own data, and a
// whitelisted-column sort validator. Kept as plain functions (no D1
// dependency) so every module's routes.ts can reuse this without coupling
// to a specific query shape (research.md §2 — each module's own row-unit
// differs; only the math is shared).

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationEnvelope {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export class PaginationParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaginationParamError";
  }
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Parses raw `page`/`page_size` query string values (or undefined, when the
// caller omitted them) into validated params. Throws PaginationParamError on
// anything out of range rather than silently clamping — consistent with this
// project's existing input-validation convention (e.g. audit/routes.ts's
// `since` handling), so a caller mistake is visible, not quietly wrong.
export function parsePaginationParams(
  rawPage: string | undefined,
  rawPageSize: string | undefined,
): PaginationParams {
  let page = 1;
  if (rawPage !== undefined) {
    page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1) {
      throw new PaginationParamError(`invalid page: ${rawPage}`);
    }
  }

  let pageSize = DEFAULT_PAGE_SIZE;
  if (rawPageSize !== undefined) {
    pageSize = Number(rawPageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new PaginationParamError(`invalid page_size: ${rawPageSize}`);
    }
  }

  return { page, pageSize };
}

// SQL LIMIT/OFFSET for the given (validated) params.
export function toLimitOffset(params: PaginationParams): { limit: number; offset: number } {
  return { limit: params.pageSize, offset: (params.page - 1) * params.pageSize };
}

export function buildEnvelope(params: PaginationParams, total: number): PaginationEnvelope {
  return {
    page: params.page,
    page_size: params.pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

// Validates a client-supplied sort key against a module's own whitelist
// (research.md §3 — an unvalidated key concatenated into ORDER BY is a
// SQL-injection vector, and D1 has no parameterized-identifier mechanism).
// `whitelist` maps the public key a caller may request to whatever that
// module needs to actually sort by — a real D1 column name (string) for the
// D1-backed modules, or an in-memory accessor function for a module like
// Workers dashboard whose rows aren't D1-backed (routes.ts). Returns the
// whitelist's default entry when rawSortKey is undefined; throws on an
// explicitly-supplied, unrecognized key rather than silently falling back.
export function resolveSortColumn<T>(
  rawSortKey: string | undefined,
  whitelist: Record<string, T>,
  defaultKey: string,
): { key: string; column: T } {
  const key = rawSortKey ?? defaultKey;
  const column = whitelist[key];
  if (column === undefined) {
    throw new PaginationParamError(`invalid sort_key: ${key}`);
  }
  return { key, column };
}

export function resolveSortDir(rawSortDir: string | undefined): "ASC" | "DESC" {
  if (rawSortDir === undefined || rawSortDir === "asc") return "ASC";
  if (rawSortDir === "desc") return "DESC";
  throw new PaginationParamError(`invalid sort_dir: ${rawSortDir}`);
}
