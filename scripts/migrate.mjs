import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect().catch(() => { throw new Error('Database connection failed; credentials withheld'); });
try {
  await client.query('SELECT pg_advisory_lock(726501)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir('migrations')).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
    if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rows.length) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(`migrations/${name}`, 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      await client.query('COMMIT');
      console.log('Applied', name);
    } catch { await client.query('ROLLBACK'); throw new Error('Migration failed; database details withheld'); }
  }
} catch { console.error('Migration failed; check database access and migration SQL.'); process.exitCode = 1; }
finally { await client.query('SELECT pg_advisory_unlock(726501)').catch(()=>{}); client.release(); await pool.end(); }
