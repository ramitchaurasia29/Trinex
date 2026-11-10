import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, connectBrokerAccount, getPositions, type PositionApi } from "../api";
import { positionView } from "../trading";

const position: PositionApi = {
  id: "position-1", broker_account_id: "account-1", broker_provider: "mock", broker_display_name: "Paper One", broker_status: "connected", data_mode: "SIMULATED",
  symbol: "NIFTY 24500 CE", trading_symbol: "NIFTY26NOV24500CE", exchange: "NFO", kind: "option", side: "BUY", product: "MIS", status: "open",
  quantity: "150.00000000", net_quantity: "150.00000000", available_quantity: "150.00000000", lot_size: "75.00000000", average_entry_price: "110.25000000", ltp: "124.50000000",
  previous_close: "108.00000000", day_open: "111.00000000", day_low: "105.00000000", day_high: "128.00000000", realized_pnl: "0.0000", unrealized_pnl: "2137.5000", mtm: "2137.5000", gross_exposure: "18675.0000", pnl_percentage: "12.9252", margin_used: "8000.0000", margin_available: "2000.0000",
  expiry_date: "2026-11-26", greeks: { delta: "0.52", theta: "-4.2" }, opened_at: "2026-11-09T04:00:00Z", closed_at: null, last_synced_at: "2026-11-09T05:00:00Z", stale: false, exit_method: null,
};

afterEach(() => vi.restoreAllMocks());

describe("paper trading integration", () => {
  it("maps precise API strings into the existing position view model", () => {
    const mapped = positionView(position);
    expect(mapped.brokerAccountId).toBe("account-1");
    expect(mapped.qty).toBe(150);
    expect(mapped.avg).toBe(110.25);
    expect(mapped.dataMode).toBe("SIMULATED");
  });

  it("sends position filters as authenticated API query parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], summary: {}, last_synced_at: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await getPositions("open", { broker_account_id: "account-1", search: "NIFTY", side: "BUY", sort: "pnl-desc" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("broker_account_id=account-1");
    expect(String(url)).toContain("search=NIFTY");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces unavailable real broker authorization without storing a connection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: { code: "broker_adapter_not_implemented", message: "Zerodha authorization is not implemented" } }), { status: 501, headers: { "Content-Type": "application/json" } }));
    await expect(connectBrokerAccount("zerodha", "request-id")).rejects.toMatchObject({ status: 501, code: "broker_adapter_not_implemented" });
  });
});
