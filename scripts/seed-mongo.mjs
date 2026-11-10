// ============================================================================
// npm run db:seed-mongo - seed the MongoDB document store.
// Timestamps are relative to "now", so re-run this before a demo to keep the
// 24h aggregation window populated.
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================
import { MongoClient } from 'mongodb';
import { MONGODB_URI } from './load-env.mjs';

const minutesAgo = (m) => new Date(Date.now() - m * 60_000);

// Polymorphic documents: each payload type carries a different sensor shape.
const droneTelemetry = [
  {
    mission_id: 'DRONE-RECON-ALPHA-01', drone_unit: 'DR-01-AERO-99', zone_id: 1, zone_name: 'Coastal Sector Alpha',
    timestamp: minutesAgo(45), payload_status: 'CAM_4K_THERMAL_ACTIVE',
    telemetry: { altitude_meters: 185.4, speed_kmh: 42.0, battery_pct: 78, signal_strength_dbm: -64 },
    survey_results: {
      hazard_score: 8.8, submerged_structures_count: 42,
      road_blockages: [
        { street: 'East Coast Expressway KM 14', severity: 'SEVERE', passable: false, water_depth_cm: 120 },
        { street: 'Marina Loop Bridge', severity: 'MODERATE', passable: true, clearance_height_m: 2.1 },
      ],
      thermal_survivor_detections: [
        { count: 6, rooftop: true, coordinates: [13.0612, 80.2789], heat_signature_confidence: 0.94 },
        { count: 2, rooftop: false, coordinates: [13.072, 80.281], heat_signature_confidence: 0.88 },
      ],
    },
  },
  {
    mission_id: 'DRONE-RECON-ALPHA-02', drone_unit: 'DR-02-AERO-10', zone_id: 1, zone_name: 'Coastal Sector Alpha',
    timestamp: minutesAgo(15), payload_status: 'CAM_4K_THERMAL_ACTIVE',
    telemetry: { altitude_meters: 140.0, speed_kmh: 36.5, battery_pct: 62, signal_strength_dbm: -71 },
    survey_results: {
      hazard_score: 9.4, submerged_structures_count: 67,
      road_blockages: [{ street: 'Old Port Causeway', severity: 'CRITICAL', passable: false, water_depth_cm: 210 }],
      thermal_survivor_detections: [{ count: 12, rooftop: true, coordinates: [13.0911, 80.2941], heat_signature_confidence: 0.97 }],
    },
  },
  {
    mission_id: 'DRONE-RECON-BETA-01', drone_unit: 'DR-03-AERO-05', zone_id: 2, zone_name: 'Cauvery Basin Flood Zone',
    timestamp: minutesAgo(30), payload_status: 'CAM_MULTISPECTRAL',
    telemetry: { altitude_meters: 220.0, speed_kmh: 48.0, battery_pct: 85, signal_strength_dbm: -58 },
    survey_results: {
      hazard_score: 6.5, submerged_structures_count: 18,
      road_blockages: [{ street: 'River Bund South Road', severity: 'MODERATE', passable: false, water_depth_cm: 80 }],
      thermal_survivor_detections: [{ count: 4, rooftop: false, coordinates: [12.9811, 77.589], heat_signature_confidence: 0.91 }],
      multispectral: { flooded_area_sq_km: 14.2, crop_damage_pct: 38 },
    },
  },
  {
    // LiDAR payload: no thermal camera, but slope-stability data instead
    mission_id: 'DRONE-RECON-GAMMA-01', drone_unit: 'DR-04-LIDAR-02', zone_id: 3, zone_name: 'Nilgiri Foothills Landslide Sector',
    timestamp: minutesAgo(90), payload_status: 'LIDAR_SCAN',
    telemetry: { altitude_meters: 310.0, speed_kmh: 28.0, battery_pct: 54, signal_strength_dbm: -77 },
    survey_results: {
      hazard_score: 7.9,
      road_blockages: [
        { street: 'Ghat Road Hairpin 9', severity: 'CRITICAL', passable: false, debris_volume_m3: 900 },
        { street: 'Wayanad Link Road', severity: 'SEVERE', passable: false, debris_volume_m3: 340 },
      ],
      lidar: { slope_displacement_cm: 46, unstable_slopes_detected: 3, point_cloud_density: 'HIGH' },
    },
  },
  {
    // Older than 24 h - only visible when the aggregation window is widened
    mission_id: 'DRONE-RECON-ALPHA-00', drone_unit: 'DR-01-AERO-99', zone_id: 1, zone_name: 'Coastal Sector Alpha',
    timestamp: minutesAgo(60 * 30), payload_status: 'CAM_4K_THERMAL_ACTIVE',
    telemetry: { altitude_meters: 200.0, speed_kmh: 40.0, battery_pct: 91, signal_strength_dbm: -60 },
    survey_results: {
      hazard_score: 6.1, submerged_structures_count: 12, road_blockages: [],
      thermal_survivor_detections: [{ count: 3, rooftop: true, coordinates: [13.05, 80.27], heat_signature_confidence: 0.82 }],
    },
  },
];

