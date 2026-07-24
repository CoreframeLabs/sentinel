import { Pool, PoolClient, types } from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings rather than JS Date
// objects: due dates are calendar dates, and Date objects reintroduce
// timezone ambiguity (and break string comparisons against ISO dates).
types.setTypeParser(types.builtins.DATE, (value) => value);

export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

/** Runs a trivial query to prove the database is reachable. Throws if not. */
export async function healthCheck(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export function poolStats(pool: Pool): PoolStats {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Runs fn inside a transaction. Commits on success, rolls back on any error.
 * State changes that touch multiple tables (assignment + control + audit log)
 * must go through this so partial writes can never be observed.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
