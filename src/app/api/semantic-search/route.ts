// ============================================================================
// POST /api/semantic-search  { queryText, limit? }
// k-nearest-neighbour search over SOS embeddings with pgvector's cosine
// distance operator (<=>), served by the HNSW index.
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { query } from '@/lib/db/postgres';
import { ok, readJson, reqString, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { ensureSosEmbeddings, generateEmbedding, matchDistressCall, toPgVector } from '@/lib/vector/semantic';

export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  requireUser(req);
  const body = await readJson(req);
  const queryText = reqString(body.queryText, 'queryText', 500);
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20);

  await ensureSosEmbeddings();
  const vector = toPgVector(generateEmbedding(queryText));

  const started = performance.now();
  const res = await query(
    `SELECT sos.id, sos.sender_name, sos.victim_count, sos.raw_message, sos.detected_urgency, sos.status,
            sos.created_at, rc.name AS matched_category_name,
            ROUND((1 - (sos.embedding <=> $1::vector))::numeric, 4) AS cosine_similarity
     FROM emergency_sos_signals sos
     LEFT JOIN resource_categories rc ON rc.id = sos.matched_category_id
     WHERE sos.embedding IS NOT NULL
     ORDER BY sos.embedding <=> $1::vector
     LIMIT $2`,
    [vector, limit]
  );
  const executionTimeMs = Number((performance.now() - started).toFixed(2));

  return ok({
    queryText,
    vectorEngine: {
      dimensions: 384,
      similarityMetric: 'cosine similarity = 1 - cosine distance',
      operator: '<=> (vector_cosine_ops)',
      indexType: 'HNSW',
    },
    executionTimeMs,
    matchedSignals: res.rows,
    recommendedReliefKits: matchDistressCall(queryText),
  });
});
