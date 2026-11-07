import { Field, InstrumentField, NumberUnit, Note, Step, instrumentOf, v } from "./form";
import { num } from "../data";
import type { ToolModule } from "./types";

type Unit = "pts" | "pct";
export type TrailingConfig = { instrument: "fo" | "stock"; move: string; moveUnit: Unit; sl: string; slUnit: Unit };

const UNITS = [
  { value: "pts" as const, label: "Points" },
  { value: "pct" as const, label: "Percentage" },
];

const fmt = (n: string, u: Unit) => (n ? (u === "pts" ? `${n} pts` : `${n}%`) : u === "pts" ? "— pts" : "—%");

export const trailingSL: ToolModule<TrailingConfig> = {
  defaults: (ctx) => ({ instrument: instrumentOf(ctx.position), move: "", moveUnit: "pts", sl: "", slUnit: "pts" }),

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const short = ctx.position?.side === "SELL";
    const err = (k: "move" | "sl") => (showErrors || value[k] ? errors[k] : undefined);
    return (
      <div>
        <Step n={1} title="Instrument Type" hint="Futures, options or stocks.">
          <InstrumentField
            options={[{ value: "fo", label: "Futures / Options" }, { value: "stock", label: "Stocks" }]}
            value={value.instrument}
            onChange={(i) => set({ instrument: i })}
            lockedFrom={ctx.position?.symbol}
          />
        </Step>
        <Step n={2} title="Market moves by" hint={short ? "How far price must fall (in your favour, since you're short) to trigger one trail." : "How far price must rise in your favour to trigger one trail."}>
          <Field error={err("move")}>
            <NumberUnit value={value.move} onChange={(m) => set({ move: m })} unit={value.moveUnit} onUnit={(u) => set({ moveUnit: u })} units={UNITS} placeholder="e.g. 20" invalid={!!err("move")} />
          </Field>
        </Step>
        <Step n={3} title="Move SL by" hint="How much your stop-loss moves each time the market step is reached.">
          <Field error={err("sl")}>
            <NumberUnit value={value.sl} onChange={(m) => set({ sl: m })} unit={value.slUnit} onUnit={(u) => set({ slUnit: u })} units={UNITS} placeholder="e.g. 10" invalid={!!err("sl")} />
          </Field>
          <Note>
            {short
              ? "You're short, so the SL moves down as price falls. It never moves against you."
              : "Your SL only ever moves up. If price falls back, the SL stays where it last moved."}
          </Note>
        </Step>
      </div>
    );
  },

  validate: (c) => {
    const e: Record<string, string> = {};
    const m = Number(c.move);
    const s = Number(c.sl);
    if (!c.move || m <= 0) e.move = "Enter a value above 0";
    else if (c.moveUnit === "pct" && m > 100) e.move = "Percentage can't exceed 100";
    if (!c.sl || s <= 0) e.sl = "Enter a value above 0";
    else if (c.slUnit === "pct" && s > 100) e.sl = "Percentage can't exceed 100";
    return e;
  },

  preview: (c, ctx) => {
    const p = ctx.position;
    const dir = p?.side === "SELL" ? -1 : 1;
    const rows: string[][] = [];
    if (p && c.move && c.sl) {
      for (let i = 1; i <= 3; i++) {
        const step = c.moveUnit === "pts" ? Number(c.move) * i : (p.ltp * Number(c.move) * i) / 100;
        const sl = c.slUnit === "pts" ? Number(c.sl) * i : Number(c.sl) * i;
        rows.push([`₹${num(p.ltp + dir * step)}`, c.slUnit === "pts" ? `${dir > 0 ? "+" : "−"}${num(sl, 0)} pts` : `${dir > 0 ? "+" : "−"}${sl}%`]);
      }
    }
    return {
      sentence: [
        "Every time ", v(p?.symbol ?? "the position"), p?.side === "SELL" ? " falls by " : " rises by ", v(fmt(c.move, c.moveUnit)),
        ", move the stop-loss by ", v(fmt(c.sl, c.slUnit)), ".",
      ],
      table: rows.length ? { head: ["Price reaches", "SL moved (total)"], rows } : undefined,
    };
  },

  review: (c) => [
    {
      title: "Trail rule",
      rows: [
        ["Instrument Type", c.instrument === "fo" ? "Futures / Options" : "Stocks"],
        ["Market moves by", fmt(c.move, c.moveUnit)],
        ["Move SL by", fmt(c.sl, c.slUnit)],
      ],
    },
  ],

  short: (c) => `${fmt(c.move, c.moveUnit)} → SL ${fmt(c.sl, c.slUnit)}`,
  statusText: () => "Trailing",
};
