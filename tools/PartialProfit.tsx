import { Field, InstrumentField, RepeatCard, Step, clean, v } from "./form";
import { Segmented, TextInput } from "../ui";
import { inr, isFO, type Position } from "../data";
import type { ToolModule } from "./types";

type ProfitTarget = { level: string; type: "lots" | "qty" | "pct"; value: string };
export type PartialProfitConfig = { instrument: "stock" | "options"; targetCount: number; targets: ProfitTarget[] };
const INSTRUMENT_OPTIONS = [
  { value: "stock" as const, label: "Stocks" },
  { value: "options" as const, label: "Options" },
];
const typesFor = (instrument: "stock" | "options"): { value: ProfitTarget["type"]; label: string }[] => instrument === "options"
  ? [{ value: "lots", label: "Lot-Based" }, { value: "qty", label: "Quantity-Based" }]
  : [{ value: "qty", label: "Quantity-Based" }, { value: "pct", label: "Percentage-Based" }];
const totalQuantity = (position?: Position) => position?.qty ?? 0;
const exitAmount = (target: ProfitTarget, instrument: "stock" | "options", available: number, position?: Position) => {
  const amount = Number(target.value) || 0;
  if (target.type === "lots" && instrument === "options") return amount * (position?.lotSize ?? 1);
  if (target.type === "pct" && instrument === "stock") return Math.round(available * amount / 100);
  return amount;
};
const qtyText = (qty: number, instrument: "stock" | "options", position?: Position) =>
  instrument === "options" && position
    ? `${qty / position.lotSize} ${qty / position.lotSize === 1 ? "lot" : "lots"}`
    : `${qty} ${instrument === "options" ? "qty" : "shares"}`;
const remainingText = (qty: number, instrument: "stock" | "options", position?: Position) => {
  if (instrument === "options" && position && qty % position.lotSize === 0) return `${qty / position.lotSize} ${qty / position.lotSize === 1 ? "lot" : "lots"}`;
  return `${qty} ${instrument === "options" ? "qty" : "shares"}`;
};

