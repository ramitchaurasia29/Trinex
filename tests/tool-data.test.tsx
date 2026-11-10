// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { applyToolDefaults } from "../tool-data";
import { createToolDraft, mutateTool } from "../api";
import { ServerStateProvider } from "../query";

describe("Phase 4 tool integration", () => {
  it("provides TanStack Query server state to the application", () => {
    function Probe() { const client = useQueryClient(); return <span>{client ? "query-ready" : "missing"}</span>; }
    render(<ServerStateProvider><Probe /></ServerStateProvider>);
    expect(screen.getByText("query-ready")).toBeTruthy();
  });

  it("applies enabled defaults only when a new draft is created", () => {
    const result = applyToolDefaults("timed-exit", { instrument:"fo", time:"15:10", exitType:"full", partialType:"qty" }, [{ tool_type:"timed-exit", config:{time:"15:05",foPartialType:"lots"}, is_enabled:true, version:"v1" }]);
    expect(result.time).toBe("15:05"); expect(result.partialType).toBe("lots");
  });

  it("sends client UUIDs and optimistic versions through the typed API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id:"tool-1", status:"draft" }), { status:201, headers:{"Content-Type":"application/json"} }));
    await createToolDraft({ id:"client-id", tool_type:"timed-exit", config:{}, position_ids:[] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/tools/drafts");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("client-id");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id:"tool-1", status:"paused" }), { status:200, headers:{"Content-Type":"application/json"} }));
    await mutateTool("tool-1", "pause", "2026-11-09T00:00:00+00:00");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("expected_version");
    vi.restoreAllMocks();
  });
});
