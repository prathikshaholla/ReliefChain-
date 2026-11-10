-- ============================================================================
-- ReliefChain
-- File   : sql/02_views.sql
-- Owner  : Member 1 (Database Architect & Core Backend)
-- Purpose: Analytical views for triage, deficit analysis and fleet tracking.
--
-- Design note: every view pre-aggregates child tables in a derived table
-- before joining. Joining several one-to-many tables and then calling SUM()
-- multiplies rows ("fan-out") and silently inflates totals.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View 1: Camp Deficit Matrix  (one row per camp x resource category)
-- requested vs allocated vs in-transit vs delivered, and what is still missing
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_camp_deficit_matrix AS
WITH shipped AS (
    SELECT
        ds.request_id,
        di.category_id,
        SUM(di.quantity_loaded) FILTER (WHERE ds.delivery_status = 'DELIVERED') AS delivered,
        SUM(di.quantity_loaded) FILTER (WHERE ds.delivery_status IN ('PREPARING', 'DISPATCHED', 'IN_TRANSIT')) AS in_transit
    FROM dispatch_shipments ds
    JOIN dispatch_items di ON di.shipment_id = ds.id
    GROUP BY ds.request_id, di.category_id
)
SELECT
    c.id                                         AS camp_id,
    c.name                                       AS camp_name,
    z.name                                       AS zone_name,
    z.severity_level,
    rc.id                                        AS category_id,
    rc.name                                      AS resource_name,
    rc.category_group,
    rc.unit_of_measure,
    SUM(rr.requested_quantity)                   AS total_requested,
    SUM(rr.approved_quantity)                    AS total_approved,
    COALESCE(SUM(s.in_transit), 0)               AS in_transit,
    COALESCE(SUM(s.delivered), 0)                AS total_delivered,
    GREATEST(SUM(rr.requested_quantity) - COALESCE(SUM(s.delivered), 0), 0) AS unfulfilled_deficit,
    MAX(rr.created_at)                           AS latest_request_time
FROM relief_requests rr
JOIN relief_camps c         ON c.id  = rr.camp_id
JOIN disaster_zones z       ON z.id  = c.zone_id
JOIN resource_categories rc ON rc.id = rr.category_id
LEFT JOIN shipped s         ON s.request_id = rr.id AND s.category_id = rr.category_id
WHERE rr.status <> 'REJECTED'
GROUP BY c.id, c.name, z.name, z.severity_level, rc.id, rc.name, rc.category_group, rc.unit_of_measure;

-- ----------------------------------------------------------------------------
-- View 2: Active Disaster Dashboard  (one row per disaster zone)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_disaster_dashboard AS
SELECT
    z.id                                   AS zone_id,
    z.name                                 AS zone_name,
    z.disaster_type,
    z.severity_level,
    CASE z.severity_level WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MODERATE' THEN 3 ELSE 4 END AS severity_rank,
    z.status                               AS zone_status,
    z.estimated_affected_pop,
    COALESCE(cs.total_camps, 0)            AS total_camps,
    COALESCE(cs.total_capacity, 0)         AS total_shelter_capacity,
    COALESCE(cs.total_occupancy, 0)        AS total_sheltered_victims,
    COALESCE(ROUND(cs.total_occupancy::DECIMAL / NULLIF(cs.total_capacity, 0) * 100, 2), 0) AS shelter_utilization_pct,
    COALESCE(rq.pending_requests, 0)       AS pending_requests_count,
    COALESCE(rq.critical_pending, 0)       AS critical_requests_count,
    COALESCE(sos.unresolved, 0)            AS unresolved_sos_count
FROM disaster_zones z
LEFT JOIN (
    SELECT zone_id,
           COUNT(*)               AS total_camps,
           SUM(capacity)          AS total_capacity,
           SUM(current_occupancy) AS total_occupancy
    FROM relief_camps
    GROUP BY zone_id
) cs ON cs.zone_id = z.id
LEFT JOIN (
    SELECT c.zone_id,
           COUNT(*) FILTER (WHERE rr.status = 'PENDING')                                AS pending_requests,
           COUNT(*) FILTER (WHERE rr.status = 'PENDING' AND rr.urgency_level = 'CRITICAL') AS critical_pending
    FROM relief_requests rr
    JOIN relief_camps c ON c.id = rr.camp_id
    GROUP BY c.zone_id
) rq ON rq.zone_id = z.id
LEFT JOIN (
    SELECT zone_id, COUNT(*) FILTER (WHERE status = 'UNRESOLVED') AS unresolved
    FROM emergency_sos_signals
    GROUP BY zone_id
) sos ON sos.zone_id = z.id;

-- ----------------------------------------------------------------------------
-- View 3: Fleet Readiness  (each vehicle + its active mission, if any)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_fleet_readiness AS
SELECT
    vf.id              AS vehicle_id,
    vf.vehicle_number,
    vf.vehicle_type,
    vf.max_payload_kg,
    vf.status,
    w.name             AS home_warehouse_name,
    ds.tracking_code   AS active_mission_code,
    ds.delivery_status AS active_shipment_status,
    ds.estimated_arrival,
    vf.last_ping_time
FROM vehicle_fleet vf
LEFT JOIN warehouses w          ON w.id = vf.home_warehouse_id
LEFT JOIN dispatch_shipments ds ON ds.vehicle_id = vf.id
                               AND ds.delivery_status IN ('PREPARING', 'DISPATCHED', 'IN_TRANSIT');

-- ----------------------------------------------------------------------------
-- View 4: Urgent Unfulfilled Requests with network-wide stock availability
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_urgent_unfulfilled_requests AS
SELECT
    rr.id                                    AS request_id,
    c.id                                     AS camp_id,
    c.name                                   AS camp_name,
    z.name                                   AS zone_name,
    rc.id                                    AS category_id,
    rc.name                                  AS resource_name,
    rr.requested_quantity,
    rr.requested_quantity - rr.approved_quantity AS remaining_quantity,
    rr.urgency_level,
    rr.status,
    rr.created_at,
    COALESCE(SUM(wi.available_quantity), 0)  AS global_available_stock,
    COUNT(wi.warehouse_id) FILTER (WHERE wi.available_quantity >= rr.requested_quantity - rr.approved_quantity)
                                             AS warehouses_with_sufficient_stock
FROM relief_requests rr
JOIN relief_camps c         ON c.id  = rr.camp_id
JOIN disaster_zones z       ON z.id  = c.zone_id
JOIN resource_categories rc ON rc.id = rr.category_id
LEFT JOIN warehouse_inventory wi ON wi.category_id = rc.id
      AND wi.warehouse_id IN (SELECT id FROM warehouses WHERE is_operational)
WHERE rr.status IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED')
GROUP BY rr.id, c.id, c.name, z.name, rc.id, rc.name;
