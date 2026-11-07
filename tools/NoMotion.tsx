import { Field, InstrumentField, NumberUnit, Note, Step, TimeInput, clean, v } from "./form";
import { Segmented, TextInput } from "../ui";
import { inr, isFO } from "../data";
import type { ToolModule } from "./types";

type NoMotionType = "window" | "highlow";
type ReferencePrice = "entry" | "ltp";
export type NoMotionConfig = {
  instrument: "stock" | "options";
  exitType: NoMotionType;
  start: string;
  end: string;
  movementType: "pts" | "pct";
  movement: string;
  high: string;
  low: string;
  reference: ReferencePrice;
};

const toMin = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const money = (raw: string) => raw ? inr(Number(raw)) : "₹—";
const INSTRUMENT_OPTIONS = [
  { value: "stock" as const, label: "Stocks" },
  { value: "options" as const, label: "Options" },
];
const EXIT_OPTIONS = [
  { value: "window" as const, label: "Time Window Exit", hint: "Exit if price stalls" },
  { value: "highlow" as const, label: "High / Low Not Break Exit", hint: "Exit if neither level breaks" },
];
const REFERENCE_OPTIONS = [
  { value: "entry" as const, label: "Entry Price" },
  { value: "ltp" as const, label: "Current LTP" },
];

