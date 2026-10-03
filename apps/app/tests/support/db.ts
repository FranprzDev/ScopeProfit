import { Pool } from 'pg';
import { databaseUrl } from './env';

let pool: Pool | undefined;

export async function query(text: string, params: unknown[] = []): Promise<void> {
  pool ??= new Pool({ connectionString: databaseUrl(), max: 2 });
  await pool.query(text, params);
}

export async function closeDatabase(): Promise<void> {
  if (!pool) return;
  const active = pool;
  pool = undefined;
  await active.end();
}
