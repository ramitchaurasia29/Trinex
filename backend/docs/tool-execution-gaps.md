# Tool execution gaps after Phase 4

Phase 4 persists and validates paper tool configuration only. A tool in
`waiting` is not being monitored and cannot submit an order.

Execution work must define, test, and obtain product approval for:

- the initial stop-loss anchor/order used by Auto Trailing SL;
- product, order type, price type, validity and slippage for entry actions;
- the candle interval used by Range Break's candle-close trigger;
- market-data source, freshness, sampling and reconnect behavior;
- exchange calendars and session-boundary behavior;
- idempotent order submission, retries, partial fills and reconciliation;
- background monitoring and execution workers.

These policies are intentionally not inferred from the Phase 4 UI or stored
configuration.