export const noMotion: ToolModule<NoMotionConfig> = {
  defaults: (ctx) => ({
    instrument: ctx.position && !isFO(ctx.position.kind) ? "stock" : "options",
    exitType: "window",
    start: "09:30",
    end: "10:00",
    movementType: "pts",
    movement: "",
    high: "",
    low: "",
    reference: "entry",
  }),

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const err = (key: string, current: string) => (showErrors || current ? errors[key] : undefined);
    const referencePrice = value.reference === "entry" ? ctx.position?.avg : ctx.position?.ltp;
    const ltp = ctx.position?.ltp;
    const boundary = value.movement && referencePrice !== undefined
      ? value.movementType === "pts"
        ? `${inr(referencePrice + Number(value.movement))} / ${inr(referencePrice - Number(value.movement))}`
        : `${inr(referencePrice * (1 + Number(value.movement) / 100))} / ${inr(referencePrice * (1 - Number(value.movement) / 100))}`
      : undefined;
    return (
      <div>
        <Step n={1} title="Instrument Type" hint="Choose which type of position to monitor.">
          <InstrumentField options={INSTRUMENT_OPTIONS} value={value.instrument} onChange={(instrument) => set({ instrument })} lockedFrom={ctx.position?.symbol} />
        </Step>
        <Step n={2} title="Exit Type" hint="Choose what counts as not moving enough.">
          <Segmented options={EXIT_OPTIONS} value={value.exitType} onChange={(exitType) => set({ exitType })} />
        </Step>
        <Step n={3} title="Time Window" hint="Monitor the position between these times.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start Time" error={err("start", value.start)}><TimeInput value={value.start} onChange={(start) => set({ start })} presets={["09:30", "10:00"]} invalid={!!(showErrors && errors.start)} /></Field>
            <Field label="End Time" error={err("end", value.end)}><TimeInput value={value.end} onChange={(end) => set({ end })} presets={["10:00", "10:30", "11:00"]} invalid={!!(showErrors && errors.end)} /></Field>
          </div>
        </Step>
        {value.exitType === "window" ? (
          <>
            <Step n={4} title="Minimum Movement" hint="How far price must move during the window to avoid an exit.">
              <Field error={err("movement", value.movement)}>
                <NumberUnit value={value.movement} onChange={(movement) => set({ movement })} unit={value.movementType} onUnit={(movementType) => set({ movementType })} units={[{ value: "pts", label: "Points" }, { value: "pct", label: "Percentage" }]} placeholder="e.g. 5" invalid={!!err("movement", value.movement)} />
              </Field>
            </Step>
            <Step n={5} title="Reference Price" hint="Use this price as the starting point for measuring movement.">
              <Segmented options={REFERENCE_OPTIONS} value={value.reference} onChange={(reference) => set({ reference })} />
              {boundary && <Note>Boundary {boundary} from {value.reference === "entry" ? "entry" : "current"} {inr(referencePrice ?? 0)}</Note>}
            </Step>
          </>
        ) : (
          <>
            <Step n={4} title="High / Low Values" hint={ltp !== undefined ? `Current LTP ${inr(ltp)} · set the upper and lower levels to watch.` : "Set both price levels to watch."}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="High Value" error={err("high", value.high)}><TextInput value={value.high} onChange={(high) => set({ high: clean(high) })} placeholder="e.g. 520" prefix="₹" inputMode="decimal" invalid={!!err("high", value.high)} /></Field>
                <Field label="Low Value" error={err("low", value.low)}><TextInput value={value.low} onChange={(low) => set({ low: clean(low) })} placeholder="e.g. 480" prefix="₹" inputMode="decimal" invalid={!!err("low", value.low)} /></Field>
              </div>
            </Step>
            <Step n={5} title="Reference Price" hint="Choose the price context for this no-break rule.">
              <Segmented options={REFERENCE_OPTIONS} value={value.reference} onChange={(reference) => set({ reference })} />
            </Step>
          </>
        )}
      </div>
    );
  },

  validate: (c) => {
    const e: Record<string, string> = {};
    if (!c.start) e.start = "Pick a start time";
    if (!c.end) e.end = "Pick an end time";
    if (c.start && c.end && toMin(c.end) <= toMin(c.start)) e.end = "End time must be later than start time";
    if (c.exitType === "window") {
      if (!c.movement || Number(c.movement) <= 0) e.movement = "Enter a movement value above 0";
      else if (c.movementType === "pct" && Number(c.movement) > 100) e.movement = "Percentage can't exceed 100";
    } else {
      if (!c.high || Number(c.high) <= 0) e.high = "Enter a high value above ₹0";
      if (!c.low || Number(c.low) <= 0) e.low = "Enter a low value above ₹0";
      if (c.high && c.low && Number(c.high) <= Number(c.low)) e.high = "High value must be greater than low value";
    }
    return e;
  },

  preview: (c) => {
    const movement = c.movementType === "pts" ? `${c.movement || "—"} points` : `${c.movement || "—"}%`;
    return c.exitType === "window"
      ? { sentence: ["If price doesn't move at least ", v(movement), " between ", v(c.start), " and ", v(c.end), " → Exit"] }
      : { sentence: ["If price does not break ", v(money(c.high)), " or ", v(money(c.low)), " between ", v(c.start), " and ", v(c.end), " → Exit"] };
  },

  review: (c) => [{
    title: "No-motion rule",
    rows: [
      ["Instrument Type", c.instrument === "stock" ? "Stocks" : "Options"],
      ["Exit Type", c.exitType === "window" ? "Time Window Exit" : "High / Low Not Break Exit"],
      ["Time Window", `${c.start}–${c.end}`],
      ...(c.exitType === "window"
        ? [["Minimum Movement", c.movement ? `${c.movement}${c.movementType === "pct" ? "%" : " points"}` : "—"], ["Reference Price", c.reference === "entry" ? "Entry Price" : "Current LTP"]] as [string, string][]
        : [["High Value", money(c.high)], ["Low Value", money(c.low)], ["Reference Price", c.reference === "entry" ? "Entry Price" : "Current LTP"]] as [string, string][]),
    ],
  }],

  short: (c) => c.exitType === "window" ? `Move ${c.movement || "—"}${c.movementType === "pct" ? "%" : " pts"} by ${c.end}` : `No break of ${money(c.high)} / ${money(c.low)} by ${c.end}`,
  statusText: (c) => `Window ends at ${c.end}`,
};
