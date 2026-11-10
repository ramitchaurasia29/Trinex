# Trinex paper execution engine

Phase 5 runs as a process separate from FastAPI:

```powershell
python -m app.worker
```

For deployment probes and local smoke tests, run one recoverable cycle:

```powershell
python -m app.worker --once
```

The process refuses to start unless `TRADING_MODE=paper` and
`MARKET_DATA_PROVIDER=mock`. It never imports a live broker adapter.

## Durable and temporary state

- Neon stores execution checkpoints, idempotent actions, paper orders, fills,
  cost breakdowns, tool/order events, positions and snapshots.
- Upstash stores only 30-second worker heartbeats, subscriptions, recent
  quotes and distributed lock tokens.
- PostgreSQL leases and fencing tokens provide correctness after a worker
  crash; Redis locks reduce duplicate work but are not the source of truth.

The worker health probe is `GET /api/health/execution`. It returns only the
mode, provider and last heartbeat time and never returns credentials.

## Market-data policy

Normalized mock quotes include bid, ask, last, depth, exchange time, receipt
time, source sequence and `SIMULATED` provenance. Quotes up to five seconds
old are fresh, quotes from five through fifteen seconds suspend evaluation,
and older quotes are stale. Crossing handlers establish a new baseline after
recovery and never infer a trigger across a data gap.

The NSE regular session is 09:15–15:30 Asia/Kolkata. The checked-in 2026
holiday set is based on the published NSE calendar. Future calendar years must
be added from the official exchange schedule before that year's worker rollout.

## Execution safety

- Exit actions are MARKET IOC paper orders.
- Entry actions use the persisted MARKET/LIMIT, DAY/IOC, product, limit and
  slippage policy.
- Actions, order attempts and fills use deterministic idempotency keys.
- A terminal partial fill keeps the real simulated fills, cancels the
  remainder and marks the tool failed for review.
- Position rows are locked and eligible quantity is rechecked immediately
  before an order is created.
- All records and user-visible events are labeled `PAPER` or `SIMULATED`.

The effective-dated `india-nse-2026-04-01` cost model stores brokerage, STT,
exchange charges, SEBI fees, GST and stamp duty on each immutable fill. Historic
fills are never recalculated when a later cost schedule is introduced.
