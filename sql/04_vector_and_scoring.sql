-- ============================================================================
-- ReliefChain
-- File   : sql/04_vector_and_scoring.sql
-- Owner  : Member 2 (Full-Stack & NoSQL/Vector Specialist)
-- Purpose: Vector-database layer (pgvector) + camp urgency scoring function.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- 1. 384-dimensional semantic embedding of each SOS message.
--    Filled in by the application (src/lib/vector/semantic.ts) on insert;
--    seeded rows are back-filled automatically the first time the API runs.
-- ----------------------------------------------------------------------------
ALTER TABLE emergency_sos_signals
    ADD COLUMN IF NOT EXISTS embedding vector(384);

-- ----------------------------------------------------------------------------
-- 2. HNSW approximate-nearest-neighbour index on cosine distance.
--    Lets `ORDER BY embedding <=> $query LIMIT k` skip a full table scan.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sos_embedding_hnsw
    ON emergency_sos_signals USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ----------------------------------------------------------------------------
-- 3. Stored function: camp urgency priority score (0 - 100)
--      occupancy ratio        -> up to 40 points
--      zone severity          -> 5 / 15 / 25 / 35 points
--      pending CRITICAL needs -> 5 points each
--      unresolved SOS in zone -> 2 points each (max 10)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calculate_camp_urgency_score(p_camp_id INT)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_occupancy_pts DECIMAL(6, 2);
    v_severity      VARCHAR(20);
    v_zone_id       INT;
    v_severity_pts  DECIMAL(5, 2);
    v_critical_pts  DECIMAL(6, 2);
    v_sos_pts       DECIMAL(5, 2);
BEGIN
    SELECT LEAST(c.current_occupancy::DECIMAL / NULLIF(c.capacity, 0), 1.0) * 40.0, z.severity_level, z.id
    INTO v_occupancy_pts, v_severity, v_zone_id
    FROM relief_camps c
    JOIN disaster_zones z ON z.id = c.zone_id
    WHERE c.id = p_camp_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_severity_pts := CASE v_severity
        WHEN 'CRITICAL' THEN 35.0
        WHEN 'HIGH'     THEN 25.0
        WHEN 'MODERATE' THEN 15.0
        ELSE 5.0 END;

    SELECT COUNT(*) * 5.0 INTO v_critical_pts
    FROM relief_requests
    WHERE camp_id = p_camp_id AND urgency_level = 'CRITICAL' AND status = 'PENDING';

    SELECT LEAST(COUNT(*) * 2.0, 10.0) INTO v_sos_pts
    FROM emergency_sos_signals
    WHERE zone_id = v_zone_id AND status = 'UNRESOLVED';

    RETURN LEAST(100.00, COALESCE(v_occupancy_pts, 0) + v_severity_pts + v_critical_pts + v_sos_pts);
END;
$$ LANGUAGE plpgsql STABLE;
