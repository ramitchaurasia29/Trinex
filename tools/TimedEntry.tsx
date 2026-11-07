import { Field, InstrumentField, Step, TimeInput, RepeatCard, AddRow, v } from "./form";
import { TextInput, Toggle } from "../ui";
import { isFO } from "../data";
import type { ToolModule } from "./types";

type LadderRow = { time: string; qty: string };
export type TimedEntryConfig = {
  instrument: "fo" | "stock";
  side: "BUY" | "SELL";
  ladder: boolean;
  time: string;
  qty: string;
  entries: LadderRow[];
};

const INSTRUMENT_OPTIONS = [
  { value: "fo" as const, label: "Futures / Options" },
  { value: "stock" as const, label: "Stocks" },
];
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const quantityLabel = (instrument: "fo" | "stock", qty: string) =>
  instrument === "fo" ? `${qty || "—"} lot${qty === "1" ? "" : "s"}` : `${qty || "—"} shares`;

export const timedEntry: ToolModule<TimedEntryConfig> = {
  defaults: (ctx) => ({
    instrument: ctx.instrument && isFO(ctx.instrument.kind) ? "fo" : "stock",
    side: "BUY",
    ladder: false,
    time: "09:35",
    qty: "",
    entries: [{ time: "09:35", qty: "" }],
  }),

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const lockedFrom = ctx.instrument?.symbol;
    const lotHint = ctx.instrument && value.instrument === "fo"
      ? `Lot size ${ctx.instrument.lotSize} · 1 lot = ${ctx.instrument.lotSize} quantity`
      : undefined;
    const total = value.ladder
      ? value.entries.reduce((sum, row) => sum + (Number(row.qty) || 0), 0)
      : Number(value.qty) || 0;
    const rowError = (field: string, current: string) => (showErrors || current ? errors[field] : undefined);
    return (
      <div>
        <Step n={1} title="Instrument" hint="The instrument selected for this entry.">
          <InstrumentField options={INSTRUMENT_OPTIONS} value={value.instrument} onChange={(instrument) => set({ instrument })} lockedFrom={lockedFrom} />
        </Step>
        <Step n={2} title="Position Type" hint="Choose whether this entry buys or sells.">
          <div className="inline-flex w-full gap-1 rounded-md border border-line bg-surface-2 p-1">
            {(["BUY", "SELL"] as const).map((side) => (
              <button key={side} type="button" aria-pressed={value.side === side} onClick={() => set({ side })} className={["h-9 flex-1 rounded-sm text-sm font-medium", value.side === side ? "bg-surface text-ink shadow-card ring-1 ring-line-strong" : "text-muted hover:text-ink"].join(" ")}>{side === "BUY" ? "Buy" : "Sell"}</button>
            ))}
          </div>
        </Step>
        <Step n={3} title="Entry Ladder" hint="Place one entry, or split it across several times." aside={<div className="flex items-center gap-2"><span className="text-xs font-medium text-ink-2">Enable Entry Ladder</span><Toggle checked={value.ladder} onChange={(ladder) => set({ ladder, entries: value.entries.length ? value.entries : [{ time: "09:35", qty: "" }] })} label="Enable Entry Ladder" /></div>}>
          {!value.ladder ? (
            <>
              <Field label="Entry Time" error={rowError("time", value.time)}>
                <TimeInput value={value.time} onChange={(time) => set({ time })} presets={["09:20", "09:35", "10:00"]} invalid={!!(showErrors && errors.time)} />
              </Field>
              <Field label="Quantity" error={rowError("qty", value.qty)} hint={lotHint}>
                <TextInput value={value.qty} onChange={(qty) => set({ qty: qty.replace(/[^0-9]/g, "") })} placeholder={value.instrument === "fo" ? "e.g. 2" : "e.g. 100"} suffix={value.instrument === "fo" ? "lots" : "shares"} inputMode="numeric" invalid={!!rowError("qty", value.qty)} />
              </Field>
            </>
          ) : (
            <>
              {value.entries.map((row, index) => (
                <RepeatCard key={index} title={`${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} Ladder`} onRemove={index > 0 ? () => set({ entries: value.entries.filter((_, i) => i !== index) }) : undefined}>
                  <Field label="Time" error={rowError(`t${index}_time`, row.time)}>
                    <TimeInput value={row.time} onChange={(time) => set({ entries: value.entries.map((item, i) => i === index ? { ...item, time } : item) })} presets={["09:20", "09:35", "10:00"]} invalid={!!(showErrors && errors[`t${index}_time`])} />
                  </Field>
                  <Field label="Quantity" hint={lotHint} error={rowError(`t${index}_qty`, row.qty)}>
                    <TextInput value={row.qty} onChange={(qty) => set({ entries: value.entries.map((item, i) => i === index ? { ...item, qty: qty.replace(/[^0-9]/g, "") } : item) })} placeholder={value.instrument === "fo" ? "e.g. 2" : "e.g. 100"} suffix={value.instrument === "fo" ? "lots" : "shares"} inputMode="numeric" invalid={!!rowError(`t${index}_qty`, row.qty)} />
                  </Field>
                </RepeatCard>
              ))}
              <AddRow label="+ Add Ladder" onClick={() => set({ entries: [...value.entries, { time: "10:00", qty: "" }] })} />
              <p className="text-xs font-medium text-ink-2">Total entry: <span className="font-mono tabular-nums">{total} {value.instrument === "fo" ? `lot${total === 1 ? "" : "s"}` : `share${total === 1 ? "" : "s"}`}</span></p>
            </>
          )}
        </Step>
      </div>
    );
  },

  validate: (c) => {
    const errors: Record<string, string> = {};
    const validateTime = (time: string, key: string) => {
      if (!time) errors[key] = "Pick an entry time";
      else if (toMin(time) < toMin("09:15") || toMin(time) > toMin("15:29")) errors[key] = "Choose a time between 09:15 and 15:29";
    };
    const validateQty = (qty: string, key: string) => {
      const amount = Number(qty);
      if (!qty || amount <= 0 || !Number.isInteger(amount)) errors[key] = "Enter a whole number above 0";
    };
    if (!c.ladder) {
      validateTime(c.time, "time");
      validateQty(c.qty, "qty");
    } else {
      c.entries.forEach((row, index) => {
        validateTime(row.time, `t${index}_time`);
        validateQty(row.qty, `t${index}_qty`);
        if (index > 0 && row.time && c.entries[index - 1].time && toMin(row.time) <= toMin(c.entries[index - 1].time)) {
          errors[`t${index}_time`] = "Each ladder time must be later than the previous one";
        }
      });
    }
    return errors;
  },

  preview: (c) => {
    const rows = c.ladder ? c.entries.map((row, index) => [String(index + 1), `${row.time} IST`, quantityLabel(c.instrument, row.qty)]) : [];
    const total = c.ladder ? c.entries.reduce((sum, row) => sum + (Number(row.qty) || 0), 0) : Number(c.qty) || 0;
    return {
      sentence: c.ladder
        ? [v(`${c.entries.length}-step ladder`), " · ", v(`${total} ${c.instrument === "fo" ? `lot${total === 1 ? "" : "s"}` : "shares"}`), ""]
        : [c.side === "BUY" ? "Buy " : "Sell ", v(quantityLabel(c.instrument, c.qty)), " at ", v(c.time), ""],
      table: rows.length ? { head: ["Ladder", "Time", "Quantity"], rows } : undefined,
    };
  },

  review: (c) => {
    const rows: [string, string][] = [["Instrument", c.instrument === "fo" ? "Futures / Options" : "Stocks"], ["Position Type", c.side === "BUY" ? "Buy" : "Sell"], ["Entry Ladder", c.ladder ? "On" : "Off"]];
    if (c.ladder) rows.push(["Total Entry", `${c.entries.reduce((sum, row) => sum + (Number(row.qty) || 0), 0)} ${c.instrument === "fo" ? "lots" : "shares"}`]);
    else rows.push(["Entry", `${c.time} · ${quantityLabel(c.instrument, c.qty)}`]);
    return [{ title: "Entry plan", rows }];
  },

  short: (c) => c.ladder
    ? `${c.entries.length}-step ladder · ${c.entries.reduce((sum, row) => sum + (Number(row.qty) || 0), 0)} ${c.instrument === "fo" ? "lots" : "shares"}`
    : `${c.side === "BUY" ? "Buy" : "Sell"} ${c.qty || "—"} ${c.instrument === "fo" ? "lots" : "shares"} at ${c.time}`,
  statusText: (c) => `Next entry at ${c.ladder ? (c.entries[0]?.time ?? "—") : c.time}`,
};
