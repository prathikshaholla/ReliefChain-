-- ============================================================================
-- ReliefChain
-- File   : sql/03_procedures_and_triggers.sql
-- Owner  : Member 1 (Database Architect & Core Backend)
-- Purpose: Helper functions, triggers, the Haversine warehouse finder and the
--          ACID dispatch stored procedure.
--
-- Who did it? The API runs every write inside a transaction that first calls
--   SELECT set_config('app.user_id', '<id>', true);
-- so triggers can attribute audit rows via fn_current_app_user().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_current_app_user()
RETURNS INT AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::INT;
$$ LANGUAGE sql STABLE;

-- Great-circle distance in km between two lat/lon points (Haversine / spherical law of cosines)
CREATE OR REPLACE FUNCTION fn_haversine_km(
    p_lat1 DECIMAL, p_lon1 DECIMAL, p_lat2 DECIMAL, p_lon2 DECIMAL
)
RETURNS DECIMAL(8, 2) AS $$
    SELECT ROUND((6371 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(p_lat1)) * cos(radians(p_lat2)) * cos(radians(p_lon2) - radians(p_lon1))
             + sin(radians(p_lat1)) * sin(radians(p_lat2))
           ))))::numeric, 2);
$$ LANGUAGE sql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 1. Trigger: prevent negative inventory
--    (CHECK constraints already exist; the trigger gives a readable error that
--     names the warehouse and category, which the API passes to the UI.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prevent_negative_inventory()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.available_quantity < 0 THEN
        RAISE EXCEPTION 'Inventory integrity violation: available_quantity cannot be negative (warehouse %, category %)',
            NEW.warehouse_id, NEW.category_id;
    END IF;
    IF NEW.reserved_quantity < 0 THEN
        RAISE EXCEPTION 'Inventory integrity violation: reserved_quantity cannot be negative (warehouse %, category %)',
            NEW.warehouse_id, NEW.category_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chk_inventory_levels ON warehouse_inventory;
CREATE TRIGGER trg_chk_inventory_levels
BEFORE INSERT OR UPDATE ON warehouse_inventory
FOR EACH ROW EXECUTE FUNCTION fn_prevent_negative_inventory();

-- ----------------------------------------------------------------------------
-- 2. Trigger: audit every status transition of a relief request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_request_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO allocation_audit_log (entity_name, entity_id, action_type, performed_by, old_state, new_state)
        VALUES (
            'relief_requests', NEW.id, 'UPDATE', fn_current_app_user(),
            jsonb_build_object('status', OLD.status, 'approved_quantity', OLD.approved_quantity),
            jsonb_build_object('status', NEW.status, 'approved_quantity', NEW.approved_quantity)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_request ON relief_requests;
CREATE TRIGGER trg_audit_request
AFTER UPDATE ON relief_requests
FOR EACH ROW EXECUTE FUNCTION fn_audit_request_status_change();

-- ----------------------------------------------------------------------------
-- 3a. BEFORE trigger on shipments: validate the state machine, stamp arrival
--     PREPARING/DISPATCHED/IN_TRANSIT  ->  DELIVERED | FAILED  (terminal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_shipment_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
        IF OLD.delivery_status IN ('DELIVERED', 'FAILED') THEN
            RAISE EXCEPTION 'Shipment % is already % and cannot change to %',
                OLD.tracking_code, OLD.delivery_status, NEW.delivery_status;
        END IF;
        IF NEW.delivery_status = 'DELIVERED' THEN
            NEW.actual_arrival := CURRENT_TIMESTAMP;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipment_transition ON dispatch_shipments;
CREATE TRIGGER trg_shipment_transition
BEFORE UPDATE ON dispatch_shipments
FOR EACH ROW EXECUTE FUNCTION fn_validate_shipment_transition();

-- ----------------------------------------------------------------------------
-- 3b. AFTER trigger on shipments: cascade the delivery outcome
--   DELIVERED -> free vehicle, release reserved stock, fulfil request
--   FAILED    -> free vehicle, return stock to available, re-open request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_handle_shipment_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_item       RECORD;
    v_delivered  INT;
    v_requested  INT;
    v_camp_lat   DECIMAL(10, 7);
    v_camp_lon   DECIMAL(10, 7);
BEGIN
    IF NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status
       OR NEW.delivery_status NOT IN ('DELIVERED', 'FAILED') THEN
        RETURN NEW;
    END IF;

    SELECT c.latitude, c.longitude INTO v_camp_lat, v_camp_lon
    FROM relief_requests rr JOIN relief_camps c ON c.id = rr.camp_id
    WHERE rr.id = NEW.request_id;

    -- Vehicle is free again (on delivery it is now parked at the camp)
    UPDATE vehicle_fleet
    SET status            = 'AVAILABLE',
        current_latitude  = CASE WHEN NEW.delivery_status = 'DELIVERED' THEN v_camp_lat ELSE current_latitude END,
        current_longitude = CASE WHEN NEW.delivery_status = 'DELIVERED' THEN v_camp_lon ELSE current_longitude END,
        last_ping_time    = CURRENT_TIMESTAMP
    WHERE id = NEW.vehicle_id;

    FOR v_item IN SELECT category_id, quantity_loaded FROM dispatch_items WHERE shipment_id = NEW.id LOOP
        IF NEW.delivery_status = 'DELIVERED' THEN
            -- Goods have left the network: drop them from reserved
            UPDATE warehouse_inventory
            SET reserved_quantity = reserved_quantity - v_item.quantity_loaded
            WHERE warehouse_id = NEW.warehouse_id AND category_id = v_item.category_id;
        ELSE
            -- Shipment failed: goods return to the depot shelf
            UPDATE warehouse_inventory
            SET reserved_quantity  = reserved_quantity  - v_item.quantity_loaded,
                available_quantity = available_quantity + v_item.quantity_loaded
            WHERE warehouse_id = NEW.warehouse_id AND category_id = v_item.category_id;

            UPDATE relief_requests
            SET approved_quantity = approved_quantity - v_item.quantity_loaded,
                status = CASE WHEN approved_quantity - v_item.quantity_loaded = 0 THEN 'PENDING'
                              ELSE 'PARTIALLY_FULFILLED' END
            WHERE id = NEW.request_id;
        END IF;
    END LOOP;

    IF NEW.delivery_status = 'DELIVERED' THEN
        SELECT COALESCE(SUM(di.quantity_loaded), 0) INTO v_delivered
        FROM dispatch_shipments ds JOIN dispatch_items di ON di.shipment_id = ds.id
        WHERE ds.request_id = NEW.request_id AND ds.delivery_status = 'DELIVERED';

        SELECT requested_quantity INTO v_requested FROM relief_requests WHERE id = NEW.request_id;

        UPDATE relief_requests
        SET status       = CASE WHEN v_delivered >= v_requested THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END,
            fulfilled_at = CASE WHEN v_delivered >= v_requested THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = NEW.request_id;
    END IF;

    INSERT INTO allocation_audit_log (entity_name, entity_id, action_type, performed_by, old_state, new_state)
    VALUES (
        'dispatch_shipments', NEW.id,
        CASE WHEN NEW.delivery_status = 'DELIVERED' THEN 'DELIVERY' ELSE 'DELIVERY_FAILED' END,
        fn_current_app_user(),
        jsonb_build_object('delivery_status', OLD.delivery_status),
        jsonb_build_object('delivery_status', NEW.delivery_status, 'tracking_code', NEW.tracking_code)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipment_delivery ON dispatch_shipments;
CREATE TRIGGER trg_shipment_delivery
AFTER UPDATE OF delivery_status ON dispatch_shipments
FOR EACH ROW EXECUTE FUNCTION fn_handle_shipment_status_change();

-- ----------------------------------------------------------------------------
-- 4. Stored function: nearest operational warehouse that can cover the order
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_find_nearest_warehouse_with_stock(INT, INT, INT);
CREATE FUNCTION fn_find_nearest_warehouse_with_stock(
    p_camp_id      INT,
    p_category_id  INT,
    p_required_qty INT
)
RETURNS TABLE (
    warehouse_id    INT,
    warehouse_name  VARCHAR,
    available_stock INT,
    distance_km     DECIMAL(8, 2)
) AS $$
DECLARE
    v_camp_lat DECIMAL(10, 7);
    v_camp_lon DECIMAL(10, 7);
BEGIN
    SELECT latitude, longitude INTO v_camp_lat, v_camp_lon
    FROM relief_camps WHERE id = p_camp_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Camp with ID % not found', p_camp_id;
    END IF;

    RETURN QUERY
    SELECT w.id, w.name, wi.available_quantity,
           fn_haversine_km(v_camp_lat, v_camp_lon, w.latitude, w.longitude) AS distance_km
    FROM warehouses w
    JOIN warehouse_inventory wi ON wi.warehouse_id = w.id
    WHERE w.is_operational
      AND wi.category_id = p_category_id
      AND wi.available_quantity >= p_required_qty
    ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 5. Stored procedure: ACID resource allocation & dispatch
--    All steps succeed together or the whole transaction rolls back.
--    Row locks are always taken in the same order (request -> inventory ->
--    vehicle) so two concurrent dispatches cannot deadlock or double-allocate.
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_process_resource_dispatch(INT, INT, INT, INT, INT, VARCHAR);
CREATE PROCEDURE sp_process_resource_dispatch(
    p_request_id      INT,
    p_warehouse_id    INT,
    p_vehicle_id      INT,
    p_allocated_qty   INT,
    p_dispatched_by   INT,
    INOUT p_tracking_code VARCHAR DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_category_id    INT;
    v_requested_qty  INT;
    v_approved_qty   INT;
    v_request_status VARCHAR(20);
    v_camp_lat       DECIMAL(10, 7);
    v_camp_lon       DECIMAL(10, 7);
    v_wh_lat         DECIMAL(10, 7);
    v_wh_lon         DECIMAL(10, 7);
    v_wh_operational BOOLEAN;
    v_current_stock  INT;
    v_vehicle_status VARCHAR(30);
    v_vehicle_type   VARCHAR(40);
    v_vehicle_cap    DECIMAL(9, 2);
    v_unit_weight    DECIMAL(8, 2);
    v_total_weight   DECIMAL(12, 2);
    v_distance_km    DECIMAL(8, 2);
    v_speed_kmh      INT;
    v_shipment_id    INT;
BEGIN
    IF p_allocated_qty IS NULL OR p_allocated_qty <= 0 THEN
        RAISE EXCEPTION 'Allocated quantity must be greater than zero';
    END IF;

    -- 1. Lock the request row
    SELECT rr.category_id, rr.requested_quantity, rr.approved_quantity, rr.status, c.latitude, c.longitude
    INTO v_category_id, v_requested_qty, v_approved_qty, v_request_status, v_camp_lat, v_camp_lon
    FROM relief_requests rr
    JOIN relief_camps c ON c.id = rr.camp_id
    WHERE rr.id = p_request_id
    FOR UPDATE OF rr;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Relief request % does not exist', p_request_id;
    END IF;
    IF v_request_status NOT IN ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED') THEN
        RAISE EXCEPTION 'Relief request % is % and cannot be dispatched', p_request_id, v_request_status;
    END IF;
    IF p_allocated_qty > v_requested_qty - v_approved_qty THEN
        RAISE EXCEPTION 'Over-allocation: request % only needs % more units (asked to send %)',
            p_request_id, v_requested_qty - v_approved_qty, p_allocated_qty;
    END IF;

    -- 2. Validate the warehouse and lock its inventory row
    SELECT latitude, longitude, is_operational INTO v_wh_lat, v_wh_lon, v_wh_operational
    FROM warehouses WHERE id = p_warehouse_id;

    IF NOT FOUND OR NOT v_wh_operational THEN
        RAISE EXCEPTION 'Warehouse % does not exist or is not operational', p_warehouse_id;
    END IF;

    SELECT available_quantity INTO v_current_stock
    FROM warehouse_inventory
    WHERE warehouse_id = p_warehouse_id AND category_id = v_category_id
    FOR UPDATE;

    IF NOT FOUND OR v_current_stock < p_allocated_qty THEN
        RAISE EXCEPTION 'Insufficient stock in warehouse %: requested %, available %',
            p_warehouse_id, p_allocated_qty, COALESCE(v_current_stock, 0);
    END IF;

    -- 3. Lock the vehicle and check availability + payload
    SELECT status, vehicle_type, max_payload_kg INTO v_vehicle_status, v_vehicle_type, v_vehicle_cap
    FROM vehicle_fleet WHERE id = p_vehicle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle % does not exist', p_vehicle_id;
    END IF;
    IF v_vehicle_status <> 'AVAILABLE' THEN
        RAISE EXCEPTION 'Vehicle % is not available (current status: %)', p_vehicle_id, v_vehicle_status;
    END IF;

    SELECT weight_kg_per_unit INTO v_unit_weight FROM resource_categories WHERE id = v_category_id;
    v_total_weight := p_allocated_qty * v_unit_weight;
    IF v_total_weight > v_vehicle_cap THEN
        RAISE EXCEPTION 'Shipment weight (% kg) exceeds vehicle payload capacity (% kg)', v_total_weight, v_vehicle_cap;
    END IF;

    -- 4. Move stock from available to reserved
    UPDATE warehouse_inventory
    SET available_quantity = available_quantity - p_allocated_qty,
        reserved_quantity  = reserved_quantity  + p_allocated_qty
    WHERE warehouse_id = p_warehouse_id AND category_id = v_category_id;

    -- 5. Route distance + ETA (30 min loading + travel at vehicle cruise speed)
    v_distance_km := fn_haversine_km(v_wh_lat, v_wh_lon, v_camp_lat, v_camp_lon);
    v_speed_kmh := CASE v_vehicle_type
        WHEN 'RESCUE_HELICOPTER' THEN 180
        WHEN 'DRONE_FLEET'       THEN 60
        WHEN 'LIGHT_TRUCK'       THEN 50
        WHEN 'HEAVY_TRUCK'       THEN 40
        WHEN 'AMPHIBIOUS_BOAT'   THEN 20
        ELSE 40 END;

    -- 6. Collision-free tracking code from a sequence
    p_tracking_code := 'RC-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || nextval('shipment_tracking_seq');

    INSERT INTO dispatch_shipments (
        tracking_code, request_id, warehouse_id, vehicle_id, dispatched_by,
        estimated_arrival, delivery_status, route_distance_km, delivery_notes
    ) VALUES (
        p_tracking_code, p_request_id, p_warehouse_id, p_vehicle_id, p_dispatched_by,
        CURRENT_TIMESTAMP + INTERVAL '30 minutes' + make_interval(mins => CEIL(v_distance_km / v_speed_kmh * 60)::INT),
        'DISPATCHED', v_distance_km,
        'Dispatched via ReliefChain ACID transaction'
    ) RETURNING id INTO v_shipment_id;

    -- 7. Shipment manifest
    INSERT INTO dispatch_items (shipment_id, category_id, quantity_loaded)
    VALUES (v_shipment_id, v_category_id, p_allocated_qty);

    -- 8. Vehicle goes on the road
    UPDATE vehicle_fleet
    SET status = 'IN_TRANSIT', last_ping_time = CURRENT_TIMESTAMP
    WHERE id = p_vehicle_id;

    -- 9. Request progress (fires trg_audit_request)
    UPDATE relief_requests
    SET approved_quantity = approved_quantity + p_allocated_qty,
        status = CASE WHEN approved_quantity + p_allocated_qty >= requested_quantity
                      THEN 'DISPATCHED' ELSE 'PARTIALLY_FULFILLED' END
    WHERE id = p_request_id;

    -- 10. Audit record
    INSERT INTO allocation_audit_log (entity_name, entity_id, action_type, performed_by, old_state, new_state)
    VALUES (
        'dispatch_shipments', v_shipment_id, 'DISPATCH_ALLOCATION', p_dispatched_by,
        jsonb_build_object('available_stock_before', v_current_stock),
        jsonb_build_object(
            'tracking_code',   p_tracking_code,
            'allocated_qty',   p_allocated_qty,
            'remaining_stock', v_current_stock - p_allocated_qty,
            'distance_km',     v_distance_km
        )
    );
END;
$$;
