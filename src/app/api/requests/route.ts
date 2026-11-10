// ============================================================================
// GET  /api/requests?status=&urgency=  - relief requests with network stock
// POST /api/requests                   - raise a new request (ADMIN, FIRST_RESPONDER)
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { query } from '@/lib/db/postgres';
import { ok, oneOf, posInt, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const STATUSES = ['PENDING', 'APPROVED', 'DISPATCHED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED'] as const;
const URGENCIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export const GET = route(async (req) => {
  requireUser(req);
  const params = new URL(req.url).searchParams;

  const filters: string[] = [];
  const values: unknown[] = [];
  const status = params.get('status');
  const urgency = params.get('urgency');
  if (status && status !== 'ALL') {
    values.push(oneOf(status, STATUSES, 'status'));
    filters.push(`rr.status = $${values.length}`);
  }
  if (urgency && urgency !== 'ALL') {
    values.push(oneOf(urgency, URGENCIES, 'urgency'));
    filters.push(`rr.urgency_level = $${values.length}`);
  }

  const res = await query(
    `SELECT rr.id, rr.camp_id, c.name AS camp_name, z.name AS zone_name,
            rr.category_id, rc.code AS resource_code, rc.name AS resource_name, rc.category_group,
            rc.unit_of_measure, rc.weight_kg_per_unit,
            rr.requested_quantity, rr.approved_quantity,
            rr.requested_quantity - rr.approved_quantity AS remaining_quantity,
            rr.urgency_level, rr.status, rr.notes, rr.created_at, rr.fulfilled_at,
            COALESCE(stock.total, 0)::int AS global_stock
     FROM relief_requests rr
     JOIN relief_camps c         ON c.id = rr.camp_id
     JOIN disaster_zones z       ON z.id = c.zone_id
     JOIN resource_categories rc ON rc.id = rr.category_id
     LEFT JOIN (
         SELECT wi.category_id, SUM(wi.available_quantity) AS total
         FROM warehouse_inventory wi JOIN warehouses w ON w.id = wi.warehouse_id
         WHERE w.is_operational
         GROUP BY wi.category_id
     ) stock ON stock.category_id = rr.category_id
     ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
     ORDER BY CASE rr.urgency_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
              rr.created_at DESC`,
    values
  );

  return ok({ requests: res.rows });
});

export const POST = route(async (req) => {
  requireUser(req, 'createRequest');
  const body = await readJson(req);
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null;

  const res = await query(
    `INSERT INTO relief_requests (camp_id, category_id, requested_quantity, urgency_level, status, notes)
     VALUES ($1, $2, $3, $4, 'PENDING', $5)
     RETURNING *`,
    [
      posInt(body.campId, 'campId'),
      posInt(body.categoryId, 'categoryId'),
      posInt(body.requestedQuantity, 'requestedQuantity'),
      oneOf(body.urgencyLevel, URGENCIES, 'urgencyLevel', 'HIGH'),
      notes,
    ]
  );

  return ok({ request: res.rows[0] }, 201);
});
