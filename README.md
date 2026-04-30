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

- **API Backend:** [movie-booking-backend-8r8x.onrender.com](https://movie-booking-backend-8r8x.onrender.com/api/health)
- **API Docs (Swagger UI):** [movie-booking-backend-8r8x.onrender.com/docs](https://movie-booking-backend-8r8x.onrender.com/docs)
- **DB Health Check:** [/api/health/db](https://movie-booking-backend-8r8x.onrender.com/api/health/db)
- Frontend: coming soon

> Note: backend runs on Render's free tier, which sleeps after 15 minutes of inactivity. First request after a sleep takes ~30 seconds to wake up.

## Running locally

Instructions will be added in Phase 2.

## Status

Under active development. See [`DECISIONS.md`](./DECISIONS.md) for architectural decisions.
