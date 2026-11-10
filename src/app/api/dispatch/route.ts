// ============================================================================
// GET  /api/dispatch[?requestId=]  - fleet, shipments, and (optionally) the
//                                    Haversine-ranked depots for one request
// POST /api/dispatch               - run the ACID stored procedure
//                                    sp_process_resource_dispatch (ADMIN, LOGISTICS_STAFF)
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { query, withTransaction } from '@/lib/db/postgres';
import { HttpError, ok, optPosInt, posInt, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  requireUser(req);
  const requestId = optPosInt(new URL(req.url).searchParams.get('requestId'), 'requestId');

  const [fleet, shipments] = await Promise.all([
    query(`SELECT * FROM v_fleet_readiness ORDER BY vehicle_id`),
    query(`
      SELECT ds.id, ds.tracking_code, ds.request_id, ds.delivery_status, ds.departure_time,
             ds.estimated_arrival, ds.actual_arrival, ds.route_distance_km,
             w.name AS warehouse_name, c.name AS destination_camp,
             vf.vehicle_number, vf.vehicle_type, u.full_name AS dispatched_by_name,
             rc.name AS item_name, di.quantity_loaded, rc.unit_of_measure
      FROM dispatch_shipments ds
      JOIN warehouses w           ON w.id = ds.warehouse_id
      JOIN relief_requests rr     ON rr.id = ds.request_id
      JOIN relief_camps c         ON c.id = rr.camp_id
      JOIN vehicle_fleet vf       ON vf.id = ds.vehicle_id
      JOIN dispatch_items di      ON di.shipment_id = ds.id
      JOIN resource_categories rc ON rc.id = di.category_id
      LEFT JOIN users u           ON u.id = ds.dispatched_by
      ORDER BY CASE WHEN ds.delivery_status IN ('DELIVERED', 'FAILED') THEN 1 ELSE 0 END,
               ds.departure_time DESC
    `),
  ]);

  // Depots that hold any stock of the requested item, nearest first
  let nearestWarehouses: unknown[] = [];
  if (requestId) {
    const r = await query(`SELECT camp_id, category_id FROM relief_requests WHERE id = $1`, [requestId]);
    if (r.rowCount === 0) throw new HttpError(404, `Relief request ${requestId} not found`);
    const nearest = await query(`SELECT * FROM fn_find_nearest_warehouse_with_stock($1, $2, 1)`, [
      r.rows[0].camp_id,
      r.rows[0].category_id,
    ]);
    nearestWarehouses = nearest.rows;
  }

  return ok({ fleet: fleet.rows, shipments: shipments.rows, nearestWarehouses });
});

export const POST = route(async (req) => {
  const user = requireUser(req, 'dispatch');
  const body = await readJson(req);

  const result = await withTransaction(
    async (db) => {
      const proc = await db.query<{ p_tracking_code: string }>(
        `CALL sp_process_resource_dispatch($1, $2, $3, $4, $5, NULL)`,
        [
          posInt(body.requestId, 'requestId'),
          posInt(body.warehouseId, 'warehouseId'),
          posInt(body.vehicleId, 'vehicleId'),
          posInt(body.allocatedQty, 'allocatedQty'),
          user.userId,
        ]
      );
      const trackingCode = proc.rows[0].p_tracking_code;
      const shipment = await db.query(
        `SELECT id, tracking_code, route_distance_km, estimated_arrival FROM dispatch_shipments WHERE tracking_code = $1`,
        [trackingCode]
      );
      return shipment.rows[0];
    },
    { userId: user.userId }
  );

  return ok(
    {
      message: 'Dispatch committed atomically by sp_process_resource_dispatch',
      trackingCode: result.tracking_code,
      shipment: result,
    },
    201
  );
});
