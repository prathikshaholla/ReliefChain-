-- ============================================================================
-- ReliefChain
-- File   : sql/05_seed.sql
-- Owner  : Member 1 (Database Architect & Core Backend)
-- Purpose: Consistent demo dataset.
--
-- Consistency rule: warehouse_inventory.reserved_quantity equals the units on
-- shipments still on the road, and relief_requests.approved_quantity equals
-- the units already allocated to shipments. The triggers rely on this.
-- ============================================================================

-- 1. Disaster zones
INSERT INTO disaster_zones (id, name, disaster_type, severity_level, latitude, longitude, radius_km, estimated_affected_pop, status) VALUES
(1, 'Coastal Sector Alpha - Bay of Bengal', 'CYCLONE',   'CRITICAL', 13.0827, 80.2707, 35.0, 450000, 'ACTIVE'),
(2, 'Cauvery Basin Riverine Flood Zone',    'FLOOD',     'HIGH',     12.9716, 77.5946, 25.0, 180000, 'ACTIVE'),
(3, 'Nilgiri Foothills Landslide Sector',   'LANDSLIDE', 'HIGH',     11.4102, 76.6950, 15.0,  65000, 'ACTIVE');

-- 2. Users - real bcrypt hashes (cost 10) of admin123 / logistics123 / responder123
INSERT INTO users (id, email, password_hash, full_name, role, phone, assigned_zone_id) VALUES
(1, 'admin@reliefchain.org',     '$2a$10$nrd5HRlVxFWFZd6hfbSNUeBELS3A1Ch3/CD99tSb1XNc5pAXUZRNm', 'Dr. Radhakrishnan (Disaster Coordinator)', 'ADMIN',           '+91-9876543210', 1),
(2, 'logistics@reliefchain.org', '$2a$10$rlpCyX9/3AxEKClgFu1PAeguVu6n00Swe4zCBRqvN6Omt0YbbC8mG', 'Capt. Vikram Singh (Logistics Lead)',      'LOGISTICS_STAFF', '+91-9876543211', 1),
(3, 'responder@reliefchain.org', '$2a$10$o/jF8zwdka2vYOPAkmgT9.VY9TBwDpjPegJsK7p1TRFeSgfTXoibC', 'Ananya Sharma (Field Triage Officer)',     'FIRST_RESPONDER', '+91-9876543212', 2);

-- 3. Relief camps
INSERT INTO relief_camps (id, zone_id, name, camp_type, contact_person, contact_phone, latitude, longitude, capacity, current_occupancy, status) VALUES
(1, 1, 'Marina Beach Community Shelter Alpha', 'TEMPORARY_SHELTER', 'Praveen Kumar',          '+91-9988776655', 13.0475, 80.2824, 1200, 980, 'OPERATIONAL'),
(2, 1, 'St. Jude Portside Field Hospital',     'FIELD_HOSPITAL',    'Dr. Meenakshi Sundaram', '+91-9988776656', 13.1000, 80.2900,  400, 360, 'OPERATIONAL'),
(3, 2, 'Cauvery Basin Relief Hub 4',           'DISTRIBUTION_HUB',  'Rajesh Gowda',           '+91-9988776657', 12.9350, 77.6100,  800, 720, 'OPERATIONAL'),
(4, 3, 'Wayanad Ridge Transit Shelter',        'TRANSIT_CAMP',      'Sunil Nambiar',          '+91-9988776658', 11.4500, 76.7200,  500, 480, 'OPERATIONAL');

-- 4. Warehouses
INSERT INTO warehouses (id, name, location_name, latitude, longitude, capacity_sqft, manager_id, is_operational) VALUES
(1, 'Central Depository North',         'Chennai Port Industrial Zone',          13.1250, 80.2600, 50000, 2, TRUE),
(2, 'Southern Inland Logistics Depot',  'Bangalore Electronic City Staging Hub', 12.8450, 77.6600, 45000, 2, TRUE),
(3, 'Highland Emergency Staging Depot', 'Coimbatore Western Depot',              11.0168, 76.9558, 30000, 2, TRUE);

