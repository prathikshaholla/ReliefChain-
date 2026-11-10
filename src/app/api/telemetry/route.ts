// ============================================================================
// GET  /api/telemetry?window=24|168|720|all - drone aggregation + incident feed
// POST /api/telemetry                       - log a field incident document
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { COLLECTIONS, droneReconPipeline, getMongoDb } from '@/lib/db/mongo';
import { HttpError, ok, oneOf, optPosInt, readJson, reqString, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const CATEGORIES = ['WEATHER_ALERT', 'INFRASTRUCTURE_FAILURE', 'ACCESS_RESTRICTION', 'MEDICAL_EMERGENCY', 'RESCUE_OPERATION', 'OTHER'] as const;

async function db() {
  try {
    return await getMongoDb();
  } catch {
    throw new HttpError(503, 'MongoDB is unreachable. Is `docker compose up -d` running?');
  }
}

export const GET = route(async (req) => {
  requireUser(req);
  const w = new URL(req.url).searchParams.get('window') ?? '168';
  const windowHours = w === 'all' ? null : Number(w) > 0 ? Number(w) : 168;

  const mongo = await db();
  const pipeline = droneReconPipeline(windowHours);

  const [aggregated, incidents, latestDrones, totalDocs] = await Promise.all([
    mongo.collection(COLLECTIONS.drones).aggregate(pipeline).toArray(),
    mongo.collection(COLLECTIONS.incidents).find({}).sort({ created_at: -1 }).limit(15).toArray(),
    mongo.collection(COLLECTIONS.drones).find({}).sort({ timestamp: -1 }).limit(5).toArray(),
    mongo.collection(COLLECTIONS.drones).countDocuments(),
  ]);

  return ok({
    windowHours,
    aggregationPipeline: { stages: pipeline.map((s) => Object.keys(s)[0]), pipeline, data: aggregated },
    incidents,
    latestDrones,
    totalDroneDocuments: totalDocs,
  });
});

export const POST = route(async (req) => {
  const user = requireUser(req, 'reportIncident');
  const body = await readJson(req);

  const doc = {
    event_code: `EVT-${Date.now().toString(36).toUpperCase()}`,
    zone_id: optPosInt(body.zoneId, 'zoneId') ?? 1,
    source: 'FIELD_AGENT_REPORT',
    category: oneOf(body.category, CATEGORIES, 'category'),
    severity: oneOf(body.severity, SEVERITIES, 'severity', 'HIGH'),
    headline: reqString(body.headline, 'headline', 300),
    raw_payload: typeof body.rawPayload === 'object' && body.rawPayload ? body.rawPayload : {},
    reported_by: { user_id: user.userId, name: user.fullName, role: user.role },
    verified: user.role === 'ADMIN',
    created_at: new Date(),
  };

  const mongo = await db();
  const res = await mongo.collection(COLLECTIONS.incidents).insertOne(doc);
  return ok({ insertedId: res.insertedId, incident: doc }, 201);
});
