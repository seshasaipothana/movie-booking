# Decisions Log

A running log of architectural and product decisions for this project.
Each entry: what we chose, what we rejected, why.

---

## 2026-04-23 — Project scope

**Decision:** Build an MVP movie booking app with one city, 2 cinemas, 3 screens total.

**Rejected:**
- BookMyShow-scale multi-city app — too big for the 2-week timeline.
- Single cinema — too small, doesn't exercise the data model or the "pick a cinema" UX.

**Why:** Sweet spot of realistic-looking vs. achievable. Two cinemas means the data model has a real `cinemas` table with FKs and the UI has a meaningful filter/selection step.

---

## 2026-04-23 — No admin panel

**Decision:** Seed data via a Python script (`seed.py`); no admin UI.

**Rejected:** Full admin panel with admin auth + CRUD forms for movies, cinemas, showtimes.

**Why:** An admin panel is effectively a second app (admin auth, admin UI, forms). It doubles frontend work and doesn't strengthen the interview story — nobody's impressed by a CRUD form. A seed script is a small positive signal on its own and keeps the focus on the interesting parts (seat locking, real-time, payments).

---

## 2026-04-23 — No waiting-room / queue feature

**Decision:** Don't build a queueing system that holds users back during surges.

**Rejected:** "If time permits" queue feature.

**Why:** "If time permits" features rarely ship on tight timelines, and an unfinished feature is worse than an absent one. The seat-holding logic already carries enough real-time complexity to tell a strong story.

---

## 2026-04-23 — Stack

**Decision:** 
- **Backend:** FastAPI + SQLAlchemy 2 (async) + Alembic + asyncpg
- **Database:** PostgreSQL 16 on Neon (already set up)
- **Cache / locks / pub-sub:** Redis on Render (already set up)
- **Frontend:** React + Vite + TypeScript
- **Real-time:** WebSockets (FastAPI native)
- **Payments:** Stripe in test mode
- **Auth:** JWT
- **Deploy:** Backend on Render/Railway, frontend on Vercel

**Rejected:**
- **Django** — async story is less clean; WebSockets and async DB are first-class in FastAPI.
- **MySQL** — weaker concurrency primitives for our locking needs.
- **MongoDB** — booking data is deeply relational; a document DB is the wrong fit.
- **SQLite** — doesn't handle real concurrent writes, which is exactly what we're showcasing.
- **Postgres-only seat locking (no Redis)** — valid, but the Redis story is stronger on a resume and cleaner for real-time broadcasting.

**Why:** Strongest interview narrative (async Python, WebSockets, distributed locking with Redis, Stripe integration) for the effort involved.

---

## 2026-04-23 — Start fresh, old project as reference only

**Decision:** Build a new project from scratch rather than continuing the half-built one.

**Rejected:** Auditing and continuing the old codebase.

**Why:** Half the old code was written by Codex and I don't recall what's there. For a resume project whose whole purpose is "I can explain every line in an interview," building on code I don't understand is a liability. The old project can still serve as a reference ("how did I set up auth before?") but the new one is what goes on the resume.

---

## 2026-04-23 — Working style: pair programmer with tutor moments

**Decision:** I drive the keyboard; Claude explains and reviews. On interesting topics (seat locking, WebSockets, Stripe webhooks, auth) we go slow — concept → my attempt → critique → discuss trade-offs → I type the code. Boring setup (imports, config) can be copy-pasted.

**Rejected:**
- Pure copy-paste mode — produces a project I can't defend in interviews.
- Pure tutor mode — too slow for a 2-week timeline.

**Why:** The whole point of this project is interview readiness. Every non-trivial line needs to be something I can walk through and justify. The decisions log (this file) is the backbone of that — every meaningful choice gets written down here as it's made.

---

## 2026-04-23 — Schema: 9 tables

**Decision:** The schema uses nine tables: `users`, `cinemas`, `screens`, `seats`, `movies`, `showtimes`, `bookings`, `booking_seats`, `payments`.

**Rejected:**
- A minimal 5-table schema (`users`, `movies`, `screens`, `seats`, `bookings`) — missing `cinemas` (no way to group screens), `showtimes` (no way to represent a specific screening), `booking_seats` (no way to link one booking to multiple seats), and `payments` (payment lifecycle is distinct from booking lifecycle).

**Why:**
- A row in each table has a crisp, one-sentence definition (users are people, showtimes are scheduled screenings, etc.). If a table can't be defined in one sentence, it shouldn't exist.
- Bookings are one-to-many with seats (one booking covers multiple seats), which requires a junction table.
- Payments have their own lifecycle (pending → succeeded → failed) and external identifiers (Stripe intent ID), so separating them from bookings keeps each concern clean.

---

## 2026-04-23 — Seats as rows, not JSON

**Decision:** Store each seat as its own row in a `seats` table, with `screen_id` as a foreign key. Not as a JSON array on `screens`.

**Rejected:** `screens.seats` as a JSON column like `["A1", "A2", "A3", ...]`.

**Why:**
- **Foreign keys need to point somewhere.** `booking_seats` needs to reference individual seats via FK. Foreign keys must reference a column in a real table — they can't point into a JSON array. Without real rows with IDs, seats are unreferenceable.
- **Row-level locking requires real rows.** `SELECT FOR UPDATE` can lock a single seat row, so two users trying to book the same seat are resolved cleanly. With a JSON array, you'd have to lock the entire `screens` row to book one seat — a massive concurrency hit and a classic read-modify-write bug risk.
- **Indexing and querying need real columns.** "Find all seats in row A" or "find all wheelchair-accessible seats" is a fast indexed query against rows; against JSON it's a scan.
- **Schema evolution.** Adding a column like `is_wheelchair_accessible` is trivial with rows; with JSON every `screens` row has to be parsed, updated, and rewritten.
- **Database-enforced integrity.** An FK from `booking_seats.seat_id` to `seats.id` means "you cannot book a seat that doesn't exist" is enforced by the database. With JSON, a seat identifier is just a string — nothing stops bad data.

**Mental rule:** If something needs to be referenced from other tables, or counted, or locked, or filtered — it's a row, not a JSON blob. JSON columns are for attributes *of* an entity, not for the entities themselves.

---

## 2026-04-23 — Foreign key direction

**Decision:** The foreign key column lives on the "many" side of a one-to-many relationship. `screens.cinema_id` references `cinemas.id`; `bookings.user_id` references `users.id`; `booking_seats.booking_id` references `bookings.id`; etc.

**Rejected:** Putting the FK on the "one" side (e.g., `cinemas.screen_id`).

**Why:** The "one" side can only hold a single reference per row. If `cinemas` held `screen_id`, a cinema with two screens would have to be duplicated across two rows — breaking the "one row per entity" rule and causing update anomalies (renaming a cinema would require updating N rows). Putting the FK on the "many" side means each child row points at its single parent, and the parent table stays clean — one row per real entity.