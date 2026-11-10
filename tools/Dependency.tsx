import { useState } from "react";
import { Field, Note, Step, OrderPolicyFields, defaultOrderPolicy, validateOrderPolicy, clean, v, type OrderPolicy } from "./form";
import { Segmented, TextInput } from "../ui";
import { INSTRUMENTS, inr, isFO, type Instrument, type Position } from "../data";
import type { ToolModule } from "./types";
import { useToolData } from "../tool-data";

type Direction = "above" | "below";
type Action = "entry" | "exit";
type ExitQuantity = "full" | "partial";
type QuantityType = "qty" | "pct";
export type DependencyConfig = {
  referenceSymbol: string;
  level: string;
  direction: Direction;
  action: Action;
  entrySymbol: string;
  entryQuantity: string;
  entrySide?: "BUY" | "SELL";
  exitPositionId: string;
  exitQuantity: ExitQuantity;
  quantityType: QuantityType;
  exitValue: string;
  orderPolicy?: OrderPolicy;
};

const referenceOptions: Instrument[] = INSTRUMENTS;
const entryOptions = INSTRUMENTS.filter((instrument) => instrument.meta !== "Index");
const directionOptions = [
  { value: "above" as const, label: "Cross Above" },
  { value: "below" as const, label: "Cross Below" },
];
const actionOptions = [
  { value: "entry" as const, label: "Entry" },
  { value: "exit" as const, label: "Exit" },
];
const fmtLevel = (level: string) => level ? inr(Number(level)) : "₹—";
const instrumentName = (items: Instrument[], symbol: string) => items.find((item) => item.symbol === symbol)?.symbol ?? (symbol || "Select instrument");
const positionById = (positions: Position[], id: string) => positions.find((position) => position.id === id);

