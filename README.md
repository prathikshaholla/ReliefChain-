# ReliefChain — Disaster Relief Resource Allocation & Routing System

**DBMS Experiential Learning — Level 3 Project (2-member team)**

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-384--dim-green.svg)](https://github.com/pgvector/pgvector)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-brightgreen.svg)](https://www.mongodb.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

After a cyclone, flood or landslide, relief coordinators have to answer four questions fast:
*which camp needs what, which depot can supply it, which vehicle can carry it, and which of the thousands of panicked SOS messages are about the same need.*
ReliefChain answers them with three database paradigms working together:

| Paradigm | Engine | Used for |
| :-- | :-- | :-- |
| Relational | **PostgreSQL 16** | Camps, depots, inventory, fleet, dispatch — ACID transactions, row locks, triggers, views |
| Vector | **pgvector** | 384-dim embeddings of SOS messages, HNSW index, cosine-distance (`<=>`) search |
| Document | **MongoDB 7** | Drone telemetry with varying sensor payloads, incident feed, aggregation pipeline |

---

## Team

| Member | Role | Owns |
| :-- | :-- | :-- |
| **Vishnu Anand** (Member 1) | Database Architect & Core Backend | Relational schema, views, ACID procedure, Haversine function, triggers, seed data, curriculum queries, DB pool / transaction helper, dashboard · camps · requests · inventory · dispatch APIs, project setup |
| **Prathiksha** (Member 2) | Full-Stack & NoSQL/Vector Specialist | pgvector layer + urgency function, embedding & triage engine, MongoDB + aggregation pipeline, JWT/bcrypt auth & RBAC, all UI, SQL Lab API, Docker Compose, smoke tests |

The file-by-file split is in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Quick start

Prerequisites: **Node.js 18.18+** and **Docker Desktop** (running).

```bash
npm install
cp .env.example .env.local        # Windows PowerShell: copy .env.example .env.local
docker compose up -d              # Postgres runs sql/01..05 automatically on first start
npm run db:seed-mongo             # load drone telemetry + incident feed
npm run dev                       # http://localhost:3000
```

Check everything is wired up with `npm run test:connections`.

> **Port 5432 or 27017 already in use?** (e.g. another Postgres on your machine)
> Start the stack on other ports and point `.env.local` at them:
> ```bash
> POSTGRES_PORT=5433 docker compose up -d          # PowerShell: $env:POSTGRES_PORT=5433; docker compose up -d
> # .env.local -> DATABASE_URL=postgresql://relief_admin:relief_secret_password@localhost:5433/reliefchain_db
> ```

### Useful scripts

| Command | What it does |
| :-- | :-- |
| `npm run db:setup` | Re-run `sql/01..05` against `DATABASE_URL` (drops & rebuilds everything) |
| `npm run db:seed-mongo` | Re-seed MongoDB (timestamps are relative to now — re-run before a demo) |
| `npm run db:reset` | Both of the above |
| `npm run test:connections` | Check both databases are reachable and seeded |
| `npm run test:smoke` | 46 end-to-end API checks against a running app (then `db:reset`) |
| `npm run typecheck` / `npm run build` | TypeScript check / production build |
| `docker compose down -v` | Stop and wipe both databases |

---

## Demo accounts

The sign-in screen has one-click buttons for each role. Once signed in, the **Signed in as** menu in the header switches between the three accounts.

| Role (shown as) | Email / password | Pages | Can |
| :-- | :-- | :-- | :-- |
| `ADMIN` (Relief Coordinator) | `admin@reliefchain.org` / `admin123` | All six | Everything, including registering camps and the SQL Lab API |
| `LOGISTICS_STAFF` (Logistics Officer) | `logistics@reliefchain.org` / `logistics123` | Overview, Supplies & Shipments, Warehouse Stock, Relief Camps | Dispatch, mark shipments delivered/failed, add stock |
| `FIRST_RESPONDER` (Field Officer) | `responder@reliefchain.org` / `responder123` | Overview, Emergency Calls, Supplies & Shipments, Relief Camps, Field Reports | Record emergency calls, raise requests, confirm deliveries, report incidents |

Permissions and page access live in one place, [`src/lib/permissions.ts`](src/lib/permissions.ts), and are enforced by the API (the UI only hides what you can't use).

---

## Evaluator walkthrough

1. **ACID dispatch** — *Supplies & Shipments* page. Pick a request; depots are ranked by `fn_find_nearest_warehouse_with_stock` (Haversine). Pick a vehicle and run it.
   `sp_process_resource_dispatch` locks request → inventory → vehicle (`FOR UPDATE`), validates remaining demand, stock and payload, moves stock to *reserved*, creates the shipment + manifest, dispatches the vehicle and writes the audit row.
   Try sending too much, or 500 meal cases on a drone — the procedure raises, the transaction rolls back, and nothing changes.
2. **Triggers** — click **Mark delivered** on a shipment: `trg_shipment_delivery` frees the vehicle, releases reserved stock and fulfils the request. The **Failed** button returns the stock to the depot and re-opens the request. *Recent activity* on the Overview shows who did it.
3. **Vector search** — *Emergency Calls* page, *Find similar calls*. Search *"insulin for diabetic elderly"*: the query is embedded to 384 dims and ranked with `ORDER BY embedding <=> $1`. Recording a call embeds and classifies it in one step.
4. **MongoDB** — *Field Reports* page. The drone survey summary comes from the 4-stage pipeline (`$match → $group → $project → $sort`) over documents with different sensor payloads (thermal, multispectral, LiDAR). Switch the time window to re-run it.
5. **SQL Lab API** (ADMIN, no page in the UI) — `GET /api/sql-lab` lists presets for joins, GROUP BY/HAVING, scalar & correlated subqueries, window functions, stored functions, views, pgvector, JSONB and `EXPLAIN ANALYZE`; `POST /api/sql-lab` runs one statement in a `READ ONLY` transaction with a 5 s timeout.
6. **DML showcase** — `sql/queries/curriculum_queries.sql` (INSERT / UPDATE / DELETE / procedure CALL inside a transaction that is rolled back):
   `docker exec -i reliefchain_postgres psql -U relief_admin -d reliefchain_db < sql/queries/curriculum_queries.sql`

---

## Architecture

```
                 Next.js 15 (React 19, TypeScript)
     UI (src/components)  ──►  REST route handlers (src/app/api)
                                   │  JWT auth + RBAC (src/lib/auth.ts)
          ┌────────────────────────┼─────────────────────────┐
          ▼                        ▼                         ▼
   PostgreSQL 16             pgvector (same DB)          MongoDB 7
   12 tables, 4 views,       vector(384) + HNSW,         drone_recon_telemetry,
   procedure, functions,     cosine <=> search            incident_event_feed,
   5 triggers, audit log                                  aggregation pipeline
```

Key design decisions:

- **Integrity lives in the database.** Business rules are CHECK constraints, triggers and the dispatch procedure, so they hold even for writes that bypass the API.
- **Who did it?** Every API write runs in a transaction that sets `app.user_id`; triggers read it through `fn_current_app_user()` to attribute audit rows.
- **No fan-out in views.** Child tables are pre-aggregated before joining so totals aren't multiplied.
- **Stock accounting:** `available` → (dispatch) → `reserved` → (delivered) gone / (failed) back to `available`.

## Repository layout

```
sql/
  01_schema.sql                  tables, constraints, indexes                  (Vishnu)
  02_views.sql                   analytical views                              (Vishnu)
  03_procedures_and_triggers.sql dispatch procedure, Haversine, triggers       (Vishnu)
  04_vector_and_scoring.sql      pgvector column, HNSW index, urgency score    (Prathiksha)
  05_seed.sql                    demo dataset                                  (Vishnu)
  queries/curriculum_queries.sql DML + query showcase (not auto-run)           (Vishnu)
scripts/                         db-setup, test-connections (Vishnu) · seed-mongo, smoke-test, convert_docs_to_pdf (Prathiksha)
src/lib/                         db/postgres.ts, http.ts (Vishnu) · auth, permissions, db/mongo, vector/semantic, client/* (Prathiksha)
src/app/api/                     dashboard, camps, requests, inventory, dispatch (Vishnu) · auth, sos, semantic-search, telemetry, sql-lab (Prathiksha)
src/app/, src/components/        UI (Prathiksha)
docs/                            project report (Vishnu) · viva report (Prathiksha)
docker-compose.yml               database stack (Prathiksha)
```
