// ============================================================================
// GET  /api/sos - SOS stream (back-fills any missing embeddings first)
// POST /api/sos - ingest a distress message: embed -> classify -> store vector
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { query } from '@/lib/db/postgres';
import { HttpError, ok, optPosInt, readJson, reqString, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { detectUrgency, ensureSosEmbeddings, generateEmbedding, matchDistressCall, toPgVector } from '@/lib/vector/semantic';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  requireUser(req);
  await ensureSosEmbeddings();

  const res = await query(`
    SELECT sos.id, sos.sender_name, sos.sender_phone, sos.latitude, sos.longitude, sos.victim_count,
           sos.raw_message, sos.detected_urgency, sos.matched_category_id, sos.status, sos.created_at,
           rc.name AS matched_category_name, rc.category_group, z.name AS zone_name
    FROM emergency_sos_signals sos
    LEFT JOIN resource_categories rc ON rc.id = sos.matched_category_id
    LEFT JOIN disaster_zones z       ON z.id = sos.zone_id
    ORDER BY CASE sos.detected_urgency WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
             sos.created_at DESC
  `);

  return ok({ signals: res.rows });
});

export const POST = route(async (req) => {
  requireUser(req, 'submitSos');
  const body = await readJson(req);

  const senderName = reqString(body.senderName, 'senderName', 100);
  const message = reqString(body.message, 'message', 2000);
  const zoneId = optPosInt(body.zoneId, 'zoneId') ?? 1;
  const victimCount = optPosInt(body.victimCount, 'victimCount') ?? 1;
  const senderPhone = typeof body.senderPhone === 'string' && body.senderPhone.trim() ? body.senderPhone.trim().slice(0, 30) : null;

  const embedding = generateEmbedding(message);
  const matches = matchDistressCall(message);
  const urgency = detectUrgency(message, victimCount);

  // Location defaults to the zone centre if the caller has no GPS fix
  const res = await query(
    `INSERT INTO emergency_sos_signals (zone_id, sender_name, sender_phone, latitude, longitude, victim_count,
                                        raw_message, embedding, detected_urgency, matched_category_id)
     SELECT z.id, $2, $3, COALESCE($4, z.latitude), COALESCE($5, z.longitude), $6, $7, $8::vector, $9, $10
     FROM disaster_zones z WHERE z.id = $1
     RETURNING id, zone_id, sender_name, victim_count, raw_message, detected_urgency, matched_category_id, status, created_at`,
    [
      zoneId,
      senderName,
      senderPhone,
      body.latitude ?? null,
      body.longitude ?? null,
      victimCount,
      message,
      toPgVector(embedding),
      urgency,
      matches[0]?.categoryId ?? null,
    ]
  );
  if (res.rowCount === 0) throw new HttpError(400, `Disaster zone ${zoneId} does not exist`);

  return ok(
    {
      signal: res.rows[0],
      semanticAnalysis: {
        detectedUrgency: urgency,
        topMatch: matches[0] ?? null,
        allMatches: matches,
        vectorDimensions: embedding.length,
      },
    },
    201
  );
});
