# ReliefChain

**Disaster Relief Resource Allocation & Routing System**

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![pgvector](https://img.shields.io/badge/pgvector-HNSW-orange)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47a248)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed)

After a cyclone, flood or landslide, relief coordinators need to answer four questions quickly: which camp needs what, which depot can supply it, which vehicle can carry it, and which SOS messages describe the same need. ReliefChain answers them with three database paradigms working together in one Next.js application.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Database Design](#database-design)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Demo Accounts and Roles](#demo-accounts-and-roles)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Demo Walkthrough](#demo-walkthrough)
- [Troubleshooting](#troubleshooting)
- [Team](#team)

---

## Features

- **Safe dispatch.** A stored procedure locks the request, inventory and vehicle rows, checks demand, stock and payload, reserves stock, creates the shipment and manifest, and writes an audit row. Any failed check rolls the whole transaction back.
- **Nearest depot ranking.** Depots with stock are ranked by Haversine distance to the requesting camp.
- **Automatic stock accounting.** Triggers free the vehicle and release reserved stock on delivery. A failed delivery returns stock to the depot and re-opens the request.
- **Semantic SOS search.** Emergency calls are embedded as 384-dimension vectors and matched by cosine distance, so "insulin for diabetic elderly" finds similar calls even when the wording differs.
- **Drone and incident reports.** Telemetry with varying sensor payloads (thermal, multispectral, LiDAR) is stored in MongoDB and summarised with a 4-stage aggregation pipeline over an adjustable time window.
- **Role-based access.** JWT authentication with three roles; permissions are enforced by the API, not only hidden in the UI.
- **Audit trail.** Every API write records the acting user, shown as Recent activity on the Overview page.
- **SQL Lab.** An ADMIN-only, read-only query endpoint with presets covering joins, GROUP BY/HAVING, subqueries, window functions, views, pgvector, JSONB and EXPLAIN ANALYZE.

## Architecture

```
                 ┌───────────────────────────────┐
  Browser  ───►  │  Next.js 15 (React 19, TS)    │
                 │  UI pages + REST route handlers│
                 └───────┬───────────────┬───────┘
                         │               │
              ┌──────────▼─────────┐  ┌──▼──────────────┐
              │ PostgreSQL 16      │  │ MongoDB 7       │
              │ relational tables, │  │ drone telemetry,│
              │ views, triggers,   │  │ incident feed,  │
              │ pgvector + HNSW    │  │ aggregation     │
              └────────────────────┘  └─────────────────┘
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | Next.js route handlers (`src/app/api`) |
| Authentication | JWT, bcrypt, role-based access control |
| Relational database | PostgreSQL 16 |
| Vector search | pgvector (384 dimensions, HNSW index, cosine distance) |
| Document database | MongoDB 7 |
| Tooling | Docker Compose, Node.js 18.18+, npm scripts |

## Database Design

### PostgreSQL 16 (relational)

- 12 tables, 4 views, a dispatch stored procedure, several functions, 5 triggers and an audit log.
- `sp_process_resource_dispatch` performs a dispatch in one transaction using `FOR UPDATE` row locks.
- `fn_find_nearest_warehouse_with_stock` ranks depots by Haversine distance.
- `trg_shipment_delivery` handles delivered and failed shipments.
- `fn_current_app_user()` reads `app.user_id`, set by every API write, so audit rows record who acted.
- Views pre-aggregate child tables before joining to avoid row fan-out.
- Business rules live in CHECK constraints, triggers and the procedure, so they hold even for writes that bypass the API.

Stock flow:

```
available ──(dispatch)──► reserved ──(delivered)──► removed
                              └────(failed)───────► available
```

### pgvector (same PostgreSQL database)

- A `vector(384)` embedding column on emergency calls with an HNSW index.
- Cosine search with `ORDER BY embedding <=> $1`.
- Recording a call embeds and classifies it in a single step.

### MongoDB 7 (document)

- `drone_recon_telemetry`: survey records whose sensor payloads differ per sensor type.
- `incident_event_feed`: field incident events.
- The drone survey summary uses `$match` → `$group` → `$project` → `$sort`.

The entity-relationship diagram is in [`E R diagram.png`](./E%20R%20diagram.png).

## Getting Started

### Prerequisites

- Node.js 18.18 or newer
- Docker Desktop (running)

### Setup

```bash
git clone https://github.com/prathikshaholla/ReliefChain-.git
cd ReliefChain-

npm install
cp .env.example .env.local        # Windows PowerShell: copy .env.example .env.local
docker compose up -d              # Postgres runs sql/01..05 automatically on first start
npm run db:seed-mongo             # load drone telemetry and the incident feed
npm run dev                       # http://localhost:3000
```

Check that both databases are reachable and seeded:

```bash
npm run test:connections
```

### If ports 5432 or 27017 are already in use

```bash
POSTGRES_PORT=5433 docker compose up -d
```

Then set this in `.env.local`:

```
DATABASE_URL=postgresql://relief_admin:relief_secret_password@localhost:5433/reliefchain_db
```

> The credentials in `.env.example` and the demo accounts below are for local demonstration only. Change them before any real deployment.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm run db:setup` | Re-run `sql/01..05` against `DATABASE_URL` (drops and rebuilds everything) |
| `npm run db:seed-mongo` | Re-seed MongoDB; timestamps are relative to now, so re-run before a demo |
| `npm run db:reset` | `db:setup` and `db:seed-mongo` together |
| `npm run test:connections` | Check both databases are reachable and seeded |
| `npm run test:smoke` | 46 end-to-end API checks against a running app (run `db:reset` afterwards) |
| `docker compose down -v` | Stop and wipe both databases |

## Demo Accounts and Roles

The sign-in screen has one-click role buttons, and the header's "Signed in as" menu switches accounts.

| Role | Email | Password | Pages | Capabilities |
| --- | --- | --- | --- | --- |
| `ADMIN` (Relief Coordinator) | admin@reliefchain.org | admin123 | All six | Everything, including camp registration and SQL Lab |
| `LOGISTICS_STAFF` (Logistics Officer) | logistics@reliefchain.org | logistics123 | Overview, Supplies & Shipments, Warehouse Stock, Relief Camps | Dispatch, mark shipments delivered or failed, add stock |
| `FIRST_RESPONDER` (Field Officer) | responder@reliefchain.org | responder123 | Overview, Emergency Calls, Supplies & Shipments, Relief Camps, Field Reports | Record calls, raise requests, confirm deliveries, report incidents |

Permissions are defined in `src/lib/permissions.ts` and enforced by the API.

## API Overview

Route groups live under `src/app/api`:

| Area | Route groups |
| --- | --- |
| Core operations | `dashboard`, `camps`, `requests`, `inventory`, `dispatch`, `auth` |
| Emergency and field data | `sos`, `semantic-search`, `telemetry` |
| Administration | `sql-lab` |

`/api/sql-lab` has two methods:

- `GET` lists the query presets.
- `POST` runs a single statement in a `READ ONLY` transaction with a 5-second timeout (ADMIN only).

## Project Structure

```
.
├── sql/
│   ├── 01_schema.sql                    tables, constraints, indexes
│   ├── 02_views.sql                     analytical views
│   ├── 03_procedures_and_triggers.sql   dispatch procedure, Haversine, triggers
│   ├── 04_vector_and_scoring.sql        pgvector column, HNSW index, urgency score
│   ├── 05_seed.sql                      demo dataset
│   └── queries/curriculum_queries.sql   DML and query showcase (not auto-run)
├── scripts/                             db-setup, seed-mongo, test-connections, smoke-test
├── src/
│   ├── app/                             pages and API route handlers
│   ├── components/                      UI components
│   └── lib/                             Postgres and Mongo clients, auth, permissions, vector search
├── docker-compose.yml                   PostgreSQL and MongoDB stack
├── E R diagram.png                      entity-relationship diagram
├── .env.example                         environment template
└── package.json
```

## Demo Walkthrough

1. **ACID dispatch.** On Supplies & Shipments, pick a request, choose a ranked depot and a vehicle, and dispatch. An oversized order, or 500 meal cases on a drone, makes the procedure raise, roll back and leave the data unchanged.
2. **Triggers.** Mark a shipment delivered or failed, then open Recent activity on the Overview for the audit trail.
3. **Vector search.** On Emergency Calls, use "Find similar calls" (for example, "insulin for diabetic elderly").
4. **MongoDB.** On Field Reports, the drone summary runs the 4-stage pipeline; changing the time window re-runs it.
5. **SQL Lab (ADMIN).** Explore the presets and run read-only queries.
6. **DML showcase.** Run the curriculum queries inside a transaction that is rolled back:

   ```bash
   docker exec -i reliefchain_postgres psql -U relief_admin -d reliefchain_db < sql/queries/curriculum_queries.sql
   ```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Port 5432 or 27017 already in use | Use `POSTGRES_PORT=5433 docker compose up -d` and update `DATABASE_URL` |
| Telemetry looks empty or stale | Run `npm run db:seed-mongo`; timestamps are relative to the current time |
| Database in a bad state after testing | Run `npm run db:reset` |
| Need a completely clean start | Run `docker compose down -v`, then repeat the setup steps |

## Team

| Member | Role | Owns |
| --- | --- | --- |
| Vishnu Anand | Database architect and core backend | Relational schema, views, dispatch procedure, triggers, seed data, REST APIs, JWT/RBAC, SQL Lab, Docker setup |
| Prathiksha B P | Full-stack, NoSQL and vector search | pgvector and HNSW index, triage engine, MongoDB pipeline and seed script, SOS and telemetry APIs, frontend |

Built for the DBMS Experiential Learning Level 3 course at PES University (instructor: Dr. Nagasundari S).
