-- ============================================================================
-- ReliefChain: Disaster Relief Resource Allocation & Routing System
-- File   : sql/01_schema.sql
-- Owner  : Member 1 (Database Architect & Core Backend)
-- Purpose: Core relational DDL - tables, keys, CHECK constraints, indexes.
--
-- Run order: 01_schema -> 02_views -> 03_procedures_and_triggers
--            -> 04_vector_and_scoring -> 05_seed
-- (docker-compose runs these automatically on a fresh volume;
--  `npm run db:setup` re-runs them against any Postgres.)
-- ============================================================================

-- Clean re-creation (reverse dependency order). CASCADE also drops dependent views.
DROP TABLE IF EXISTS allocation_audit_log  CASCADE;
DROP TABLE IF EXISTS dispatch_items        CASCADE;
DROP TABLE IF EXISTS dispatch_shipments    CASCADE;
DROP TABLE IF EXISTS vehicle_fleet         CASCADE;
DROP TABLE IF EXISTS emergency_sos_signals CASCADE;
DROP TABLE IF EXISTS relief_requests       CASCADE;
DROP TABLE IF EXISTS warehouse_inventory   CASCADE;
DROP TABLE IF EXISTS resource_categories   CASCADE;
DROP TABLE IF EXISTS warehouses            CASCADE;
DROP TABLE IF EXISTS relief_camps          CASCADE;
DROP TABLE IF EXISTS users                 CASCADE;
DROP TABLE IF EXISTS disaster_zones        CASCADE;
DROP SEQUENCE IF EXISTS shipment_tracking_seq;