-- 5. Resource categories
INSERT INTO resource_categories (id, code, name, category_group, unit_of_measure, is_perishable, weight_kg_per_unit, priority_rank) VALUES
(1, 'WAT-01', 'Potable Drinking Water (20L Cans)',                  'FOOD_WATER',      'Cans',  FALSE, 20.0, 1),
(2, 'MED-01', 'Emergency Trauma Surgical Kit',                      'MEDICAL',         'Kits',  FALSE,  5.0, 1),
(3, 'MED-02', 'Insulin & Chronic Care Medicines Box',               'MEDICAL',         'Boxes', TRUE,   2.5, 1),
(4, 'FOD-01', 'High-Protein MRE Meal Ration (Case of 24)',          'FOOD_WATER',      'Cases', FALSE, 12.0, 2),
(5, 'SHL-01', 'All-Weather 6-Person Relief Tents',                  'SHELTER',         'Tents', FALSE, 18.0, 2),
(6, 'PWR-01', 'Solar Emergency Power Generator 5kW',                'POWER_EQUIPMENT', 'Units', FALSE, 45.0, 2),
(7, 'HYG-01', 'Water Purification & Sanitation Pack (1000 Tablets)', 'HYGIENE',        'Packs', FALSE,  1.2, 3),
(8, 'SHL-02', 'Thermal Wool Blankets (Pack of 10)',                 'SHELTER',         'Packs', FALSE,  8.0, 3);

