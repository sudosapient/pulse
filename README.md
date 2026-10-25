# Pulse — basic uptime checker

Tiny Uptime-Kuma-style demo for exercising SudoOps: three services — **frontend**, **backend**, **db**.

Add a URL, the backend polls it on an interval, and the UI shows up/down + latency history.

## Services

| Service | Role | Port |
|---|---|---|
| `frontend` | React UI (nginx in Docker) | 8080 |
| `backend` | Express API + HTTP checker loop | 4000 |
| `db` | Postgres 16 | 5432 |

## Local (no Docker)

Without `DATABASE_URL`, the backend uses a local JSON file store (`data.json`) so you can develop without Postgres. Compose / Railway still use the real **db** Postgres service.

```bash
cd backend && npm install && npm run dev
# other terminal
cd frontend && npm install && npm run dev
```

Open http://127.0.0.1:5173

## Docker Compose

```bash
docker compose up --build
```

Open http://127.0.0.1:8080

## API

- `GET /api/health`
- `GET /api/monitors`
- `POST /api/monitors` `{ "name", "url", "interval_sec" }`
- `DELETE /api/monitors/:id`
- `GET /api/monitors/:id/checks`

## Railway / SudoOps

Deploy as three services:

1. **Postgres** plugin / database service
2. **backend** from `./backend` with `DATABASE_URL`
3. **frontend** from `./frontend` — either proxy `/api` to backend, or set `VITE_API_BASE` to the backend public URL at build time
