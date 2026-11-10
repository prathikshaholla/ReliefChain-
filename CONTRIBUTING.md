# Contributing & ownership

ReliefChain is built by two people, and every file has exactly one owner.
No file belongs to both of us, so we never edit the same file and never hit merge conflicts.

## Who owns what

### Vishnu Anand — Member 1, Database Architect & Core Backend

| Area | Files |
| :-- | :-- |
| Relational schema | `sql/01_schema.sql` |
| Views | `sql/02_views.sql` |
| Procedure, functions, triggers | `sql/03_procedures_and_triggers.sql` |
| Seed data | `sql/05_seed.sql` |
| Curriculum DML/queries | `sql/queries/curriculum_queries.sql` |
| DB access layer | `src/lib/db/postgres.ts`, `src/lib/http.ts` |
| Core APIs | `src/app/api/dashboard/`, `camps/`, `requests/`, `inventory/`, `dispatch/` (incl. `dispatch/[id]/status/`) |
| DB scripts | `scripts/load-env.mjs`, `scripts/db-setup.mjs`, `scripts/test-connections.mjs` |
| Project setup | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.js`, `next-env.d.ts`, `.gitignore`, `.env.example`, `README.md`, `CONTRIBUTING.md` |
| Report | `docs/DBMS_Level3_Project_Report_ReliefChain.md` / `.pdf` |

### Prathiksha — Member 2, Full-Stack & NoSQL/Vector Specialist

| Area | Files |
| :-- | :-- |
| Vector layer + urgency score | `sql/04_vector_and_scoring.sql` |
| Embedding & triage engine | `src/lib/vector/semantic.ts` |
| MongoDB | `src/lib/db/mongo.ts`, `scripts/seed-mongo.mjs` |
| Auth & RBAC | `src/lib/auth.ts`, `src/lib/permissions.ts`, `src/app/api/auth/` |
| Vector / NoSQL / Lab APIs | `src/app/api/sos/`, `semantic-search/`, `telemetry/`, `sql-lab/` |
| Frontend | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/components/**`, `src/lib/client/**` |
| Infrastructure & tests | `docker-compose.yml`, `scripts/smoke-test.mjs`, `scripts/convert_docs_to_pdf.py` |
| Report | `docs/DBMS_Level3_Comprehensive_Viva_Report.md` / `.pdf` |

### Where the two halves meet

The app only runs with both halves present. These are the contact points:

- Prathiksha's API routes use Vishnu's `query()` / `withTransaction()` (`src/lib/db/postgres.ts`) and the `route()` / `ok()` helpers (`src/lib/http.ts`).
- Vishnu's API routes use Prathiksha's `requireUser()` (`src/lib/auth.ts`) for RBAC.
- `fn_calculate_camp_urgency_score` (Prathiksha, `04`) is called by Vishnu's `/api/camps`.
- `docker-compose.yml` (Prathiksha) mounts the whole `sql/` folder, so it runs both people's SQL files in order: `01 → 02 → 03 → 04 → 05`.

## Publishing to GitHub (each of us as our own contributor)

Each of us gets a zip that holds only our own files, inside a top-level `reliefchain/` folder. Extracted into the same place, the two halves merge into one folder with no overlaps.

**1. Vishnu creates the repository and pushes first**

```bash
# create an empty repo on GitHub (no README / .gitignore), e.g. reliefchain
# extract Vishnu_ReliefChain.zip -> you get a folder called reliefchain/
cd reliefchain
git init -b main
git config user.name  "Vishnu Anand"
git config user.email "<vishnu's GitHub email>"
git add .
git commit -m "Relational schema, views, ACID dispatch procedure, triggers, seed data and core APIs"
git remote add origin https://github.com/<vishnu-username>/reliefchain.git
git push -u origin main
```

Then on GitHub go to **Settings → Collaborators** and add Prathiksha.

**2. Prathiksha clones and pushes her half**

```bash
git clone https://github.com/<vishnu-username>/reliefchain.git
# extract Prathiksha_ReliefChain.zip into the SAME parent folder as the clone,
# so its reliefchain/ merges into the cloned reliefchain/ (it only adds files)
cd reliefchain
git status          # should list only Prathiksha's files as new
git config user.name  "Prathiksha"
git config user.email "<prathiksha's GitHub email>"
git add .
git commit -m "pgvector triage engine, MongoDB telemetry, JWT auth & RBAC, portal UI, SQL Lab API, Docker stack"
git push
```

> Commits count toward your GitHub profile only if `user.email` matches an email on your GitHub account.

**3. Both: run it** — follow *Quick start* in the README. Until step 2 is pushed the repo is only half the app, so it won't build yet. That's expected.

## Working on it afterwards

- Make changes on a branch (`git switch -c feature/xyz`) and open a pull request so the other person can review.
- Only edit files you own. If you need something changed in the other person's file, ask them, or say so clearly in your PR.
- Before pushing: `npm run typecheck`, and `npm run test:smoke` with the app running.
