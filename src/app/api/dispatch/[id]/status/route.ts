// ============================================================================
// POST /api/dispatch/:id/status   body: { "status": "DELIVERED" | "FAILED" }
//
// Only updates dispatch_shipments.delivery_status. Everything else is done by
// the database:
//   trg_shipment_transition (BEFORE) - blocks changes to closed shipments,
//                                      stamps actual_arrival
//   trg_shipment_delivery   (AFTER)  - frees the vehicle, settles reserved
//                                      stock, updates the request, audits
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { withTransaction } from '@/lib/db/postgres';
import { HttpError, ok, oneOf, posInt, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const shipmentId = posInt((await params).id, 'shipment id');
  const body = await readJson(req);
  const status = oneOf(body.status, ['DELIVERED', 'FAILED'] as const, 'status');
  const user = requireUser(req, status === 'DELIVERED' ? 'confirmDelivery' : 'failShipment');

  const shipment = await withTransaction(
    async (db) => {
      const res = await db.query(
        `UPDATE dispatch_shipments SET delivery_status = $2 WHERE id = $1 RETURNING *`,
        [shipmentId, status]
      );
      return res.rows[0];
    },
    { userId: user.userId }
  );

  if (!shipment) throw new HttpError(404, `Shipment ${shipmentId} not found`);

  return ok({
    message:
      status === 'DELIVERED'
        ? 'Delivered: trigger freed the vehicle, released reserved stock and updated the request.'
        : 'Failed: trigger freed the vehicle, returned stock to the depot and re-opened the request.',
    shipment,
  });
});
