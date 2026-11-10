// Minimal .env.local / .env loader for the Node scripts (Next.js loads these itself).
// Owner: Member 1 (Database Architect & Core Backend)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const file of ['.env.local', '.env']) {
  const full = path.join(root, file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const ROOT = root;
export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://relief_admin:relief_secret_password@localhost:5432/reliefchain_db';
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reliefchain_logs';
