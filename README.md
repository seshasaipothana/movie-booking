# Movie Booking

A real-time movie ticket booking application. Users browse showtimes, pick seats with live availability updates, and pay via Stripe (test mode).

## Stack

**Backend**
- Python 3.12, FastAPI, SQLAlchemy 2 (async), asyncpg, Alembic
- PostgreSQL (Neon), Redis (Render)
- `uv` for package management, `ruff` for lint + format

**Frontend**
- React + Vite + TypeScript (strict mode)
- ESLint + Prettier

**Real-time & payments**
- WebSockets (native FastAPI)
- Stripe in test mode

**Deploy**
- Backend: Render
- Frontend: Vercel
- Auto-deploy on push to `main`

## Live

- Frontend: (coming soon)
- Backend: (coming soon)

## Running locally

Instructions will be added in Phase 2.

## Status

Under active development. See [`DECISIONS.md`](./DECISIONS.md) for architectural decisions.
