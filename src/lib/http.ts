// ============================================================================
// ReliefChain - shared helpers for API route handlers
// Owner: Member 1 (Database Architect & Core Backend)
//
// Every route follows the same shape:
//   export const GET = route(async (req) => { ...; return ok({...}); });
// Thrown HttpErrors become clean JSON responses; PostgreSQL errors raised by
// our own procedures/triggers/constraints are mapped to 400/409 instead of 500.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: string) {
    super(message);
  }
}

export function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

// SQLSTATE codes we expect from business rules
const PG_CLIENT_ERRORS: Record<string, number> = {
  P0001: 400, // RAISE EXCEPTION inside a procedure/trigger
  '23505': 409, // unique_violation
  '23503': 400, // foreign_key_violation
  '23514': 400, // check_violation
  '23502': 400, // not_null_violation
  '22P02': 400, // invalid_text_representation (bad number etc.)
  '42601': 400, // syntax_error (SQL Lab)
  '42703': 400, // undefined_column (SQL Lab)
  '42P01': 400, // undefined_table (SQL Lab)
  '42883': 400, // undefined_function (SQL Lab)
  '25006': 403, // read_only_sql_transaction (SQL Lab write attempt)
  '57014': 408, // query_canceled (statement_timeout)
};

function toResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ success: false, error: err.message, details: err.details }, { status: err.status });
  }
  const e = err as { code?: string; message?: string };
  if (e?.code && PG_CLIENT_ERRORS[e.code]) {
    return NextResponse.json(
      { success: false, error: e.message ?? 'Database rule violated', code: e.code },
      { status: PG_CLIENT_ERRORS[e.code] }
    );
  }
  if (e?.code === 'ECONNREFUSED' || e?.code === 'ENOTFOUND') {
    return NextResponse.json(
      { success: false, error: 'Database is unreachable. Is `docker compose up -d` running?' },
      { status: 503 }
    );
  }
  console.error('[api] unexpected error:', err);
  return NextResponse.json({ success: false, error: 'Internal server error', details: e?.message }, { status: 500 });
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wrap a route handler with uniform error handling. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toResponse(err);
    }
  };
}

/** Parse the JSON body, failing with 400 instead of a 500 on bad input. */
export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

/** Positive integer or a 400 error naming the field. */
export function posInt(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${field} must be a positive integer`);
  return n;
}

/** Like posInt but returns undefined for null/undefined/''. */
export function optPosInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return posInt(value, field);
}

/** Non-empty trimmed string or a 400 error. */
export function reqString(value: unknown, field: string, maxLen = 2000): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} is required`);
  const s = value.trim();
  if (s.length > maxLen) throw new HttpError(400, `${field} must be at most ${maxLen} characters`);
  return s;
}

/** Value must be one of the allowed options (mirrors the SQL CHECK lists). */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback) return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`);
}
