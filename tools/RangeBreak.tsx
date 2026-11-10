import { Field, InstrumentField, Step, ExitQuantitySteps, EXIT_QTY_DEFAULT, exitPhrase, validateExitQty, instrumentOf, clean, v, type ExitQty } from "./form";
import { Segmented, TextInput } from "../ui";
import { inr, num } from "../data";
import type { ToolModule } from "./types";

type RangeLevel = "high" | "low";
type BreakDirection = "above" | "below" | "either";
type TriggerType = "touch" | "cross" | "close";
export type RangeBreakConfig = ExitQty & {
  instrument: "fo" | "stock";
  rangeLevel: RangeLevel;
  price: string;
  direction: BreakDirection;
  trigger: TriggerType;
  candleInterval?: "1m" | "3m" | "5m" | "15m";
};

const INSTRUMENT_OPTIONS = [
  { value: "fo" as const, label: "Futures / Options" },
  { value: "stock" as const, label: "Stocks" },
];
const LEVEL_OPTIONS = [
  { value: "high" as const, label: "High Level" },
  { value: "low" as const, label: "Low Level" },
];
const DIRECTION_OPTIONS = [
  { value: "above" as const, label: "Above" },
  { value: "below" as const, label: "Below" },
  { value: "either" as const, label: "Either" },
];
const TRIGGER_OPTIONS = [
  { value: "touch" as const, label: "Touch", hint: "Reaches level" },
  { value: "cross" as const, label: "Cross", hint: "Moves through" },
  { value: "close" as const, label: "Candle Close", hint: "Candle closes beyond" },
];
const levelName = (level: RangeLevel) => level === "high" ? "High Level" : "Low Level";
const triggerPhrase = (trigger: TriggerType) => trigger === "touch" ? "touches" : trigger === "cross" ? "crosses" : "closes beyond";

export const rangeBreak: ToolModule<RangeBreakConfig> = {
  defaults: (ctx) => ({ ...EXIT_QTY_DEFAULT, partialType: instrumentOf(ctx.position) === "fo" ? "lots" : "qty", instrument: instrumentOf(ctx.position), rangeLevel: "high", price: "", direction: "above", trigger: "touch", candleInterval: "1m" }),

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const instrument = value.instrument;
    const ltp = ctx.position?.ltp;
    return (
      <div>
        <Step n={1} title="Instrument Type" hint="Sets which partial-exit quantities are available.">
          <InstrumentField options={INSTRUMENT_OPTIONS} value={instrument} onChange={(next) => set({ instrument: next, partialType: next === "fo" ? "lots" : "qty" })} lockedFrom={ctx.position?.symbol} />
        </Step>
        <Step n={2} title="Range Level" hint={`Choose the boundary and set its price${ltp === undefined ? "." : ` · current LTP ${inr(ltp)}.`}`}>
          <Segmented options={LEVEL_OPTIONS} value={value.rangeLevel} onChange={(rangeLevel) => set({ rangeLevel })} />
          <Field label={`${levelName(value.rangeLevel)} price`} error={showErrors || value.price ? errors.price : undefined}>
            <TextInput value={value.price} onChange={(price) => set({ price: clean(price) })} placeholder={ltp === undefined ? "e.g. 24,500" : `e.g. ${num(ltp, 0)}`} prefix="₹" inputMode="decimal" invalid={!!(showErrors && errors.price)} />
          </Field>
        </Step>
        <Step n={3} title="Break Direction" hint="Choose which direction through the selected level should trigger.">
          <Segmented options={DIRECTION_OPTIONS} value={value.direction} onChange={(direction) => set({ direction })} />
        </Step>
        <Step n={4} title="Trigger Type" hint="Decide how price must meet or pass the level.">
          <Segmented options={TRIGGER_OPTIONS} value={value.trigger} onChange={(trigger) => set({ trigger })} />
          {value.trigger === "close" && <Field label="Candle Interval" error={showErrors ? errors.candleInterval : undefined}><Segmented options={["1m", "3m", "5m", "15m"].map((interval) => ({ value: interval as "1m" | "3m" | "5m" | "15m", label: interval }))} value={value.candleInterval ?? "1m"} onChange={(candleInterval) => set({ candleInterval })} /></Field>}
        </Step>
        <ExitQuantitySteps start={5} value={value} set={set} instrument={instrument} position={ctx.position} errors={errors} showErrors={showErrors} />
      </div>
    );
  },

  validate: (c, ctx) => {
    const e: Record<string, string> = {};
    if (!c.price || Number(c.price) <= 0) e.price = "Enter a valid price level above ₹0";
    if (c.trigger === "close" && !c.candleInterval) e.candleInterval = "Choose a candle interval";
    return { ...e, ...validateExitQty(c, c.instrument, ctx.position) };
  },

  preview: (c, ctx) => ({
    sentence: [
      "When price ",
      v(c.trigger === "touch" ? "touches" : c.trigger === "cross" ? `crosses ${c.direction}` : `closes ${c.direction === "either" ? "beyond" : c.direction}`),
      " the ", v(levelName(c.rangeLevel)), " ", v(c.price ? inr(Number(c.price)) : "₹—"),
      " → Exit ", v(exitPhrase(c, c.instrument)), c.exitType === "partial" ? " of " : " of ", v(ctx.position?.symbol ?? "the position"), ".",
    ],
  }),

  review: (c, ctx) => [{
    title: "Range break rule",
    rows: [
      ["Instrument Type", c.instrument === "fo" ? "Futures / Options" : "Stocks"],
      ["Range Level", `${levelName(c.rangeLevel)} · ${c.price ? inr(Number(c.price)) : "—"}`],
      ["Break Direction", c.direction === "either" ? "Either" : c.direction === "above" ? "Above" : "Below"],
      ["Trigger Type", c.trigger === "close" ? "Candle Close" : c.trigger === "touch" ? "Touch" : "Cross"],
      ...(c.trigger === "close" ? [["Candle Interval", c.candleInterval ?? "—"]] as [string, string][] : []),
      ["Exit Type", c.exitType === "full" ? "Full Exit" : "Partial Exit"],
      ...(c.exitType === "partial" ? [["Partial Exit", exitPhrase(c, c.instrument)], ["Remaining", ctx.position ? `${Math.max(0, (c.instrument === "fo" ? Math.round(ctx.position.qty / ctx.position.lotSize) : ctx.position.qty) - Number(c.instrument === "fo" && c.partialType === "lots" ? c.lots : c.partialType === "qty" ? c.qty : 0))} ${c.instrument === "fo" ? "lots" : "shares"}` : "—"]] as [string, string][] : []),
    ],
  }],

  short: (c) => `${levelName(c.rangeLevel)} ${c.price ? inr(Number(c.price)) : "—"} → Exit ${exitPhrase(c, c.instrument)}`,
  statusText: (c) => `Watching ${levelName(c.rangeLevel).toLowerCase()} ${c.price ? inr(Number(c.price)) : "level"}`,
};