-- ----------------------------------------------------------------------------
-- 1. Disaster Zones (active crisis areas)
-- ----------------------------------------------------------------------------
CREATE TABLE disaster_zones (
    id                     SERIAL PRIMARY KEY,
    name                   VARCHAR(120) NOT NULL,
    disaster_type          VARCHAR(50)  NOT NULL CHECK (disaster_type IN ('FLOOD', 'EARTHQUAKE', 'CYCLONE', 'LANDSLIDE', 'FIRE', 'TSUNAMI')),
    severity_level         VARCHAR(20)  NOT NULL CHECK (severity_level IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),
    latitude               DECIMAL(10, 7) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude              DECIMAL(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    radius_km              DECIMAL(6, 2)  NOT NULL CHECK (radius_km > 0),
    estimated_affected_pop INT          NOT NULL CHECK (estimated_affected_pop >= 0),
    status                 VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STABILIZING', 'RESOLVED')),
    declared_at            TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. Users (authentication + role-based access control)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(120) NOT NULL UNIQUE,
    password_hash    VARCHAR(255) NOT NULL,
    full_name        VARCHAR(100) NOT NULL,
    role             VARCHAR(30)  NOT NULL CHECK (role IN ('ADMIN', 'LOGISTICS_STAFF', 'FIRST_RESPONDER')),
    phone            VARCHAR(20),
    assigned_zone_id INT REFERENCES disaster_zones(id) ON DELETE SET NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 3. Relief Camps (field shelters and triage points)
-- ----------------------------------------------------------------------------
CREATE TABLE relief_camps (
    id                SERIAL PRIMARY KEY,
    zone_id           INT          NOT NULL REFERENCES disaster_zones(id) ON DELETE CASCADE,
    name              VARCHAR(150) NOT NULL,
    camp_type         VARCHAR(50)  NOT NULL CHECK (camp_type IN ('TEMPORARY_SHELTER', 'FIELD_HOSPITAL', 'TRANSIT_CAMP', 'DISTRIBUTION_HUB')),
    contact_person    VARCHAR(100) NOT NULL,
    contact_phone     VARCHAR(20)  NOT NULL,
    latitude          DECIMAL(10, 7) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude         DECIMAL(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    capacity          INT          NOT NULL CHECK (capacity > 0),
    current_occupancy INT          NOT NULL DEFAULT 0 CHECK (current_occupancy >= 0),
    status            VARCHAR(20)  NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'OVERCROWDED', 'EVACUATING', 'CLOSED')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A temporary surge up to 150% of capacity is tolerated during evacuations
    CONSTRAINT chk_occupancy_capacity CHECK (current_occupancy <= capacity * 1.5)
);

-- ----------------------------------------------------------------------------
-- 4. Warehouses (regional supply depots)
-- ----------------------------------------------------------------------------
CREATE TABLE warehouses (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(120) NOT NULL,
    location_name  VARCHAR(150) NOT NULL,
    latitude       DECIMAL(10, 7) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude      DECIMAL(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    capacity_sqft  INT          NOT NULL CHECK (capacity_sqft > 0),
    manager_id     INT REFERENCES users(id) ON DELETE SET NULL,
    is_operational BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. Resource Categories (standardised aid supplies)
-- ----------------------------------------------------------------------------
CREATE TABLE resource_categories (
    id                 SERIAL PRIMARY KEY,
    code               VARCHAR(30)  NOT NULL UNIQUE,
    name               VARCHAR(100) NOT NULL,
    category_group     VARCHAR(50)  NOT NULL CHECK (category_group IN ('FOOD_WATER', 'MEDICAL', 'SHELTER', 'POWER_EQUIPMENT', 'HYGIENE')),
    unit_of_measure    VARCHAR(30)  NOT NULL,
    is_perishable      BOOLEAN      NOT NULL DEFAULT FALSE,
    weight_kg_per_unit DECIMAL(8, 2) NOT NULL DEFAULT 1.0 CHECK (weight_kg_per_unit > 0),
    priority_rank      INT          NOT NULL DEFAULT 3 CHECK (priority_rank BETWEEN 1 AND 5) -- 1 = most critical
);

-- ----------------------------------------------------------------------------
-- 6. Warehouse Inventory (stock per depot per category)
--    available_quantity : free stock that can be allocated
--    reserved_quantity  : stock loaded onto shipments that are still on the road
-- ----------------------------------------------------------------------------
CREATE TABLE warehouse_inventory (
    id                 SERIAL PRIMARY KEY,
    warehouse_id       INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    category_id        INT NOT NULL REFERENCES resource_categories(id) ON DELETE RESTRICT,
    available_quantity INT NOT NULL DEFAULT 0   CHECK (available_quantity >= 0),
    reserved_quantity  INT NOT NULL DEFAULT 0   CHECK (reserved_quantity >= 0),
    minimum_threshold  INT NOT NULL DEFAULT 100 CHECK (minimum_threshold >= 0),
    last_restocked_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_warehouse_category UNIQUE (warehouse_id, category_id)
);

-- ----------------------------------------------------------------------------
-- 7. Relief Requests (demand raised by camps)
--    approved_quantity = units already allocated to shipments for this request
-- ----------------------------------------------------------------------------
CREATE TABLE relief_requests (
    id                 SERIAL PRIMARY KEY,
    camp_id            INT NOT NULL REFERENCES relief_camps(id) ON DELETE CASCADE,
    category_id        INT NOT NULL REFERENCES resource_categories(id) ON DELETE RESTRICT,
    requested_quantity INT NOT NULL CHECK (requested_quantity > 0),
    approved_quantity  INT NOT NULL DEFAULT 0 CHECK (approved_quantity >= 0),
    urgency_level      VARCHAR(20) NOT NULL CHECK (urgency_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    status             VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING', 'APPROVED', 'DISPATCHED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED')),
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fulfilled_at       TIMESTAMPTZ,
    CONSTRAINT chk_approved_le_requested CHECK (approved_quantity <= requested_quantity)
);

-- ----------------------------------------------------------------------------
-- 8. Emergency SOS Signals (unstructured distress messages)
--    The `embedding vector(384)` column and its HNSW index are added in
--    04_vector_and_scoring.sql (vector-database layer).
-- ----------------------------------------------------------------------------
CREATE TABLE emergency_sos_signals (
    id                  SERIAL PRIMARY KEY,
    zone_id             INT REFERENCES disaster_zones(id) ON DELETE SET NULL,
    sender_name         VARCHAR(100) NOT NULL,
    sender_phone        VARCHAR(30),
    latitude            DECIMAL(10, 7) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude           DECIMAL(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    victim_count        INT  NOT NULL DEFAULT 1 CHECK (victim_count >= 1),
    raw_message         TEXT NOT NULL,
    detected_urgency    VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (detected_urgency IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    matched_category_id INT REFERENCES resource_categories(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'UNRESOLVED' CHECK (status IN ('UNRESOLVED', 'VERIFIED', 'DISPATCHED', 'RESOLVED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 9. Vehicle Fleet
-- ----------------------------------------------------------------------------
CREATE TABLE vehicle_fleet (
    id                SERIAL PRIMARY KEY,
    vehicle_number    VARCHAR(30) NOT NULL UNIQUE,
    vehicle_type      VARCHAR(40) NOT NULL CHECK (vehicle_type IN ('HEAVY_TRUCK', 'LIGHT_TRUCK', 'DRONE_FLEET', 'AMPHIBIOUS_BOAT', 'RESCUE_HELICOPTER')),
    max_payload_kg    DECIMAL(9, 2)  NOT NULL CHECK (max_payload_kg > 0),
    current_latitude  DECIMAL(10, 7) NOT NULL CHECK (current_latitude  BETWEEN -90  AND 90),
    current_longitude DECIMAL(10, 7) NOT NULL CHECK (current_longitude BETWEEN -180 AND 180),
    home_warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL,
    status            VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'MAINTENANCE', 'OFFLINE')),
    last_ping_time    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 10. Dispatch Shipments (one vehicle trip fulfilling one request)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE shipment_tracking_seq START 1001;

CREATE TABLE dispatch_shipments (
    id                  SERIAL PRIMARY KEY,
    tracking_code       VARCHAR(40) NOT NULL UNIQUE,
    request_id          INT NOT NULL REFERENCES relief_requests(id) ON DELETE CASCADE,
    warehouse_id        INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    vehicle_id          INT NOT NULL REFERENCES vehicle_fleet(id) ON DELETE RESTRICT,
    dispatched_by       INT REFERENCES users(id) ON DELETE SET NULL,
    departure_time      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estimated_arrival   TIMESTAMPTZ,
    actual_arrival      TIMESTAMPTZ,
    delivery_status     VARCHAR(30) NOT NULL DEFAULT 'DISPATCHED' CHECK (delivery_status IN ('PREPARING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'FAILED')),
    route_distance_km   DECIMAL(7, 2) CHECK (route_distance_km >= 0),
    delivery_notes      TEXT
);

-- ----------------------------------------------------------------------------
-- 11. Dispatch Items (shipment manifest, weak entity of dispatch_shipments)
-- ----------------------------------------------------------------------------
CREATE TABLE dispatch_items (
    id              SERIAL PRIMARY KEY,
    shipment_id     INT NOT NULL REFERENCES dispatch_shipments(id) ON DELETE CASCADE,
    category_id     INT NOT NULL REFERENCES resource_categories(id) ON DELETE RESTRICT,
    quantity_loaded INT NOT NULL CHECK (quantity_loaded > 0),
    CONSTRAINT uq_shipment_category UNIQUE (shipment_id, category_id)
);

-- ----------------------------------------------------------------------------
-- 12. Allocation Audit Log (append-only trail, written by triggers/procedures)
-- ----------------------------------------------------------------------------
CREATE TABLE allocation_audit_log (
    id           SERIAL PRIMARY KEY,
    entity_name  VARCHAR(50) NOT NULL,
    entity_id    INT         NOT NULL,
    action_type  VARCHAR(30) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE', 'DISPATCH_ALLOCATION', 'STOCK_ADJUSTMENT', 'DELIVERY', 'DELIVERY_FAILED')),
    performed_by INT REFERENCES users(id) ON DELETE SET NULL,
    old_state    JSONB,
    new_state    JSONB,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Indexing strategy (B-Tree + composite). The vector (HNSW) index lives in 04.
-- ============================================================================
CREATE INDEX idx_camps_zone            ON relief_camps(zone_id);
CREATE INDEX idx_inventory_category    ON warehouse_inventory(category_id);
CREATE INDEX idx_requests_camp_status  ON relief_requests(camp_id, status);
CREATE INDEX idx_requests_urgency      ON relief_requests(urgency_level, status);
CREATE INDEX idx_sos_zone_status       ON emergency_sos_signals(zone_id, status);
CREATE INDEX idx_shipments_vehicle     ON dispatch_shipments(vehicle_id);
CREATE INDEX idx_shipments_request     ON dispatch_shipments(request_id);
CREATE INDEX idx_audit_entity          ON allocation_audit_log(entity_name, entity_id);
CREATE INDEX idx_audit_time            ON allocation_audit_log(timestamp DESC);

-- DDL demonstration: schema evolution via ALTER TABLE
ALTER TABLE relief_camps       ADD COLUMN IF NOT EXISTS requires_cold_storage BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dispatch_shipments ADD COLUMN IF NOT EXISTS carbon_footprint_kg   DECIMAL(9, 2) NOT NULL DEFAULT 0.00;
