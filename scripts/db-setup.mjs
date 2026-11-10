// ============================================================================
// npm run db:setup - (re)build the PostgreSQL schema and seed data.
// Runs every top-level sql/NN_*.sql file in order. Safe to re-run: 01_schema
// drops and recreates all tables. Works without psql installed.
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { DATABASE_URL, ROOT } from './load-env.mjs';

const sqlDir = path.join(ROOT, 'sql');
const files = readdirSync(sqlDir).filter((f) => /^\d{2}_.*\.sql$/.test(f)).sort();

const client = new pg.Client({ connectionString: DATABASE_URL });
try {
  await client.connect();
  for (const file of files) {
    process.stdout.write(`  running ${file} ... `);
    await client.query(readFileSync(path.join(sqlDir, file), 'utf8'));
    console.log('ok');
  }
  console.log(`\nPostgreSQL ready (${files.length} scripts applied).`);
} catch (err) {
  console.error('\nFAILED:', err.message);
  if (err.code === 'ECONNREFUSED') console.error('Is the database running?  ->  docker compose up -d');
  process.exitCode = 1;
} finally {
  await client.end();
}
