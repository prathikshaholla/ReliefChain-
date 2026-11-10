// ============================================================================
// GET  /api/camps - camps ranked by urgency score + deficit matrix view
// POST /api/camps - register a new relief camp (ADMIN)
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { query } from '@/lib/db/postgres';
import { HttpError, ok, oneOf, posInt, readJson, reqString, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const CAMP_TYPES = ['TEMPORARY_SHELTER', 'FIELD_HOSPITAL', 'TRANSIT_CAMP', 'DISTRIBUTION_HUB'] as const;

export const GET = route(async (req) => {
  requireUser(req);

  const [camps, deficits] = await Promise.all([
    query(`
      SELECT c.id, c.name, c.camp_type, c.contact_person, c.contact_phone, c.latitude, c.longitude,
             c.capacity, c.current_occupancy, c.status, c.created_at,
             z.id AS zone_id, z.name AS zone_name, z.severity_level,
             ROUND(c.current_occupancy::DECIMAL / NULLIF(c.capacity, 0) * 100, 1) AS occupancy_pct,
             fn_calculate_camp_urgency_score(c.id) AS urgency_score
      FROM relief_camps c
      JOIN disaster_zones z ON z.id = c.zone_id
      ORDER BY urgency_score DESC NULLS LAST, c.id
    `),
    query(`SELECT * FROM v_camp_deficit_matrix ORDER BY unfulfilled_deficit DESC, camp_id`),
  ]);

  return ok({ camps: camps.rows, deficits: deficits.rows });
});

export const POST = route(async (req) => {
  requireUser(req, 'createCamp');
  const body = await readJson(req);

  const zoneId = posInt(body.zoneId, 'zoneId');
  const capacity = posInt(body.capacity, 'capacity');
  const occupancy = body.currentOccupancy ? Number(body.currentOccupancy) : 0;
  if (!Number.isInteger(occupancy) || occupancy < 0) throw new HttpError(400, 'currentOccupancy must be 0 or more');

  // Coordinates default to the zone centre when not supplied
  const res = await query(
    `INSERT INTO relief_camps (zone_id, name, camp_type, contact_person, contact_phone,
                               latitude, longitude, capacity, current_occupancy)
     SELECT z.id, $2, $3, $4, $5, COALESCE($6, z.latitude), COALESCE($7, z.longitude), $8, $9
     FROM disaster_zones z WHERE z.id = $1
     RETURNING *`,
    [
      zoneId,
      reqString(body.name, 'name', 150),
      oneOf(body.campType, CAMP_TYPES, 'campType', 'TEMPORARY_SHELTER'),
      reqString(body.contactPerson, 'contactPerson', 100),
      reqString(body.contactPhone, 'contactPhone', 20),
      body.latitude ?? null,
      body.longitude ?? null,
      capacity,
      occupancy,
    ]
  );
  if (res.rowCount === 0) throw new HttpError(400, `Disaster zone ${zoneId} does not exist`);

  return ok({ camp: res.rows[0] }, 201);
});
