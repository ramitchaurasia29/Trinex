import { Field, InstrumentField, Step, TimeInput, ExitQuantitySteps, EXIT_QTY_DEFAULT, exitPhrase, remainingAfter, validateExitQty, instrumentOf, v, type ExitQty } from "./form";
import type { ToolModule } from "./types";

export type TimedExitConfig = ExitQty & { instrument: "fo" | "stock"; time: string };

const INSTRUMENT_OPTS = [
  { value: "fo" as const, label: "Futures / Options" },
  { value: "stock" as const, label: "Stocks" },
];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const timedExit: ToolModule<TimedExitConfig> = {
  defaults: (ctx) => {
    const instrument = instrumentOf(ctx.position);
    return { ...EXIT_QTY_DEFAULT, partialType: instrument === "fo" ? "lots" : "qty", instrument, time: "15:10" };
  },

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const late = value.time && toMin(value.time) >= toMin("15:15") && ctx.position?.product === "MIS";
    return (
      <div>
        <Step n={1} title="Instrument Type" hint="Decides how a partial exit is counted.">
          <InstrumentField
            options={INSTRUMENT_OPTS}
            value={value.instrument}
            onChange={(i) => set({ instrument: i, partialType: i === "fo" ? "lots" : "qty" })}
            lockedFrom={ctx.position?.symbol}
          />
        </Step>
        <Step n={2} title="Exit Time" hint="The tool exits at this exact time, during market hours.">
          <Field error={showErrors || value.time ? errors.time : undefined} hint={late ? "Heads-up: brokers start auto square-off for MIS at 15:15. 15:10 avoids that slippage." : undefined}>
            <TimeInput value={value.time} onChange={(t) => set({ time: t })} presets={["14:30", "15:00", "15:10", "15:14"]} invalid={!!(showErrors && errors.time)} />
          </Field>
        </Step>
        <ExitQuantitySteps start={3} value={value} set={set} instrument={value.instrument} position={ctx.position} errors={errors} showErrors={showErrors} />
      </div>
    );
  },

  validate: (c, ctx) => {
    const e: Record<string, string> = {};
    if (!c.time) e.time = "Pick an exit time";
    else if (toMin(c.time) < toMin("09:15") || toMin(c.time) > toMin("15:29")) e.time = "Choose a time between 09:15 and 15:29";
    return { ...e, ...validateExitQty(c, c.instrument, ctx.position) };
  },

  preview: (c, ctx) => {
    const rem = remainingAfter(c, c.instrument, ctx.position);
    return {
      sentence: [
        "At ", v(c.time), " IST, exit ", v(exitPhrase(c, c.instrument)), " of ", v(ctx.position?.symbol ?? "your position"), ".",
        ...(c.exitType === "partial" && rem ? [" ", v(rem), " stay open."] : []),
      ],
    };
  },

  review: (c, ctx) => [
    { title: "Timing", rows: [["Instrument Type", c.instrument === "fo" ? "Futures / Options" : "Stocks"], ["Exit Time", `${c.time} IST`]] },
    {
      title: "Quantity",
      rows: [
        ["Exit Type", c.exitType === "full" ? "Full Exit" : "Partial Exit"],
        ...(c.exitType === "full"
          ? ([["Quantity", "100% Quantity"]] as [string, string][])
          : ([
              ["Partial Exit Type", c.partialType === "lots" ? "Lot-Based" : c.partialType === "qty" ? "Quantity-Based" : "Percentage-Based"],
              [c.partialType === "lots" ? "Number of Lots" : c.partialType === "qty" ? "Quantity" : "Percentage", exitPhrase(c, c.instrument)],
              ["Remaining after exit", remainingAfter(c, c.instrument, ctx.position) ?? "—"],
            ] as [string, string][])),
      ],
    },
  ],

  short: (c) => `Exit ${exitPhrase(c, c.instrument)} at ${c.time}`,
  statusText: (c) => `Fires at ${c.time}`,
};
