// ============================================================================
// ReliefChain - PostgreSQL connection pool & transaction helper
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://relief_admin:relief_secret_password@localhost:5432/reliefchain_db';

// One pool per server process. In dev, Next.js hot-reloads modules, so the
// pool is cached on globalThis to avoid leaking connections on every edit.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const pool: Pool =
  globalThis.__pgPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== 'production') globalThis.__pgPool = pool;

/** Run a single parameterised statement on the pool. */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}

/**
 * Run `fn` inside BEGIN ... COMMIT on a dedicated connection.
 * Any thrown error rolls the whole transaction back.
 *
 * `userId` is exposed to triggers through the transaction-local setting
 * `app.user_id` (read in SQL by fn_current_app_user()), so audit rows record
 * who performed the change.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  opts: { userId?: number; readOnly?: boolean; statementTimeoutMs?: number } = {}
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(opts.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    if (opts.userId) {
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [String(opts.userId)]);
    }
    if (opts.statementTimeoutMs) {
      await client.query(`SELECT set_config('statement_timeout', $1, true)`, [String(opts.statementTimeoutMs)]);
    }
    const result = await fn(client);
    await client.query(opts.readOnly ? 'ROLLBACK' : 'COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
