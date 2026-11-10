// ============================================================================
// ReliefChain - MongoDB client & aggregation pipelines (NoSQL document store)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { MongoClient, Db, Document } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/reliefchain_logs';

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

// Connect lazily so a MongoDB outage only affects the telemetry endpoints,
// never the PostgreSQL-backed parts of the app.
function getClient(): Promise<MongoClient> {
  if (!globalThis.__mongoClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    globalThis.__mongoClientPromise = client.connect().catch((err) => {
      globalThis.__mongoClientPromise = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return globalThis.__mongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  return (await getClient()).db(); // database name comes from the URI
}

export const COLLECTIONS = {
  drones: 'drone_recon_telemetry',
  incidents: 'incident_event_feed',
} as const;

/**
 * 4-stage aggregation pipeline over drone reconnaissance documents:
 *   $match  - missions flown inside the time window
 *   $group  - roll up per disaster zone
 *   $project- derive averages and rounded metrics
 *   $sort   - most hazardous zone first
 * Sensor arrays are optional per document (polymorphic payloads), hence $ifNull.
 */
export function droneReconPipeline(windowHours: number | null): Document[] {
  const match: Document = windowHours ? { timestamp: { $gte: new Date(Date.now() - windowHours * 3_600_000) } } : {};
  return [
    { $match: match },
    {
      $group: {
        _id: '$zone_id',
        zone_name: { $first: '$zone_name' },
        total_missions: { $sum: 1 },
        avg_hazard_score: { $avg: '$survey_results.hazard_score' },
        max_hazard_score: { $max: '$survey_results.hazard_score' },
        total_submerged_structures: { $sum: { $ifNull: ['$survey_results.submerged_structures_count', 0] } },
        blockage_count: { $sum: { $size: { $ifNull: ['$survey_results.road_blockages', []] } } },
        impassable_roads: {
          $sum: {
            $size: {
              $filter: {
                input: { $ifNull: ['$survey_results.road_blockages', []] },
                cond: { $eq: ['$$this.passable', false] },
              },
            },
          },
        },
        total_thermal_survivors: { $sum: { $sum: { $ifNull: ['$survey_results.thermal_survivor_detections.count', []] } } },
        avg_battery_pct: { $avg: '$telemetry.battery_pct' },
        latest_flight: { $max: '$timestamp' },
      },
    },
    {
      $project: {
        _id: 0,
        zone_id: '$_id',
        zone_name: 1,
        total_missions: 1,
        avg_hazard_score: { $round: ['$avg_hazard_score', 2] },
        max_hazard_score: 1,
        total_submerged_structures: 1,
        blockage_count: 1,
        impassable_roads: 1,
        total_thermal_survivors: 1,
        avg_battery_pct: { $round: ['$avg_battery_pct', 0] },
        latest_flight: 1,
      },
    },
    { $sort: { avg_hazard_score: -1 } },
  ];
}

export async function getDroneReconAggregation(windowHours: number | null) {
  const db = await getMongoDb();
  return db.collection(COLLECTIONS.drones).aggregate(droneReconPipeline(windowHours)).toArray();
}
