// ============================================================================
// GET  /api/inventory - stock matrix + warehouse and category reference lists
// POST /api/inventory - restock a depot (ADMIN, LOGISTICS_STAFF)
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { query, withTransaction } from '@/lib/db/postgres';
import { ok, posInt, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  requireUser(req);

  const [inventory, warehouses, categories] = await Promise.all([
    query(`
      SELECT wi.id, wi.warehouse_id, w.name AS warehouse_name, w.location_name,
             wi.category_id, rc.code AS resource_code, rc.name AS resource_name, rc.category_group,
             rc.unit_of_measure, rc.priority_rank,
             wi.available_quantity, wi.reserved_quantity, wi.minimum_threshold, wi.last_restocked_at,
             CASE WHEN wi.available_quantity = 0                    THEN 'OUT_OF_STOCK'
                  WHEN wi.available_quantity <= wi.minimum_threshold THEN 'LOW_STOCK'
                  ELSE 'SUFFICIENT' END AS stock_status
      FROM warehouse_inventory wi
      JOIN warehouses w           ON w.id = wi.warehouse_id
      JOIN resource_categories rc ON rc.id = wi.category_id
      ORDER BY w.id, rc.priority_rank, rc.id
    `),
    query(`SELECT id, name, location_name, capacity_sqft, is_operational, latitude, longitude FROM warehouses ORDER BY id`),
    query(`SELECT id, code, name, category_group, unit_of_measure, priority_rank, weight_kg_per_unit
           FROM resource_categories ORDER BY priority_rank, name`),
  ]);

  return ok({ inventory: inventory.rows, warehouses: warehouses.rows, categories: categories.rows });
});

export const POST = route(async (req) => {
  const user = requireUser(req, 'restock');
  const body = await readJson(req);
  const warehouseId = posInt(body.warehouseId, 'warehouseId');
  const categoryId = posInt(body.categoryId, 'categoryId');
  const quantity = posInt(body.restockQuantity, 'restockQuantity');

  // Upsert + audit row commit together or not at all
  const updated = await withTransaction(
    async (db) => {
      const res = await db.query(
        `INSERT INTO warehouse_inventory (warehouse_id, category_id, available_quantity, last_restocked_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (warehouse_id, category_id) DO UPDATE
           SET available_quantity = warehouse_inventory.available_quantity + EXCLUDED.available_quantity,
               last_restocked_at  = CURRENT_TIMESTAMP
         RETURNING *, available_quantity - $3 AS previous_quantity`,
        [warehouseId, categoryId, quantity]
      );
      const row = res.rows[0];
      await db.query(
        `INSERT INTO allocation_audit_log (entity_name, entity_id, action_type, performed_by, old_state, new_state)
         VALUES ('warehouse_inventory', $1, 'STOCK_ADJUSTMENT', $2, $3, $4)`,
        [
          row.id,
          user.userId,
          JSON.stringify({ available_quantity: row.previous_quantity }),
          JSON.stringify({ available_quantity: row.available_quantity, restocked: quantity }),
        ]
      );
      return row;
    },
    { userId: user.userId }
  );

  return ok({ updatedInventory: updated });
});
