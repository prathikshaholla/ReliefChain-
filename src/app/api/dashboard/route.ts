// ============================================================================
// GET /api/dashboard - war-room KPIs, zone rollups, critical demand, audit trail
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { query } from '@/lib/db/postgres';
import { ok, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  requireUser(req);

  const [zones, metrics, audit, critical] = await Promise.all([
    query(`SELECT * FROM v_active_disaster_dashboard ORDER BY severity_rank, zone_id`),

    query(`
      SELECT
        (SELECT COUNT(*) FROM disaster_zones WHERE status = 'ACTIVE')::int                                   AS active_zones,
        (SELECT COUNT(*) FROM relief_camps WHERE status = 'OPERATIONAL')::int                                AS operational_camps,
        (SELECT COALESCE(SUM(current_occupancy), 0) FROM relief_camps)::int                                  AS total_displaced_sheltered,
        (SELECT COALESCE(SUM(available_quantity), 0) FROM warehouse_inventory)::int                          AS global_stock_units,
        (SELECT COUNT(*) FROM vehicle_fleet WHERE status = 'AVAILABLE')::int                                 AS available_vehicles,
        (SELECT COUNT(*) FROM dispatch_shipments WHERE delivery_status IN ('PREPARING','DISPATCHED','IN_TRANSIT'))::int AS active_missions,
        (SELECT COUNT(*) FROM emergency_sos_signals WHERE status = 'UNRESOLVED')::int                        AS unresolved_sos,
        (SELECT COUNT(*) FROM relief_requests WHERE status IN ('PENDING','APPROVED','PARTIALLY_FULFILLED'))::int AS open_requests
    `),

    query(`
      SELECT a.id, a.entity_name, a.entity_id, a.action_type, a.old_state, a.new_state, a.timestamp,
             u.full_name AS performed_by_name
      FROM allocation_audit_log a
      LEFT JOIN users u ON u.id = a.performed_by
      ORDER BY a.timestamp DESC, a.id DESC
      LIMIT 10
    `),

    query(`
      SELECT rr.id, rr.requested_quantity, rr.approved_quantity, rr.urgency_level, rr.status, rr.created_at,
             c.name AS camp_name, rc.name AS resource_name, z.name AS zone_name
      FROM relief_requests rr
      JOIN relief_camps c         ON c.id = rr.camp_id
      JOIN disaster_zones z       ON z.id = c.zone_id
      JOIN resource_categories rc ON rc.id = rr.category_id
      WHERE rr.status IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED')
      ORDER BY CASE rr.urgency_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
               rr.created_at
      LIMIT 6
    `),
  ]);

  return ok({
    metrics: metrics.rows[0],
    disasterZones: zones.rows,
    recentAudit: audit.rows,
    criticalRequests: critical.rows,
    timestamp: new Date().toISOString(),
  });
});
