// ============================================================================
// GET  /api/sql-lab - preset syllabus queries
// POST /api/sql-lab - execute one read-only statement (ADMIN)
//
// Safety model (defence in depth):
//   1. only statements starting with SELECT / WITH / EXPLAIN / SHOW / TABLE / VALUES
//   2. extended query protocol  -> Postgres rejects multiple statements
//   3. BEGIN READ ONLY ... ROLLBACK -> any write raises SQLSTATE 25006
//   4. statement_timeout 5 s, and at most 500 rows are returned
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import type { QueryResult } from 'pg';
import { withTransaction } from '@/lib/db/postgres';
import { HttpError, ok, readJson, reqString, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { ensureSosEmbeddings } from '@/lib/vector/semantic';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

const PRESETS = [
  {
    id: 'join',
    category: 'Joins',
    title: 'Multi-table INNER + LEFT JOIN',
    description: 'Open requests with zone, camp, item and dispatch tracking code',
    sql: `SELECT z.name AS zone_name, z.disaster_type, c.name AS camp_name,
       rc.name AS requested_item, rr.requested_quantity, rr.urgency_level,
       COALESCE(ds.tracking_code, 'NOT_DISPATCHED') AS tracking_code
FROM relief_requests rr
INNER JOIN relief_camps c         ON rr.camp_id = c.id
INNER JOIN disaster_zones z       ON c.zone_id = z.id
INNER JOIN resource_categories rc ON rr.category_id = rc.id
LEFT JOIN dispatch_shipments ds   ON rr.id = ds.request_id
ORDER BY CASE rr.urgency_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END, rr.created_at;`,
  },
  {
    id: 'group_by_having',
    category: 'Aggregation',
    title: 'GROUP BY + HAVING',
    description: 'Camps whose outstanding deficit exceeds 300 units',
    sql: `SELECT c.name AS camp_name, z.name AS disaster_zone,
       COUNT(rr.id)                AS total_requests,
       SUM(rr.requested_quantity)  AS units_demanded,
       SUM(rr.approved_quantity)   AS units_allocated,
       SUM(rr.requested_quantity) - SUM(rr.approved_quantity) AS outstanding_deficit,
       ROUND(AVG(rr.requested_quantity), 2) AS avg_request_size
FROM relief_camps c
JOIN disaster_zones z   ON c.zone_id = z.id
JOIN relief_requests rr ON c.id = rr.camp_id
WHERE rr.status <> 'REJECTED'
GROUP BY c.id, c.name, z.name
HAVING SUM(rr.requested_quantity) - SUM(rr.approved_quantity) > 300
ORDER BY outstanding_deficit DESC;`,
  },
  {
    id: 'scalar_subquery',
    category: 'Subqueries',
    title: 'Scalar subquery',
    description: 'Depots holding more than the average medical stock',
    sql: `SELECT w.name AS warehouse_name, rc.name AS resource_name, wi.available_quantity
FROM warehouse_inventory wi
JOIN warehouses w           ON wi.warehouse_id = w.id
JOIN resource_categories rc ON wi.category_id = rc.id
WHERE rc.category_group = 'MEDICAL'
  AND wi.available_quantity > (
        SELECT AVG(wi2.available_quantity)
        FROM warehouse_inventory wi2
        JOIN resource_categories rc2 ON wi2.category_id = rc2.id
        WHERE rc2.category_group = 'MEDICAL')
ORDER BY wi.available_quantity DESC;`,
  },
  {
    id: 'correlated_subquery',
    category: 'Subqueries',
    title: 'Correlated subquery (NOT EXISTS)',
    description: 'Operational camps with no shipment currently on the road',
    sql: `SELECT c.id, c.name AS vulnerable_camp, c.current_occupancy, c.capacity, z.name AS zone_name
FROM relief_camps c
JOIN disaster_zones z ON c.zone_id = z.id
WHERE c.status = 'OPERATIONAL'
  AND NOT EXISTS (
        SELECT 1
        FROM relief_requests rr
        JOIN dispatch_shipments ds ON rr.id = ds.request_id
        WHERE rr.camp_id = c.id
          AND ds.delivery_status IN ('PREPARING', 'DISPATCHED', 'IN_TRANSIT'));`,
  },
  {
    id: 'window',
    category: 'Window functions',
    title: 'RANK() OVER (PARTITION BY)',
    description: 'Rank depots by stock within each resource category',
    sql: `SELECT rc.name AS resource_name, w.name AS warehouse_name, wi.available_quantity,
       RANK() OVER (PARTITION BY wi.category_id ORDER BY wi.available_quantity DESC) AS stock_rank
FROM warehouse_inventory wi
JOIN warehouses w           ON w.id = wi.warehouse_id
JOIN resource_categories rc ON rc.id = wi.category_id
ORDER BY rc.name, stock_rank;`,
  },
  {
    id: 'fn_haversine',
    category: 'Stored functions',
    title: 'Haversine nearest-warehouse function',
    description: 'fn_find_nearest_warehouse_with_stock(camp_id, category_id, qty)',
    sql: `SELECT * FROM fn_find_nearest_warehouse_with_stock(1, 1, 100);`,
  },
  {
    id: 'fn_urgency',
    category: 'Stored functions',
    title: 'Camp urgency score function',
    description: 'fn_calculate_camp_urgency_score(camp_id) for every camp',
    sql: `SELECT id, name, current_occupancy, capacity,
       fn_calculate_camp_urgency_score(id) AS urgency_score
FROM relief_camps
ORDER BY urgency_score DESC;`,
  },
  {
    id: 'view_dashboard',
    category: 'Views',
    title: 'View: v_active_disaster_dashboard',
    description: 'Per-zone rollup of camps, occupancy, requests and SOS',
    sql: `SELECT * FROM v_active_disaster_dashboard ORDER BY severity_rank;`,
  },
  {
    id: 'view_deficit',
    category: 'Views',
    title: 'View: v_camp_deficit_matrix',
    description: 'Requested vs allocated vs in transit vs delivered',
    sql: `SELECT camp_name, resource_name, total_requested, total_approved, in_transit, total_delivered, unfulfilled_deficit
FROM v_camp_deficit_matrix
ORDER BY unfulfilled_deficit DESC;`,
  },
  {
    id: 'vector_knn',
    category: 'Vector (pgvector)',
    title: 'pgvector cosine nearest neighbours',
    description: 'SOS messages most similar to SOS #1 using the <=> operator',
    sql: `SELECT b.id, b.sender_name, b.raw_message,
       ROUND((1 - (a.embedding <=> b.embedding))::numeric, 4) AS cosine_similarity
FROM emergency_sos_signals a
JOIN emergency_sos_signals b ON b.id <> a.id
WHERE a.id = 1
ORDER BY a.embedding <=> b.embedding
LIMIT 3;`,
  },
  {
    id: 'jsonb_audit',
    category: 'JSONB',
    title: 'JSONB audit trail',
    description: 'Extract fields from the audit log JSONB documents',
    sql: `SELECT a.timestamp, a.action_type, u.full_name AS performed_by,
       a.new_state ->> 'tracking_code'   AS tracking_code,
       a.new_state ->> 'allocated_qty'   AS allocated_qty,
       a.new_state ->> 'delivery_status' AS delivery_status
FROM allocation_audit_log a
LEFT JOIN users u ON u.id = a.performed_by
WHERE a.entity_name = 'dispatch_shipments'
ORDER BY a.timestamp DESC;`,
  },
  {
    id: 'explain',
    category: 'Query plans',
    title: 'EXPLAIN ANALYZE',
    description: 'Execution plan for the urgent-request view',
    sql: `EXPLAIN ANALYZE SELECT * FROM v_urgent_unfulfilled_requests WHERE urgency_level = 'CRITICAL';`,
  },
];

export const GET = route(async (req) => {
  requireUser(req);
  return ok({ presets: PRESETS });
});

export const POST = route(async (req) => {
  requireUser(req, 'sqlLab');
  const body = await readJson(req);
  const sql = reqString(body.sql, 'sql', 10_000).replace(/;\s*$/, '');

  if (!/^(SELECT|WITH|EXPLAIN|SHOW|TABLE|VALUES)\b/i.test(sql.replace(/^(\s|--[^\n]*\n)+/, ''))) {
    throw new HttpError(403, 'SQL Lab only runs read-only statements (SELECT, WITH, EXPLAIN, SHOW, TABLE, VALUES).');
  }

  await ensureSosEmbeddings(); // vector presets need embeddings present

  const started = performance.now();
  const result = await withTransaction<QueryResult>(
    // queryMode 'extended' isn't in @types/pg yet, hence the cast
    (db) => db.query({ text: sql, queryMode: 'extended' } as unknown as string),
    { readOnly: true, statementTimeoutMs: 5000 }
  );
  const executionTimeMs = Number((performance.now() - started).toFixed(2));

  const rows = result.rows.slice(0, MAX_ROWS);
  return ok({
    rowCount: result.rowCount ?? result.rows.length,
    truncated: result.rows.length > MAX_ROWS,
    fields: result.fields.map((f) => f.name),
    rows,
    executionTimeMs,
  });
});
