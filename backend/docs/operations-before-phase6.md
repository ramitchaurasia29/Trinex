# Operations required before Phase 6

## Neon development database

- Active branch: `dev-database-foundation` (`br-purple-sea-aobjdzbu`).
- Its scheduled expiry was removed on 2026-11-10.
- Recovery branch: `backup-phase5-2026-11-10` (`br-green-bird-aouxgp3a`).
- The recovery branch is a no-compute child of the development branch at LSN
  `0/21B6828` and has no scheduled expiry.
- Neon snapshots cannot target a non-root branch, so the recovery branch is the
  supported copy-on-write preservation mechanism used here.

## Render paper worker

The repository root `render.yaml` defines a standalone Background Worker with
`backend` as its root and `python -m app.worker` as its start command. Provide
the three `sync: false` values in Render from the development environment:

- `DATABASE_URL` (the pooled URL for `dev-database-foundation` only)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Never copy these values into source control. The process refuses a production
branch name, non-paper trading mode, or a non-mock market-data provider.

After the first deployment:

1. Confirm the logs contain a polling cycle without connection errors.
2. Call `GET /api/v1/health/execution` on the separately deployed API. It must
   report `ok` and a recent heartbeat time.
3. Restart the worker in Render. Confirm the old instance logs `Paper worker
   stopped gracefully`, the replacement heartbeat becomes current, and pending
   durable actions resume without duplicate order/fill keys.
4. Recheck the execution health endpoint after at least 30 seconds.

## NSE 2027 calendar gate

As of 2026-11-10, NSE has not published its official 2027 Capital Market/F&O
trading-holiday circular. The official holiday page still lists 2026, and NSE's
2026–27 Trade-for-Trade schedule marks 2027 dates as subject to the future 2027
holiday calendar.

Official sources checked:

- <https://www.nseindia.com/resources/exchange-communication-holidays?apiversion=v2>
- <https://www.nseindia.com/static/regulations/exchange-market-surveillance-actions-tt-schedule>

The engine therefore fails closed for every unsupported year. When NSE publishes
the circular, verify it on the NSE domain, add the exact dates to
`NSE_HOLIDAYS_BY_YEAR` in `app/execution/calendar.py`, include any exceptional
session with its published times, and add boundary tests before deploying. Do
not use a public-holiday or bank-holiday calendar as a substitute.