const incidents = [
  {
    event_code: 'EVT-CYC-001', zone_id: 1, source: 'COASTAL_RADAR_SATELLITE', category: 'WEATHER_ALERT', severity: 'CRITICAL',
    headline: 'Storm surge elevated by 2.8m above astronomical tide level',
    raw_payload: { wind_gust_knots: 65, wave_height_m: 4.5, tide_anomaly_m: 2.8 }, verified: true, created_at: minutesAgo(60),
  },
  {
    event_code: 'EVT-PWR-002', zone_id: 1, source: 'GRID_SCADA_MONITOR', category: 'INFRASTRUCTURE_FAILURE', severity: 'HIGH',
    headline: 'Substation 33kV feeder tripped - Marina Beach hospital on backup diesel',
    raw_payload: { substation_id: 'SS-MB-33', fuel_reserve_hours: 14.5 }, verified: true, created_at: minutesAgo(40),
  },
  {
    event_code: 'EVT-ROAD-003', zone_id: 2, source: 'FIELD_OFFICER_RADIO', category: 'ACCESS_RESTRICTION', severity: 'MEDIUM',
    headline: 'Cauvery diversion channel breached; light trucks rerouted via Bypass 7',
    raw_payload: { officer_id: 'POL-302', detour_distance_km: 11.2 }, verified: true, created_at: minutesAgo(20),
  },
  {
    event_code: 'EVT-SLIDE-004', zone_id: 3, source: 'SEISMIC_SENSOR_NETWORK', category: 'WEATHER_ALERT', severity: 'HIGH',
    headline: 'Ground-movement sensors report renewed slope creep above Wayanad Ridge',
    raw_payload: { sensor_ids: ['GS-11', 'GS-14'], creep_mm_per_hour: 3.2 }, verified: false, created_at: minutesAgo(10),
  },
];

const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const db = client.db();

  const drones = db.collection('drone_recon_telemetry');
  await drones.deleteMany({});
  await drones.insertMany(droneTelemetry);
  await drones.createIndex({ zone_id: 1, timestamp: -1 });
  await drones.createIndex({ 'survey_results.hazard_score': -1 });
  console.log(`Seeded ${droneTelemetry.length} drone telemetry documents.`);

  const feed = db.collection('incident_event_feed');
  await feed.deleteMany({});
  await feed.insertMany(incidents);
  await feed.createIndex({ zone_id: 1, severity: 1 });
  await feed.createIndex({ created_at: -1 });
  console.log(`Seeded ${incidents.length} incident feed documents.`);

  console.log(`\nMongoDB ready (database: ${db.databaseName}).`);
} catch (err) {
  console.error('MongoDB seed FAILED:', err.message);
  console.error('Is the database running?  ->  docker compose up -d');
  process.exitCode = 1;
} finally {
  await client.close();
}
