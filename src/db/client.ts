import { Pool, PoolClient, QueryResult } from 'pg';

import { config } from '../config/index.js';
import { DatabaseError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,

  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug({
      query: text.substring(0, 100),
      params: params?.length,
      rows: result.rowCount,
      duration,
    }, 'Query executed');

    return result;
  } catch (error) {
    logger.error({ error, query: text }, 'Database query failed');
    throw new DatabaseError('Database query failed', {
      query: text.substring(0, 100),
    });
  }
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  logger.info('Closing database connection pool');
  await pool.end();
}

export default {
  query,
  queryOne,
  getClient,
  withTransaction,
  isDatabaseHealthy,
  closePool,
};