export const dependency: ToolModule<DependencyConfig> = {
  defaults: () => ({ referenceSymbol: "NIFTY", level: "", direction: "above", action: "entry", entrySymbol: entryOptions[0]?.symbol ?? "", entryQuantity: "", entrySide: "BUY", exitPositionId: "", exitQuantity: "full", quantityType: "qty", exitValue: "", orderPolicy: defaultOrderPolicy("stock") }),

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const toolData = useToolData();
    const liveOptions: Instrument[] = toolData.instruments.map((item) => ({ symbol:item.display_symbol, exchange:item.exchange, kind:item.kind, ltp:0, lotSize:Number(item.lot_size), meta:`${item.exchange} · PAPER catalogue` }));
    const liveEntries = liveOptions;
    const selectedExit = positionById(ctx.positions, value.exitPositionId);
    const entryInstrument = liveEntries.find((instrument) => instrument.symbol === value.entrySymbol);
    const refInstrument = liveOptions.find((instrument) => instrument.symbol === value.referenceSymbol);
    const error = (key: string, raw: string) => (showErrors || raw ? errors[key] : undefined);
    return (
      <div>
        <Step n={1} title="Reference Instrument" hint="This is the price you will monitor for a fresh crossing.">
          <InstrumentSelect items={liveOptions} value={value.referenceSymbol} onChange={(referenceSymbol) => set({ referenceSymbol })} placeholder="Search instruments" />
          {refInstrument && <p className="text-xs text-muted">Current LTP <span className="font-mono tabular-nums text-ink-2">{inr(refInstrument.ltp)}</span></p>}
        </Step>
        <Step n={2} title="Level" hint={refInstrument ? `Set the price level · current LTP ${inr(refInstrument.ltp)}.` : "Set the price level to watch."}>
          <Field error={error("level", value.level)}>
            <TextInput value={value.level} onChange={(level) => set({ level: clean(level) })} placeholder="e.g. 25,000" prefix="₹" inputMode="decimal" invalid={!!error("level", value.level)} />
          </Field>
        </Step>
        <Step n={3} title="Crossing Direction" hint="The rule waits for price to cross from the other side.">
          <Segmented options={directionOptions} value={value.direction} onChange={(direction) => set({ direction })} />
        </Step>
        <Step n={4} title="Action" hint="Choose whether the cross starts an entry or exits an open position.">
          <Segmented options={actionOptions} value={value.action} onChange={(action) => set({ action })} />
        </Step>
        {value.action === "entry" ? (
          <>
            <Step n={5} title="Entry Instrument" hint="This can be different from the reference instrument.">
              <InstrumentSelect items={liveEntries} value={value.entrySymbol} onChange={(entrySymbol) => set({ entrySymbol })} placeholder="Search stocks or contracts" />
            </Step>
            <Step n={6} title="Quantity" hint="The quantity to enter after the crossing is detected.">
              <Field label="Entry Side" error={showErrors ? errors.entrySide : undefined}><Segmented options={[{ value: "BUY" as const, label: "Buy" }, { value: "SELL" as const, label: "Sell" }]} value={value.entrySide ?? "BUY"} onChange={(entrySide) => set({ entrySide })} /></Field>
              <Field error={error("entryQuantity", value.entryQuantity)} hint={entryInstrument ? `${entryInstrument.meta} · lot size ${entryInstrument.lotSize}` : undefined}>
                <TextInput value={value.entryQuantity} onChange={(entryQuantity) => set({ entryQuantity: entryQuantity.replace(/[^0-9]/g, "") })} placeholder={entryInstrument && isFO(entryInstrument.kind) ? "e.g. 900" : "e.g. 100"} suffix="qty" inputMode="numeric" invalid={!!error("entryQuantity", value.entryQuantity)} />
              </Field>
            </Step>
            <Step n={7} title="Paper Order Policy" hint="How the dependency entry is simulated. No live order is submitted.">
              <OrderPolicyFields value={value.orderPolicy ?? defaultOrderPolicy(entryInstrument && isFO(entryInstrument.kind) ? "fo" : "stock")} onChange={(orderPolicy) => set({ orderPolicy })} instrument={entryInstrument && isFO(entryInstrument.kind) ? "fo" : "stock"} errors={errors} showErrors={showErrors} />
            </Step>
          </>
        ) : (
          <>
            <Step n={5} title="Exit Instrument" hint="Choose an instrument with an open position.">
              <PositionSelect positions={ctx.positions} value={value.exitPositionId} onChange={(exitPositionId) => set({ exitPositionId })} />
              {selectedExit && <p className="text-xs text-muted">Open quantity <span className="font-mono tabular-nums text-ink-2">{selectedExit.qty}</span> {isFO(selectedExit.kind) ? `qty · ${Math.round(selectedExit.qty / selectedExit.lotSize)} lots` : "shares"}</p>}
              {showErrors && errors.exitPositionId && <p className="text-xs font-medium text-loss">{errors.exitPositionId}</p>}
            </Step>
            <Step n={6} title="Exit Quantity" hint="Exit the full open position or configure a partial exit.">
              <Segmented options={[{ value: "full" as const, label: "Full Position" }, { value: "partial" as const, label: "Partial Position" }]} value={value.exitQuantity} onChange={(exitQuantity) => set({ exitQuantity })} />
              {value.exitQuantity === "partial" && (
                <>
                  <div className="pt-1"><span className="text-xs font-medium text-ink-2">Quantity Type</span><div className="mt-1.5"><Segmented options={[{ value: "qty" as const, label: "Quantity" }, { value: "pct" as const, label: "Percentage" }]} value={value.quantityType} onChange={(quantityType) => set({ quantityType })} /></div></div>
                  <Field label={value.quantityType === "qty" ? "Quantity" : "Percentage"} error={error("exitValue", value.exitValue)} hint={value.quantityType === "pct" ? "Percentage of the current eligible position." : selectedExit ? `Open quantity ${selectedExit.qty}${isFO(selectedExit.kind) ? ` · multiples of ${selectedExit.lotSize}` : ""}` : undefined}>
                    <TextInput value={value.exitValue} onChange={(exitValue) => set({ exitValue: value.quantityType === "pct" ? clean(exitValue) : exitValue.replace(/[^0-9]/g, "") })} placeholder={value.quantityType === "pct" ? "e.g. 50" : "e.g. 100"} suffix={value.quantityType === "pct" ? "%" : isFO(selectedExit?.kind ?? "stock") ? "qty" : "shares"} inputMode={value.quantityType === "pct" ? "decimal" : "numeric"} invalid={!!error("exitValue", value.exitValue)} />
                  </Field>
                </>
              )}
            </Step>
          </>
        )}
        <Note>If {value.referenceSymbol || "the reference instrument"} is already {value.direction === "above" ? "above" : "below"} {value.level ? fmtLevel(value.level) : "the level"} when you arm this, it waits for a fresh cross.</Note>
      </div>
    );
  },

  validate: (c, ctx) => {
    const e: Record<string, string> = {};
    if (!c.referenceSymbol) e.referenceSymbol = "Choose a reference instrument";
    if (!c.level || Number(c.level) <= 0) e.level = "Enter a valid price level above ₹0";
    if (c.action === "entry") {
      if (!c.entrySymbol) e.entrySymbol = "Choose an entry instrument";
      if (!c.entryQuantity || Number(c.entryQuantity) <= 0 || !Number.isInteger(Number(c.entryQuantity))) e.entryQuantity = "Enter a whole quantity above 0";
      if (!c.entrySide) e.entrySide = "Choose Buy or Sell";
      Object.assign(e, validateOrderPolicy(c.orderPolicy));
    } else {
      const position = positionById(ctx.positions, c.exitPositionId);
      if (!position) e.exitPositionId = "Choose an open position to exit";
      if (c.exitQuantity === "partial") {
        const amount = Number(c.exitValue);
        if (!c.exitValue || amount <= 0) e.exitValue = "Enter an exit value above 0";
        else if (c.quantityType === "pct" && amount > 100) e.exitValue = "Percentage can't exceed 100";
        else if (c.quantityType === "qty" && position && amount > position.qty) e.exitValue = `Can't exceed your open quantity of ${position.qty}`;
        else if (c.quantityType === "qty" && position && isFO(position.kind) && amount % position.lotSize !== 0) e.exitValue = `Must be a multiple of the lot size (${position.lotSize})`;
      }
    }
    return e;
  },

  preview: (c, ctx) => {
    const reference = c.referenceSymbol || "the reference instrument";
    const crossing = `${reference} crosses ${c.direction} ${fmtLevel(c.level)}`;
    if (c.action === "entry") return { sentence: ["Enter ", v(c.entryQuantity ? `${c.entryQuantity} quantity` : "— quantity"), " of ", v(instrumentName(entryOptions, c.entrySymbol)), " when ", v(crossing), "."] };
    const position = positionById(ctx.positions, c.exitPositionId);
    const amount = c.exitQuantity === "full" ? "the full" : c.quantityType === "pct" ? `${c.exitValue || "—"}% of` : `${c.exitValue || "—"} quantity of`;
    return { sentence: ["Exit ", v(amount), " ", v(position?.symbol ?? "the selected position"), " when ", v(crossing), "."] };
  },

  review: (c, ctx) => {
    const rows: [string, string][] = [["Reference Instrument", c.referenceSymbol], ["Level", fmtLevel(c.level)], ["Crossing Direction", c.direction === "above" ? "Cross Above" : "Cross Below"], ["Action", c.action === "entry" ? "Entry" : "Exit"]];
    if (c.action === "entry") rows.push(["Entry Instrument", instrumentName(entryOptions, c.entrySymbol)], ["Entry Side", c.entrySide ?? "—"], ["Quantity", `${c.entryQuantity || "—"} qty`], ["Paper Order", c.orderPolicy ? `${c.orderPolicy.orderType} · ${c.orderPolicy.product} · ${c.orderPolicy.validity}` : "—"]);
    else {
      const position = positionById(ctx.positions, c.exitPositionId);
      rows.push(["Exit Instrument", position?.symbol ?? "—"], ["Exit Quantity", c.exitQuantity === "full" ? "Full Position" : `${c.exitValue || "—"} ${c.quantityType === "pct" ? "%" : "qty"}`]);
    }
    return [{ title: "Dependency rule", rows }];
  },

  short: (c) => c.action === "entry"
    ? `${c.referenceSymbol} ${c.direction === "above" ? "↑" : "↓"} ${c.level || "—"} → Enter ${c.entryQuantity || "—"}`
    : `${c.referenceSymbol} ${c.direction === "above" ? "↑" : "↓"} ${c.level || "—"} → Exit ${c.exitQuantity === "full" ? "full" : c.exitValue || "—"}`,
  statusText: (c) => `Waiting for ${c.referenceSymbol || "instrument"} to cross ${c.direction} ${c.level || "level"}`,
  targetLabel: (c, ctx) => c.action === "entry"
    ? instrumentName(entryOptions, c.entrySymbol)
    : positionById(ctx.positions, c.exitPositionId)?.symbol ?? "Selected position",
};

