-- ============================================================================
-- ReliefChain
-- File   : sql/queries/curriculum_queries.sql
-- Owner  : Member 1 (Database Architect & Core Backend)
-- Purpose: DML + query showcase for the DBMS syllabus.
--
-- This file lives in a sub-folder on purpose: Postgres' docker init only runs
-- top-level files, so these INSERT/UPDATE/DELETE demos never touch the seed.
-- Run manually:  psql -U relief_admin -d reliefchain_db -f sql/queries/curriculum_queries.sql
-- Everything is wrapped in a transaction that is ROLLED BACK at the end.
-- ============================================================================

BEGIN;

-- 1. INSERT - a new urgent request from a camp
INSERT INTO relief_requests (camp_id, category_id, requested_quantity, urgency_level, status, notes)
VALUES (1, 1, 500, 'CRITICAL', 'PENDING', 'Drinking water exhausted after main pipeline broke')
RETURNING id, status, created_at;

-- 2. UPDATE with CASE - surge occupancy and flag overcrowding
UPDATE relief_camps
SET current_occupancy = current_occupancy + 150,
    status = CASE WHEN current_occupancy + 150 > capacity THEN 'OVERCROWDED' ELSE status END
WHERE id = 2
RETURNING id, name, current_occupancy, capacity, status;

-- 3. DELETE - purge resolved SOS signals older than 30 days
DELETE FROM emergency_sos_signals
WHERE status = 'RESOLVED' AND created_at < NOW() - INTERVAL '30 days';

-- 4. Multi-table INNER + LEFT OUTER JOIN - open requests with dispatch tracking
SELECT z.name AS zone_name, z.disaster_type, c.name AS camp_name,
       rc.name AS requested_item, rr.requested_quantity, rr.urgency_level,
       COALESCE(ds.tracking_code, 'NOT_DISPATCHED') AS dispatch_tracking
FROM relief_requests rr
INNER JOIN relief_camps c         ON rr.camp_id = c.id
INNER JOIN disaster_zones z       ON c.zone_id = z.id
INNER JOIN resource_categories rc ON rr.category_id = rc.id
LEFT OUTER JOIN dispatch_shipments ds ON rr.id = ds.request_id
WHERE rr.status IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED')
ORDER BY CASE rr.urgency_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
         rr.created_at;

-- 5. GROUP BY + HAVING - camps whose outstanding deficit exceeds 300 units
SELECT c.id AS camp_id, c.name AS camp_name, z.name AS disaster_zone,
       COUNT(rr.id) AS total_requests,
       SUM(rr.requested_quantity) AS units_demanded,
       SUM(rr.approved_quantity)  AS units_allocated,
       SUM(rr.requested_quantity) - SUM(rr.approved_quantity) AS outstanding_deficit,
       ROUND(AVG(rr.requested_quantity), 2) AS avg_request_size
FROM relief_camps c
JOIN disaster_zones z  ON c.zone_id = z.id
JOIN relief_requests rr ON c.id = rr.camp_id
WHERE rr.status <> 'REJECTED'
GROUP BY c.id, c.name, z.name
HAVING SUM(rr.requested_quantity) - SUM(rr.approved_quantity) > 300
ORDER BY outstanding_deficit DESC;

-- 6. Scalar subquery - depots holding above-average medical stock
SELECT w.name AS warehouse_name, rc.name AS resource_name, wi.available_quantity
FROM warehouse_inventory wi
JOIN warehouses w           ON wi.warehouse_id = w.id
JOIN resource_categories rc ON wi.category_id = rc.id
WHERE rc.category_group = 'MEDICAL'
  AND wi.available_quantity > (
        SELECT AVG(wi2.available_quantity)
        FROM warehouse_inventory wi2
        JOIN resource_categories rc2 ON wi2.category_id = rc2.id
        WHERE rc2.category_group = 'MEDICAL')
ORDER BY wi.available_quantity DESC;

-- 7. Correlated subquery (NOT EXISTS) - operational camps with nothing on the road
SELECT c.id, c.name AS vulnerable_camp, c.current_occupancy, c.capacity, z.name AS zone_name
FROM relief_camps c
JOIN disaster_zones z ON c.zone_id = z.id
WHERE c.status = 'OPERATIONAL'
  AND NOT EXISTS (
        SELECT 1
        FROM relief_requests rr
        JOIN dispatch_shipments ds ON rr.id = ds.request_id
        WHERE rr.camp_id = c.id
          AND ds.delivery_status IN ('PREPARING', 'DISPATCHED', 'IN_TRANSIT'));

-- 8. Window function - rank each depot's stock within its category
SELECT rc.name AS resource_name, w.name AS warehouse_name, wi.available_quantity,
       RANK() OVER (PARTITION BY wi.category_id ORDER BY wi.available_quantity DESC) AS stock_rank
FROM warehouse_inventory wi
JOIN warehouses w           ON w.id = wi.warehouse_id
JOIN resource_categories rc ON rc.id = wi.category_id
ORDER BY rc.name, stock_rank;

-- 9. Stored function + procedure calls
SELECT * FROM fn_find_nearest_warehouse_with_stock(1, 2, 40);
CALL sp_process_resource_dispatch(2, 1, 2, 40, 2, NULL);   -- 40 trauma kits, light truck
SELECT tracking_code, delivery_status, route_distance_km, estimated_arrival
FROM dispatch_shipments ORDER BY id DESC LIMIT 1;

-- 10. pgvector - the 3 SOS messages most similar to SOS #1 (cosine distance <=>)
--     (embeddings are back-filled by the app: open the SOS tab once first)
SELECT b.id, b.raw_message, ROUND((1 - (a.embedding <=> b.embedding))::numeric, 4) AS cosine_similarity
FROM emergency_sos_signals a
JOIN emergency_sos_signals b ON b.id <> a.id
WHERE a.id = 1 AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
ORDER BY a.embedding <=> b.embedding
LIMIT 3;

ROLLBACK;
