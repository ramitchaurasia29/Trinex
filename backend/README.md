# Trinex backend

FastAPI backend configuration for Neon PostgreSQL and Upstash Redis. Neon is the
permanent source of truth. Redis is limited to expiring OTPs, rate limits,
temporary locks, coordination, and caches.

## Local setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Fill `backend/.env` with the backend-only credentials. Keep
`TRADING_MODE=paper`. For Neon, use the pooled `DATABASE_URL` for the app and the
direct `DATABASE_URL_UNPOOLED` only for future Alembic migrations.

For Upstash, copy `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` from the database's REST API section in the Upstash
console. Do not add either variable to Vite configuration and do not prefix them
with `VITE_`.

Generate `OTP_HASH_SECRET` locally with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Store the printed value only in `backend/.env`.

## Run

```powershell
uvicorn app.main:app --reload
```

The service health endpoints are:

- `GET /api/health`
- `GET /api/health/database`
- `GET /api/health/redis`

Authentication endpoints are:

- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/complete-profile`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/users/me`

Phase 3 paper broker and position endpoints are:

- `GET /api/v1/brokers/providers`
- `GET /api/v1/brokers`
- `POST /api/v1/brokers/connect`
- `POST /api/v1/brokers/sync`
- `POST /api/v1/brokers/{account_id}/sync`
- `POST /api/v1/brokers/{account_id}/reconnect`
- `DELETE /api/v1/brokers/{account_id}`
- `GET /api/v1/positions`
- `GET /api/v1/positions/{position_id}`

Phase 4 tool configuration endpoints are:

- `POST /api/v1/tools/drafts`
- `GET /api/v1/tools` and `GET /api/v1/tools/{tool_id}`
- `PATCH /api/v1/tools/{tool_id}`
- `POST /api/v1/tools/{tool_id}/review`
- `POST /api/v1/tools/{tool_id}/{arm|pause|resume|cancel}`
- `GET` and `PUT /api/v1/tool-defaults`
- `GET /api/v1/instruments`
- `GET /api/v1/activity/events`

Arming records a paper configuration in `waiting`; it does not monitor prices
or submit orders. See `docs/tool-execution-gaps.md` for explicitly deferred
execution decisions.

Only the Mock Broker can connect in Phase 3. Its positions are clearly marked
`SIMULATED`/`PAPER`; real broker authorization and all order execution remain
unavailable. Disconnecting retains position history and pauses linked tools.

Development OTP preview is returned only when `ENVIRONMENT=development` and
`DEV_OTP_PREVIEW=true`. Production must set `DEV_OTP_PREVIEW=false` and remains
unavailable until a real SMS adapter is configured. Sessions use opaque
HttpOnly cookies; only their SHA-256 hashes are stored in PostgreSQL.

## Safe Redis connectivity probe

```powershell
python scripts/check_redis.py
```

The probe performs `PING`, `SET` with a 30-second expiry, `GET`, and `TTL`, then
deletes its temporary key. It reports only operation status and TTL; it never
prints credentials or stored values.

The reviewed `0001` database foundation revision is applied only to
`dev-database-foundation`. Phases 2 and 3 require no schema migration. Never
run Alembic against the production branch.
