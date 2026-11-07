import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ShieldCheck, Eye } from "lucide-react";
import { inr, num, pnlOf, pctOf, qtyLabel, type Instrument, type Position, type ToolDef } from "../../data";
import { BrokerTag, Pnl, SideBadge } from "../../ui";
import type { Part, Preview } from "../../tools/types";

export function stepsFor(tool: ToolDef) {
  if (tool.target === "position") return ["Choose position", "Configure", "Review & arm"];
  if (tool.target === "instrument") return ["Choose instrument", "Configure", "Review & arm"];
  return ["Configure", "Review & arm"];
}

export function FlowSteps({ tool, current }: { tool: ToolDef; current: number }) {
  const steps = stepsFor(tool);
  return (
    <ol className="mb-5 flex items-center gap-2 overflow-x-auto text-xs font-medium sm:gap-3">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className={["flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs", done ? "bg-ink text-white" : active ? "bg-primary text-white" : "border border-line-strong bg-surface text-muted"].join(" ")}>
              {done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={active ? "text-ink" : done ? "text-ink-2" : "text-muted"}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-line-strong sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}

export function ToolHeaderCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight text-ink">{tool.name}</p>
        <p className="mt-0.5 text-sm text-muted">{tool.description}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2">{tool.how}</p>
      </div>
    </div>
  );
}

export function PositionContext({ position, changeTo }: { position: Position; changeTo?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-ink">{position.symbol}</span>
          <SideBadge side={position.side} />
          <BrokerTag id={position.broker} />
        </div>
        <p className="mt-1 text-xs text-muted">
          {qtyLabel(position)} · Avg <span className="font-mono">₹{num(position.avg)}</span>
          {position.expiry ? ` · Exp ${position.expiry}` : ""} · {position.product}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm text-ink tabular-nums">₹{num(position.ltp)}</p>
        <Pnl value={pnlOf(position)} pct={pctOf(position)} className="text-xs" />
      </div>
      {changeTo && (
        <Link to={changeTo} className="text-sm font-medium text-primary hover:underline">Change</Link>
      )}
    </div>
  );
}

export function InstrumentContext({ instrument, changeTo }: { instrument: Instrument; changeTo?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-tight text-ink">{instrument.symbol}</p>
        <p className="mt-1 text-xs text-muted">{instrument.meta}{instrument.lotSize > 1 ? ` · Lot size ${instrument.lotSize}` : ""}</p>
      </div>
      <p className="font-mono text-sm text-ink tabular-nums">₹{num(instrument.ltp)}</p>
      {changeTo && <Link to={changeTo} className="text-sm font-medium text-primary hover:underline">Change</Link>}
    </div>
  );
}

export function Sentence({ parts, size = "lg" }: { parts: Part[]; size?: "sm" | "lg" }) {
  return (
    <p className={size === "lg" ? "text-base leading-8 text-ink-2" : "text-sm leading-6 text-ink-2"}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span
            key={i}
            className={[
              "mx-0.5 rounded-sm px-1.5 py-0.5 font-medium whitespace-nowrap",
              p.v.includes("—") ? "border border-dashed border-line-strong text-faint" : "bg-primary-soft text-primary",
            ].join(" ")}
          >
            {p.v}
          </span>
        ),
      )}
    </p>
  );
}

export function PreviewTable({ table }: { table: NonNullable<Preview["table"]> }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-2 text-muted">
          <tr>{table.head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => <td key={j} className="px-3 py-2 font-mono text-ink tabular-nums">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Right rail on desktop: the live rule preview + primary CTA. */
export function PreviewRail({ preview, missing, cta, secondary, title = "Rule preview" }: { preview: Preview; missing: number; cta: ReactNode; secondary?: ReactNode; title?: string }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase"><Eye size={14} strokeWidth={2} />{title}</p>
          <span className="flex items-center gap-1.5 text-xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-profit-dot" />Live</span>
        </div>
        <Sentence parts={preview.sentence} />
        {preview.table && <PreviewTable table={preview.table} />}
        <div className="border-t border-line pt-4">
          {missing > 0 ? (
            <p className="mb-3 text-xs text-muted">{missing} field{missing === 1 ? "" : "s"} left to complete</p>
          ) : (
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-profit"><Check size={14} strokeWidth={2.5} />Ready to review</p>
          )}
          {cta}
          {secondary && <div className="mt-3 text-center">{secondary}</div>}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><ShieldCheck size={14} strokeWidth={2} className="mt-px shrink-0" />Nothing is placed with your broker until you arm the tool.</p>
        </div>
      </div>
    </aside>
  );
}

/** Mobile sticky footer: condensed preview + CTA. */
export function MobileBar({ preview, cta }: { preview?: Preview; cta: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 pt-3 pb-4 lg:hidden">
      {preview && (
        <div className="mb-3 line-clamp-2">
          <Sentence parts={preview.sentence} size="sm" />
        </div>
      )}
      {cta}
    </div>
  );
}

export function ReviewRows({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <p className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      <dl className="divide-y divide-line">
        {rows.map(([k, val], i) => (
          <div key={i} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-medium text-ink">{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export { inr };