-- 6. Warehouse inventory (reserved = 600 cans of water on shipment #1 only)
INSERT INTO warehouse_inventory (warehouse_id, category_id, available_quantity, reserved_quantity, minimum_threshold) VALUES
(1, 1, 1400, 600, 300), (1, 2,  250, 0,  50), (1, 3,  120, 0,  30), (1, 4, 1800, 0, 400),
(1, 5,  300,   0,  50), (1, 6,   40, 0,  10), (1, 7,  800, 0, 200), (1, 8,  950, 0, 200),
(2, 1, 2500,   0, 500), (2, 2,  400, 0,  80), (2, 3,  300, 0,  50), (2, 4, 3500, 0, 600),
(2, 5,  600,   0, 100), (2, 6,   80, 0,  20), (2, 7, 1500, 0, 300), (2, 8, 1800, 0, 300),
(3, 1,  900,   0, 200), (3, 2,  150, 0,  30), (3, 3,   80, 0,  20), (3, 4, 1200, 0, 250),
(3, 5,  200,   0,  40), (3, 6,   25, 0,   5), (3, 7,  500, 0, 100), (3, 8,  600, 0, 150);

-- 7. Vehicle fleet
INSERT INTO vehicle_fleet (id, vehicle_number, vehicle_type, max_payload_kg, current_latitude, current_longitude, home_warehouse_id, status) VALUES
(1, 'TN-01-RC-9010',  'HEAVY_TRUCK',       12000.0, 13.1250, 80.2600, 1, 'IN_TRANSIT'),
(2, 'TN-01-RC-4022',  'LIGHT_TRUCK',        3500.0, 13.1250, 80.2600, 1, 'AVAILABLE'),
(3, 'KA-05-RC-8811',  'HEAVY_TRUCK',       14000.0, 12.8450, 77.6600, 2, 'AVAILABLE'),
(4, 'KA-05-RC-3319',  'LIGHT_TRUCK',        4000.0, 12.8450, 77.6600, 2, 'AVAILABLE'),
(5, 'DR-01-AERO-99',  'DRONE_FLEET',         120.0, 13.0827, 80.2707, 1, 'AVAILABLE'),
(6, 'AMPH-02-NAVY',   'AMPHIBIOUS_BOAT',    2000.0, 13.0475, 80.2824, 1, 'AVAILABLE'),
(7, 'HELI-04-RESCUE', 'RESCUE_HELICOPTER',  4500.0, 12.9716, 77.5946, 2, 'AVAILABLE');

-- 8. Relief requests (approved_quantity = units already on a shipment)
INSERT INTO relief_requests (id, camp_id, category_id, requested_quantity, approved_quantity, urgency_level, status, notes) VALUES
(1, 1, 1, 600, 600, 'CRITICAL', 'DISPATCHED', 'Urgent potable water for 980 evacuated coastal residents'),
(2, 1, 2,  40,   0, 'CRITICAL', 'APPROVED',   'Trauma kits needed after secondary storm surge injuries'),
(3, 2, 3,  50,   0, 'CRITICAL', 'PENDING',    'Insulin supplies expiring; 35 diabetic seniors in triage ward'),
(4, 2, 7, 200,   0, 'HIGH',     'PENDING',    'Water purification tablets for nearby marooned sub-settlements'),
(5, 3, 4, 500,   0, 'HIGH',     'PENDING',    'Food rations running low; road access partially reopened'),
(6, 4, 5,  80,   0, 'MEDIUM',   'PENDING',    'Weatherproof tents for incoming landslide evacuees');

-- 9. One shipment already on the road (600 cans x 20 kg = 12,000 kg on the 12 t heavy truck)
INSERT INTO dispatch_shipments (id, tracking_code, request_id, warehouse_id, vehicle_id, dispatched_by, departure_time, estimated_arrival, delivery_status, route_distance_km, delivery_notes) VALUES
(1, 'RC-20261031-1000', 1, 1, 1, 2, CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '2 hours', 'IN_TRANSIT', 8.89, 'Priority corridor clearance escorted by traffic police');

INSERT INTO dispatch_items (shipment_id, category_id, quantity_loaded) VALUES (1, 1, 600);

-- 10. SOS signals (embeddings are back-filled by the application on first use)
INSERT INTO emergency_sos_signals (id, zone_id, sender_name, sender_phone, latitude, longitude, victim_count, raw_message, detected_urgency, matched_category_id, status) VALUES
(1, 1, 'Karthik Ramanathan', '+91-9444123456', 13.0612, 80.2789, 14, 'Water level reached second floor. 4 children and 2 elderly trapped without drinking water or dry food.', 'CRITICAL', 1, 'UNRESOLVED'),
(2, 1, 'Deepa Mohan',        '+91-9444987654', 13.0911, 80.2941,  6, 'Severe hypothermia and open fractures after roof collapse. Need emergency trauma doctor and splints immediately.', 'CRITICAL', 2, 'UNRESOLVED'),
(3, 2, 'Subhash Chandran',   '+91-9880112233', 12.9811, 77.5890, 22, 'Substation flooded. Need portable solar generators to maintain breathing oxygen concentrators for homebound patients.', 'HIGH', 6, 'UNRESOLVED'),
(4, 3, 'Lakshmi Iyer',       '+91-9443345566', 11.4380, 76.7105,  9, 'Our diabetic grandmother has run out of insulin and the road is blocked by the landslide. Please send medicines.', 'HIGH', 3, 'UNRESOLVED'),
(5, 2, 'Mohammed Farooq',    '+91-9880765432', 12.9602, 77.6011, 30, 'Families sleeping in the open after houses washed away. Children shivering at night, need tents and blankets.', 'HIGH', 5, 'UNRESOLVED');

-- Keep SERIAL sequences ahead of the explicit ids used above
SELECT setval('disaster_zones_id_seq',        (SELECT MAX(id) FROM disaster_zones));
SELECT setval('users_id_seq',                 (SELECT MAX(id) FROM users));
SELECT setval('relief_camps_id_seq',          (SELECT MAX(id) FROM relief_camps));
SELECT setval('warehouses_id_seq',            (SELECT MAX(id) FROM warehouses));
SELECT setval('resource_categories_id_seq',   (SELECT MAX(id) FROM resource_categories));
SELECT setval('warehouse_inventory_id_seq',   (SELECT MAX(id) FROM warehouse_inventory));
SELECT setval('relief_requests_id_seq',       (SELECT MAX(id) FROM relief_requests));
SELECT setval('vehicle_fleet_id_seq',         (SELECT MAX(id) FROM vehicle_fleet));
SELECT setval('dispatch_shipments_id_seq',    (SELECT MAX(id) FROM dispatch_shipments));
SELECT setval('dispatch_items_id_seq',        (SELECT MAX(id) FROM dispatch_items));
SELECT setval('emergency_sos_signals_id_seq', (SELECT MAX(id) FROM emergency_sos_signals));