function InstrumentSelect({ items, value, onChange, placeholder }: { items: Instrument[]; value: string; onChange: (symbol: string) => void; placeholder: string }) {
  const [search, setSearch] = useState("");
  const selected = items.find((instrument) => instrument.symbol === value);
  const filtered = items.filter((instrument) => `${instrument.symbol} ${instrument.meta}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <TextInput value={search} onChange={setSearch} placeholder={placeholder} />
      {selected && <p className="text-xs text-muted">Selected: <span className="font-medium text-ink-2">{selected.symbol}</span> · LTP <span className="font-mono tabular-nums text-ink-2">{inr(selected.ltp)}</span></p>}
      <div className="max-h-48 overflow-y-auto rounded-md border border-line">
        {filtered.length ? filtered.map((instrument) => (
          <button key={instrument.symbol} type="button" onClick={() => { onChange(instrument.symbol); setSearch(""); }} className={["flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-b-0", value === instrument.symbol ? "bg-primary-soft" : "bg-surface hover:bg-surface-2"].join(" ")}>
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{instrument.symbol}</span><span className="block text-xs text-muted">{instrument.meta}</span></span><span className="shrink-0 font-mono text-xs tabular-nums text-ink-2">{inr(instrument.ltp)}</span>
          </button>
        )) : <p className="px-3 py-3 text-sm text-muted">No matching instruments.</p>}
      </div>
    </div>
  );
}

function PositionSelect({ positions, value, onChange }: { positions: Position[]; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = positions.filter((position) => position.symbol.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <TextInput value={search} onChange={setSearch} placeholder="Search open positions" />
      <div className="max-h-48 overflow-y-auto rounded-md border border-line">
        {filtered.length ? filtered.map((position) => (
          <button key={position.id} type="button" onClick={() => { onChange(position.id); setSearch(""); }} className={["flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-b-0", value === position.id ? "bg-primary-soft" : "bg-surface hover:bg-surface-2"].join(" ")}>
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{position.symbol}</span><span className="block text-xs text-muted">{position.qty} {isFO(position.kind) ? "qty" : "shares"}</span></span><span className="font-mono text-xs tabular-nums text-ink-2">{inr(position.ltp)}</span>
          </button>
        )) : <p className="px-3 py-3 text-sm text-muted">No open positions found.</p>}
      </div>
    </div>
  );
}
