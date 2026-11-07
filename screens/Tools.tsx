import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, ChevronRight } from "lucide-react";
import AppShell from "../AppShell";
import { CATEGORIES, TOOLS, toolById } from "../data";
import { useStore } from "../store";
import { useScreenInit } from "../useScreenInit";
import { Badge, Dot, EmptyState, STATUS_TONE, TextInput } from "../ui";
import { startTool } from "../overlays";

export default function Tools() {
  const nav = useNavigate();
  const init = useScreenInit() as { q?: string };
  const { armed, setDraft, positions } = useStore();
  const [q, setQ] = useState(init.q ?? "");
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const filtered = TOOLS.filter((t) => match(t.name) || match(t.description) || match(t.how));
  const posCount = new Set(armed.map((a) => a.positionId ?? a.target)).size;

  return (
    <AppShell title="Tools" subtitle="Automation your broker doesn't offer">
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <TextInput value={q} onChange={setQ} placeholder="Search tools..." prefix={<Search size={16} strokeWidth={2} />} />
        {armed.length > 0 && (
          <button onClick={() => nav("/positions/armed")} className="flex h-11 items-center gap-3 rounded-md border border-line bg-surface px-3 text-left text-sm hover:border-line-strong">
            <div className="flex -space-x-1.5">
              {armed.slice(0, 5).map((a) => {
                const Icon = toolById(a.toolId).icon;
                return (
                  <span key={a.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-ink-2">
                    <Icon size={13} strokeWidth={2} />
                  </span>
                );
              })}
            </div>
            <span className="text-ink-2"><span className="font-semibold text-ink">{armed.length} tools</span> active across {posCount} positions</span>
            <span className="ml-1 flex items-center gap-1 font-medium text-primary">View <ArrowRight size={14} strokeWidth={2} /></span>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title={`No tools match “${q}”`} body="Try “exit”, “trail”, “profit” or “entry”." />
      ) : (
        <div className="flex flex-col gap-8">
          {CATEGORIES.map((c) => {
            const tools = filtered.filter((t) => t.category === c.id);
            if (!tools.length) return null;
            return (
              <section key={c.id}>
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="text-base font-semibold tracking-tight">{c.name}</h2>
                  <p className="text-sm text-muted">{c.blurb}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tools.map((t) => {
                    const Icon = t.icon;
                    const active = armed.filter((a) => a.toolId === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => startTool(nav, setDraft, positions, t.id)}
                        className="group flex flex-col rounded-lg border border-line bg-surface p-5 text-left shadow-card hover:border-primary-line"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
                            <Icon size={22} strokeWidth={2} />
                          </span>
                          {active.length > 0 && (
                            <Badge tone="profit"><Dot tone={STATUS_TONE[active[0].status]} className="h-1.5 w-1.5" />{active.length} active</Badge>
                          )}
                        </div>
                        <p className="mt-4 text-base font-semibold tracking-tight text-ink">{t.name}</p>
                        <p className="mt-1 text-sm text-muted">{t.description}</p>
                        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                          <span className="text-xs font-medium text-ink-2">{t.how}</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-primary">
                            Set up <ChevronRight size={16} strokeWidth={2} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
