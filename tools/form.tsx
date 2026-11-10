import type { ReactNode } from "react";
import { AlertCircle, Lock, Plus, Trash2 } from "lucide-react";
import { Segmented, TextInput } from "../ui";
import { isFO, type Position } from "../data";
import type { Part } from "./types";

/* ------------------------------------------------------------------ */
/* Layout primitives — every tool form is a vertical list of <Step>s   */
/* ------------------------------------------------------------------ */

/** A numbered configuration step. Steps render in order; conditional steps simply aren't rendered. */
export function Step({ n, title, hint, children, aside }: { n: number; title: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid grid-cols-[28px_1fr] gap-x-3 border-b border-line py-5 last:border-b-0 sm:grid-cols-[32px_1fr] sm:gap-x-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-surface font-mono text-xs font-semibold text-ink-2 sm:h-8 sm:w-8">
        {n}
      </span>
      <div className="min-w-0">
        <div className="flex min-h-7 items-start justify-between gap-3 sm:min-h-8">
          <div className="pt-1">
            <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
            {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
          </div>
          {aside}
        </div>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </div>
    </section>
  );
}

export function Field({ label, hint, error, children }: { label?: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="text-xs font-medium text-ink-2">{label}</span>}
      {children}
      {error ? (
        <span className="flex items-center gap-1 text-xs font-medium text-loss"><AlertCircle size={12} strokeWidth={2} />{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

/** Small read-only callout under a step, e.g. "100% Quantity — the whole position exits". */
export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" }) {
  return (
    <div className={["rounded-md px-3 py-2.5 text-sm", tone === "primary" ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-2"].join(" ")}>
      {children}
    </div>
  );
}

/** Instrument type selector. When a position is selected it is auto-filled and locked. */
export function InstrumentField<T extends string>({
  options, value, onChange, lockedFrom,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  lockedFrom?: string;
}) {
  return (
    <>
      <Segmented options={options} value={value} onChange={onChange} disabled={!!lockedFrom} />
      {lockedFrom && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Lock size={12} strokeWidth={2} /> Auto-filled from {lockedFrom}
        </p>
      )}
    </>
  );
}

/** Numeric input with an attached unit switch (Points / %). */
export function NumberUnit<U extends string>({
  value, onChange, unit, onUnit, units, placeholder, invalid, prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: U;
  onUnit: (u: U) => void;
  units: { value: U; label: string }[];
  placeholder?: string;
  invalid?: boolean;
  prefix?: string;
}) {
  return (
    <div className="flex gap-2">
      <TextInput value={value} onChange={(v) => onChange(clean(v))} placeholder={placeholder} inputMode="decimal" invalid={invalid} prefix={prefix} className="flex-1" />
      <div className="w-44 shrink-0">
        <Segmented options={units} value={unit} onChange={onUnit} />
      </div>
    </div>
  );
}

export type OrderPolicy = {
  product: "MIS" | "NRML" | "CNC";
  orderType: "MARKET" | "LIMIT";
  validity: "DAY" | "IOC";
  limitPrice: string | null;
  slippageBps: string;
};

export const defaultOrderPolicy = (instrument: "fo" | "stock"): OrderPolicy => ({
  product: instrument === "fo" ? "NRML" : "MIS",
  orderType: "MARKET",
  validity: "DAY",
  limitPrice: null,
  slippageBps: "5",
});

export function validateOrderPolicy(policy?: OrderPolicy): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!policy) return { orderPolicy: "Choose an execution policy" };
  if (policy.orderType === "LIMIT" && (!policy.limitPrice || Number(policy.limitPrice) <= 0)) errors["orderPolicy.limitPrice"] = "Enter a limit price above ₹0";
  const slippage = Number(policy.slippageBps);
  if (policy.slippageBps === "" || slippage < 0 || slippage > 100) errors["orderPolicy.slippageBps"] = "Use 0–100 bps";
  return errors;
}

export function OrderPolicyFields({ value, onChange, instrument, errors, showErrors }: {
  value: OrderPolicy;
  onChange: (value: OrderPolicy) => void;
  instrument: "fo" | "stock";
  errors: Record<string, string>;
  showErrors: boolean;
}) {
  const products = instrument === "fo"
    ? [{ value: "MIS" as const, label: "MIS" }, { value: "NRML" as const, label: "NRML" }]
    : [{ value: "MIS" as const, label: "MIS" }, { value: "CNC" as const, label: "CNC" }];
  return (
    <div className="flex flex-col gap-3">
      <Field label="Product"><Segmented options={products} value={value.product as "MIS" | "NRML" | "CNC"} onChange={(product) => onChange({ ...value, product })} /></Field>
      <Field label="Order Type"><Segmented options={[{ value: "MARKET" as const, label: "Market" }, { value: "LIMIT" as const, label: "Limit" }]} value={value.orderType} onChange={(orderType) => onChange({ ...value, orderType, limitPrice: orderType === "MARKET" ? null : value.limitPrice })} /></Field>
      {value.orderType === "LIMIT" && <Field label="Limit Price" error={showErrors ? errors["orderPolicy.limitPrice"] : undefined}><TextInput value={value.limitPrice ?? ""} onChange={(limitPrice) => onChange({ ...value, limitPrice: clean(limitPrice) })} prefix="₹" inputMode="decimal" placeholder="e.g. 250" /></Field>}
      <Field label="Validity"><Segmented options={[{ value: "DAY" as const, label: "Day" }, { value: "IOC" as const, label: "IOC" }]} value={value.validity} onChange={(validity) => onChange({ ...value, validity })} /></Field>
      <Field label="Paper Slippage" hint="Simulated only · 0 to 100 basis points" error={showErrors ? errors["orderPolicy.slippageBps"] : undefined}><TextInput value={value.slippageBps} onChange={(slippageBps) => onChange({ ...value, slippageBps: clean(slippageBps) })} suffix="bps" inputMode="decimal" /></Field>
    </div>
  );
}

export function TimeInput({ value, onChange, presets, invalid }: { value: string; onChange: (v: string) => void; presets?: string[]; invalid?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <label className={["flex h-11 w-full items-center gap-2 rounded-md border bg-surface px-3 focus-within:ring-2 sm:w-44", invalid ? "border-loss focus-within:ring-loss-line" : "border-line-strong focus-within:border-primary focus-within:ring-primary-line"].join(" ")}>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full bg-transparent font-mono text-sm text-ink tabular-nums outline-none"
        />
        <span className="text-xs text-muted">IST</span>
      </label>
      {presets && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={["h-7 rounded-sm border px-2 font-mono text-xs tabular-nums", value === p ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:border-line-strong"].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One row of a repeatable list (ladders, targets, lock levels). */
export function RepeatCard({ title, meta, onRemove, children }: { title: string; meta?: ReactNode; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex h-10 items-center justify-between border-b border-line bg-surface-2 px-3">
        <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">{title}</span>
        <div className="flex items-center gap-2">
          {meta}
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className="flex h-7 w-7 items-center justify-center rounded-sm text-muted hover:bg-loss-soft hover:text-loss">
              <Trash2 size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function AddRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-primary hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-line-strong disabled:hover:bg-transparent"
    >
      <Plus size={16} strokeWidth={2} /> {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Shared exit-quantity block (Full / Partial → method → value)        */
/* Used by Timed Exit and Range Break Exit.                            */
/* ------------------------------------------------------------------ */

export type ExitQty = {
  exitType: "full" | "partial";
  partialType: "lots" | "qty" | "pct";
  lots: string;
  qty: string;
  pct: string;
};

export const EXIT_QTY_DEFAULT: ExitQty = { exitType: "full", partialType: "lots", lots: "", qty: "", pct: "" };

export function partialOptionsFor(instrument: "fo" | "stock") {
  return instrument === "fo"
    ? ([{ value: "lots", label: "Lot-Based" }, { value: "qty", label: "Quantity-Based" }] as const)
    : ([{ value: "qty", label: "Quantity-Based" }, { value: "pct", label: "Percentage-Based" }] as const);
}

export function validateExitQty(c: ExitQty, instrument: "fo" | "stock", p?: Position): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.exitType !== "partial") return e;
  const lotsHeld = p ? Math.round(p.qty / p.lotSize) : undefined;
  if (c.partialType === "lots" && instrument === "fo") {
    const n = Number(c.lots);
    if (!c.lots || n <= 0 || !Number.isInteger(n)) e.lots = "Enter a whole number of lots above 0";
    else if (lotsHeld !== undefined && n > lotsHeld) e.lots = `You hold ${lotsHeld} lot${lotsHeld === 1 ? "" : "s"} — enter ${lotsHeld} or fewer`;
  }
  if (c.partialType === "qty") {
    const n = Number(c.qty);
    if (!c.qty || n <= 0) e.qty = "Enter a quantity above 0";
    else if (p && n > p.qty) e.qty = `Can't exceed your open quantity of ${p.qty}`;
    else if (p && instrument === "fo" && n % p.lotSize !== 0) e.qty = `Must be a multiple of the lot size (${p.lotSize})`;
  }
  if (c.partialType === "pct" && instrument === "stock") {
    const n = Number(c.pct);
    if (!c.pct || n <= 0 || n > 100) e.pct = "Enter a percentage between 1 and 100";
  }
  return e;
}

/** Human phrase for the exit amount, e.g. "100% of", "2 lots of", "50% of". */
export function exitPhrase(c: ExitQty, instrument: "fo" | "stock") {
  if (c.exitType === "full") return "100%";
  if (c.partialType === "lots" && instrument === "fo") return c.lots ? `${c.lots} lot${c.lots === "1" ? "" : "s"}` : "— lots";
  if (c.partialType === "qty") return c.qty ? `${c.qty} qty` : "— qty";
  return c.pct ? `${c.pct}%` : "—%";
}

export function remainingAfter(c: ExitQty, instrument: "fo" | "stock", p?: Position): string | undefined {
  if (!p) return undefined;
  if (c.exitType === "full") return instrument === "fo" ? "0 lots" : "0 shares";
  if (c.partialType === "lots" && instrument === "fo" && c.lots) return `${Math.max(0, Math.round(p.qty / p.lotSize) - Number(c.lots))} lots`;
  if (c.partialType === "qty" && c.qty) return `${Math.max(0, p.qty - Number(c.qty))} ${instrument === "fo" ? "qty" : "shares"}`;
  if (c.partialType === "pct" && c.pct) return `${Math.max(0, Math.round(p.qty * (1 - Number(c.pct) / 100)))} shares`;
  return undefined;
}

export function ExitQuantitySteps({
  start, value, set, instrument, position, errors, showErrors,
}: {
  start: number;
  value: ExitQty;
  set: (patch: Partial<ExitQty>) => void;
  instrument: "fo" | "stock";
  position?: Position;
  errors: Record<string, string>;
  showErrors: boolean;
}) {
  const opts = partialOptionsFor(instrument);
  const pt = opts.some((o) => o.value === value.partialType) ? value.partialType : opts[0].value;
  const err = (k: keyof ExitQty) => (showErrors || value[k] ? errors[k] : undefined);
  const remaining = remainingAfter({ ...value, partialType: pt }, instrument, position);
  const held = position ? (isFO(position.kind) ? `${Math.round(position.qty / position.lotSize)} lots (${position.qty} qty)` : `${position.qty} shares`) : undefined;

  return (
    <>
      <Step n={start} title="Exit Type" hint="Exit everything, or only part of the position.">
        <Segmented
          options={[{ value: "full", label: "Full Exit" }, { value: "partial", label: "Partial Exit" }]}
          value={value.exitType}
          onChange={(v) => set({ exitType: v, partialType: pt })}
        />
        {value.exitType === "full" && (
          <Note>
            <span className="font-semibold">100% Quantity</span> — the entire eligible position{held ? ` (${held})` : ""} will be exited. No quantity needed.
          </Note>
        )}
      </Step>

      {value.exitType === "partial" && (
        <Step n={start + 1} title="Partial Exit Type" hint={instrument === "fo" ? "Choose how you want to count the exit — in lots or in quantity." : "Choose how you want to count the exit — in shares or as a percentage."}>
          <Segmented options={opts.map((o) => ({ ...o }))} value={pt} onChange={(v) => set({ partialType: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            {pt === "lots" && (
              <Field label="Number of Lots" error={err("lots")} hint={position ? `You hold ${Math.round(position.qty / position.lotSize)} lot${Math.round(position.qty / position.lotSize) === 1 ? "" : "s"} · lot size ${position.lotSize}` : undefined}>
                <TextInput value={value.lots} onChange={(v) => set({ lots: v.replace(/[^0-9]/g, "") })} placeholder="e.g. 2" suffix="lots" inputMode="numeric" invalid={!!err("lots")} />
              </Field>
            )}
            {pt === "qty" && (
              <Field label="Quantity" error={err("qty")} hint={position ? `Open quantity ${position.qty}${instrument === "fo" ? ` · multiples of ${position.lotSize}` : ""}` : undefined}>
                <TextInput value={value.qty} onChange={(v) => set({ qty: v.replace(/[^0-9]/g, "") })} placeholder={instrument === "fo" ? "e.g. 150" : "e.g. 100"} suffix={instrument === "fo" ? "qty" : "shares"} inputMode="numeric" invalid={!!err("qty")} />
              </Field>
            )}
            {pt === "pct" && (
              <Field label="Percentage" error={err("pct")} hint="Share of your current open quantity">
                <TextInput value={value.pct} onChange={(v) => set({ pct: clean(v) })} placeholder="e.g. 50" suffix="%" inputMode="decimal" invalid={!!err("pct")} />
              </Field>
            )}
            {remaining && (
              <Field label="Remaining after exit">
                <div className="flex h-11 items-center rounded-md bg-surface-2 px-3 font-mono text-sm text-ink-2 tabular-nums">{remaining}</div>
              </Field>
            )}
          </div>
        </Step>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function clean(v: string) {
  const s = v.replace(/[^0-9.]/g, "");
  const [a, ...b] = s.split(".");
  return b.length ? `${a}.${b.join("")}` : a;
}

export const v = (x: string | number | undefined, fallback = "—"): Part => ({ v: x === undefined || x === "" ? fallback : String(x) });

export function instrumentOf(p?: Position): "fo" | "stock" {
  return p && !isFO(p.kind) ? "stock" : "fo";
}
