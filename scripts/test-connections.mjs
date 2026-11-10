// ============================================================================
// npm run test:connections - check both databases are reachable and seeded.
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { DATABASE_URL, MONGODB_URI } from './load-env.mjs';

let failed = false;

try {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(`
    SELECT current_database() AS db,
           (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector,
           (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')::int AS tables,
           (SELECT COUNT(*) FROM information_schema.views  WHERE table_schema = 'public')::int AS views,
           (SELECT COUNT(*) FROM users)::int AS users`);
  console.log('PostgreSQL OK  ', rows[0]);
  await client.end();
} catch (err) {
  failed = true;
  console.error('PostgreSQL FAIL', err.message);
}

try {
  const mongo = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  await mongo.connect();
  const db = mongo.db();
  const collections = await db.listCollections().toArray();
  const counts = {};
  for (const c of collections) counts[c.name] = await db.collection(c.name).countDocuments();
  console.log('MongoDB OK     ', { db: db.databaseName, collections: counts });
  await mongo.close();
} catch (err) {
  failed = true;
  console.error('MongoDB FAIL   ', err.message);
}

if (failed) {
  console.error('\nStart the databases with:  docker compose up -d');
  process.exit(1);
}
console.log('\nAll databases online.');