export const partialProfit: ToolModule<PartialProfitConfig> = {
  defaults: (ctx) => {
    const instrument = ctx.position && !isFO(ctx.position.kind) ? "stock" : "options";
    return { instrument, targetCount: 1, targets: [{ level: "", type: instrument === "options" ? "lots" : "qty", value: "" }] };
  },

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const targets = value.targets.slice(0, value.targetCount);
    const selectedTypes = typesFor(value.instrument);
    let available = totalQuantity(ctx.position);
    return (
      <div>
        <Step n={1} title="Instrument" hint="Futures and options use option-style lot quantities.">
          <InstrumentField options={INSTRUMENT_OPTIONS} value={value.instrument} onChange={(instrument) => set({ instrument, targets: value.targets.map((target) => ({ ...target, type: instrument === "options" ? "lots" : "qty" })) })} lockedFrom={ctx.position?.symbol} />
        </Step>
        <Step n={2} title="Number of Targets" hint="Choose how many profit levels to configure.">
          <Segmented options={[1, 2, 3, 4, 5].map((count) => ({ value: String(count), label: String(count) }))} value={String(value.targetCount)} onChange={(count) => {
            const nextCount = Number(count);
            const next = value.targets.slice(0, nextCount);
            while (next.length < nextCount) next.push({ level: "", type: value.instrument === "options" ? "lots" : "qty", value: "" });
            set({ targetCount: nextCount, targets: next });
          }} />
        </Step>
        <Step n={3} title="Target Details" hint="Each target books from the quantity still open after earlier targets.">
          {targets.map((target, index) => {
            const currentAvailable = available;
            const amount = exitAmount(target, value.instrument, currentAvailable, ctx.position);
            const remaining = Math.max(0, currentAvailable - amount);
            const targetPrefix = `t${index}_`;
            const type = selectedTypes.some((option) => option.value === target.type) ? target.type : selectedTypes[0].value;
            available = remaining;
            return (
              <RepeatCard key={index} title={`Target ${index + 1}`} meta={<span className="text-xs text-muted">Remaining · <span className="font-mono tabular-nums text-ink-2">{remainingText(remaining, value.instrument, ctx.position)}</span></span>}>
                <Field label="Target Level" error={(showErrors || target.level ? errors[`${targetPrefix}level`] : undefined)}>
                  <TextInput value={target.level} onChange={(level) => set({ targets: value.targets.map((item, i) => i === index ? { ...item, level: clean(level) } : item) })} placeholder="e.g. 250" prefix="₹" inputMode="decimal" invalid={!!((showErrors || target.level) && errors[`${targetPrefix}level`])} />
                </Field>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-ink-2">Exit Quantity</span>
                  <Segmented options={selectedTypes} value={type} onChange={(nextType) => set({ targets: value.targets.map((item, i) => i === index ? { ...item, type: nextType } : item) })} />
                  <Field error={(showErrors || target.value ? errors[`${targetPrefix}value`] : undefined)} hint={type === "lots" && ctx.position ? `${Math.round(currentAvailable / ctx.position.lotSize)} lots available · lot size ${ctx.position.lotSize}` : type === "pct" ? "Percentage is calculated from the remaining shares at this target." : undefined}>
                    <TextInput value={target.value} onChange={(input) => set({ targets: value.targets.map((item, i) => i === index ? { ...item, value: type === "pct" ? clean(input) : input.replace(/[^0-9]/g, "") } : item) })} placeholder={type === "pct" ? "e.g. 30" : type === "lots" ? "e.g. 1" : "e.g. 100"} suffix={type === "lots" ? "lots" : type === "pct" ? "%" : value.instrument === "options" ? "qty" : "shares"} inputMode={type === "pct" ? "decimal" : "numeric"} invalid={!!((showErrors || target.value) && errors[`${targetPrefix}value`])} />
                  </Field>
                </div>
              </RepeatCard>
            );
          })}
        </Step>
      </div>
    );
  },

  validate: (c, ctx) => {
    const e: Record<string, string> = {};
    const rows = c.targets.slice(0, c.targetCount);
    const position = ctx.position;
    let available = totalQuantity(position);
    const ascending = position?.side !== "SELL";
    rows.forEach((target, index) => {
      const prefix = `t${index}_`;
      const level = Number(target.level);
      if (!target.level || level <= 0) e[`${prefix}level`] = "Enter a target price above ₹0";
      if (index > 0 && target.level && rows[index - 1].level) {
        const previous = Number(rows[index - 1].level);
        if (ascending && level <= previous) e[`${prefix}level`] = "Each target must be higher than the previous one";
        if (!ascending && level >= previous) e[`${prefix}level`] = "Each target must be lower than the previous one";
      }
      const amount = Number(target.value);
      if (!target.value || amount <= 0) e[`${prefix}value`] = "Enter an exit quantity above 0";
      else if (target.type === "pct" && (amount > 100 || amount <= 0)) e[`${prefix}value`] = "Enter a percentage between 1 and 100";
      else {
        const exit = exitAmount(target, c.instrument, available, position);
        if (exit > available) {
          const max = c.instrument === "options" && target.type === "lots" && position
            ? Math.floor(available / position.lotSize)
            : available;
          const unit = c.instrument === "options" && target.type === "lots" ? "lots" : c.instrument === "options" ? "qty" : "shares";
          e[`${prefix}value`] = `You can exit a maximum of ${max} ${unit} at this target.`;
        }
        available = Math.max(0, available - Math.min(exit, available));
      }
    });
    return e;
  },

  preview: (c, ctx) => {
    let available = totalQuantity(ctx.position);
    const rows = c.targets.slice(0, c.targetCount).map((target, index) => {
      const exit = exitAmount(target, c.instrument, available, ctx.position);
      const remaining = Math.max(0, available - exit);
      const exitLabel = target.type === "pct" ? `${target.value || "—"}% · ${exit} shares` : qtyText(exit, c.instrument, ctx.position);
      const result = [String(index + 1), target.level ? inr(Number(target.level)) : "₹—", exitLabel, remainingText(remaining, c.instrument, ctx.position)];
      available = remaining;
      return result;
    });
    const finalRemaining = available;
    const symbol = ctx.position?.symbol ?? "your position";
    return {
      sentence: ["Book profit in ", v(`${c.targetCount} ${c.targetCount === 1 ? "step" : "steps"}`), " on ", v(symbol), " — ", v(finalRemaining > 0 ? `${remainingText(finalRemaining, c.instrument, ctx.position)} stays open after Target ${c.targetCount}` : `fully exited at Target ${c.targetCount}`), "."],
      table: { head: ["Target", "Level", "Exit", "Remaining"], rows },
    };
  },

  review: (c, ctx) => {
    let available = totalQuantity(ctx.position);
    const rows: [string, string][] = [["Instrument", c.instrument === "options" ? "Options" : "Stocks"], ["Number of Targets", String(c.targetCount)]];
    c.targets.slice(0, c.targetCount).forEach((target, index) => {
      const exit = exitAmount(target, c.instrument, available, ctx.position);
      const remaining = Math.max(0, available - exit);
      rows.push([`Target ${index + 1}`, `${target.level ? inr(Number(target.level)) : "—"} · Exit ${target.value || "—"} ${target.type === "lots" ? "lots" : target.type === "pct" ? "%" : c.instrument === "options" ? "qty" : "shares"} · Remaining ${remainingText(remaining, c.instrument, ctx.position)}`]);
      available = remaining;
    });
    return [{ title: "Profit targets", rows }];
  },

  short: (c) => `${c.targetCount} targets · ${c.targets.slice(0, c.targetCount).map((target) => target.level ? `₹${target.level}` : "—").join(" / ")}`,
  statusText: (c) => `Target 1 at ${c.targets[0]?.level ? inr(Number(c.targets[0].level)) : "—"}`,
};
