import { useState } from "react";
import { Field, Note, RepeatCard, Step, AddRow, clean, v } from "./form";
import { Button, Segmented, TextInput } from "../ui";
import { inr, pnlOf, type Position } from "../data";
import type { ToolModule } from "./types";

type PositionType = "single" | "basket";
type LockLevel = { target: string; lock: string };
export type MtmLockConfig = {
  positionType: PositionType;
  selectedPositionIds: string[];
  basket: string;
  activation: string;
  progressive: boolean;
  protected: string;
  levels: LockLevel[];
};

const BASKETS = [
  { name: "BANKNIFTY Short Strangle", legs: ["BANKNIFTY 52000 CE", "BANKNIFTY 52000 PE"] },
  { name: "NIFTY Iron Condor", legs: ["NIFTY 24500 CE", "NIFTY 24500 PE", "NIFTY 24600 CE", "NIFTY 24400 PE"] },
  { name: "RELIANCE Hedged Strategy", legs: ["RELIANCE", "NIFTY JUN FUT"] },
];
const money = (value: string) => value ? inr(Number(value)) : "₹—";
const selectedPositions = (ids: string[], positions: Position[]) => positions.filter((position) => ids.includes(position.id));
const basketByName = (name: string) => BASKETS.find((basket) => basket.name === name);

export const mtmLock: ToolModule<MtmLockConfig> = {
  defaults: () => ({ positionType: "single", selectedPositionIds: [], basket: "", activation: "", progressive: false, protected: "", levels: [{ target: "", lock: "" }] }),

  Form: ({ value, set, ctx, errors, showErrors }) => {
    const picked = selectedPositions(value.selectedPositionIds, ctx.positions);
    const available = ctx.positions.filter((position) => !value.selectedPositionIds.includes(position.id));
    const combinedMtm = picked.reduce((total, position) => total + pnlOf(position), 0);
    const fieldError = (key: string, raw: string) => (showErrors || raw ? errors[key] : undefined);
    return (
      <div>
        <Step n={1} title="Position Type" hint="Choose positions individually or protect a complete strategy.">
          <Segmented options={[{ value: "single", label: "Single Position" }, { value: "basket", label: "Basket / Strategy" }]} value={value.positionType} onChange={(positionType) => set({ positionType, basket: positionType === "basket" ? value.basket : "" })} />
          {value.positionType === "single" ? (
            <div className="flex flex-col gap-3">
              <Field label="Select Positions" error={showErrors && !picked.length ? errors.positions : undefined} hint="Search your open positions. Already-added positions are hidden.">
                <PositionPicker positions={available} onAdd={(id) => set({ selectedPositionIds: [id] })} />
              </Field>
              {picked.length > 0 && (
                <div className="flex flex-col gap-2">
                  {picked.map((position) => (
                    <div key={position.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2.5">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{position.symbol}</p><p className="text-xs text-muted">{position.exchange} · {position.qty} {position.kind === "stock" ? "shares" : `qty · ${Math.round(position.qty / position.lotSize)} lots`}</p></div>
                      <button type="button" aria-label={`Remove ${position.symbol}`} onClick={() => set({ selectedPositionIds: value.selectedPositionIds.filter((id) => id !== position.id) })} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-loss-soft hover:text-loss">×</button>
                    </div>
                  ))}
                  <Note>Combined current MTM <span className="ml-1 font-mono font-semibold tabular-nums">{inr(combinedMtm)}</span></Note>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="Select Basket Positions" error={showErrors && picked.length < 2 ? errors.positions ?? errors.basket : undefined} hint="Choose at least two open positions. Positions may belong to different connected brokers.">
                <PositionPicker positions={available} onAdd={(id) => set({ selectedPositionIds: [...value.selectedPositionIds, id], basket: `${value.selectedPositionIds.length + 1}-position basket` })} />
              </Field>
              {picked.map((position) => <div key={position.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2"><span className="text-sm font-medium">{position.symbol}</span><button type="button" onClick={() => { const ids = value.selectedPositionIds.filter((id) => id !== position.id); set({ selectedPositionIds: ids, basket: ids.length ? `${ids.length}-position basket` : "" }); }} className="text-muted hover:text-loss">×</button></div>)}
            </div>
          )}
        </Step>
        <Step n={2} title="Activation Level" hint="Protection starts only after the selected MTM reaches this amount.">
          <Field label="MTM Activation" error={fieldError("activation", value.activation)}>
            <TextInput value={value.activation} onChange={(activation) => set({ activation: clean(activation) })} placeholder="e.g. 5,000" prefix="₹" inputMode="decimal" invalid={!!fieldError("activation", value.activation)} />
          </Field>
        </Step>
        <Step n={3} title="Progressive Lock" hint="Raise the protected floor as MTM reaches higher levels." aside={<div className="flex items-center gap-2"><span className="text-xs font-medium text-ink-2">Progressive Lock</span><button type="button" role="switch" aria-checked={value.progressive} aria-label="Progressive Lock" onClick={() => set({ progressive: !value.progressive })} className={["relative inline-flex h-6 w-11 items-center rounded-full", value.progressive ? "bg-primary" : "bg-line-strong"].join(" ")}><span className={["inline-block h-5 w-5 rounded-full bg-white shadow-card", value.progressive ? "ml-5.5" : "ml-0.5"].join(" ")} /></button></div>}>
          {!value.progressive ? (
            <Field label="Protected MTM" error={fieldError("protected", value.protected)} hint="If MTM falls to this level after activation, the selected positions exit.">
              <TextInput value={value.protected} onChange={(protectedValue) => set({ protected: clean(protectedValue) })} placeholder="e.g. 3,500" prefix="₹" inputMode="decimal" invalid={!!fieldError("protected", value.protected)} />
            </Field>
          ) : (
            <>
              {value.levels.map((level, index) => (
                <RepeatCard key={index} title={`Lock Level ${index + 1}`} onRemove={index > 0 ? () => set({ levels: value.levels.filter((_, i) => i !== index) }) : undefined}>
                  <Field label="MTM Target" error={fieldError(`l${index}_target`, level.target)}><TextInput value={level.target} onChange={(target) => set({ levels: value.levels.map((item, i) => i === index ? { ...item, target: clean(target) } : item) })} placeholder="e.g. 5,000" prefix="₹" inputMode="decimal" invalid={!!fieldError(`l${index}_target`, level.target)} /></Field>
                  <Field label="Lock Value" error={fieldError(`l${index}_lock`, level.lock)}><TextInput value={level.lock} onChange={(lock) => set({ levels: value.levels.map((item, i) => i === index ? { ...item, lock: clean(lock) } : item) })} placeholder="e.g. 3,500" prefix="₹" inputMode="decimal" invalid={!!fieldError(`l${index}_lock`, level.lock)} /></Field>
                </RepeatCard>
              ))}
              <AddRow label="+ Add Lock Level" onClick={() => set({ levels: [...value.levels, { target: "", lock: "" }] })} />
            </>
          )}
        </Step>
      </div>
    );
  },

  validate: (c) => {
    const e: Record<string, string> = {};
    if (c.positionType === "single" && c.selectedPositionIds.length === 0) e.positions = "Select at least one position to create an MTM Lock.";
    if (c.positionType === "basket" && c.selectedPositionIds.length < 2) e.positions = "Select at least two positions for the basket.";
    const activation = Number(c.activation);
    if (!c.activation || activation <= 0) e.activation = "Enter an MTM value greater than ₹0.";
    if (!c.progressive) {
      const protectedValue = Number(c.protected);
      if (!c.protected || protectedValue < 0) e.protected = "Enter a protected MTM value.";
      else if (c.activation && protectedValue >= activation) e.protected = "Protected MTM must be below the activation level.";
    } else {
      let previousTarget = activation;
      let previousLock = Number.NEGATIVE_INFINITY;
      const seenTargets = new Set<number>();
      c.levels.forEach((level, index) => {
        const targetKey = `l${index}_target`;
        const lockKey = `l${index}_lock`;
        const target = Number(level.target);
        const lock = Number(level.lock);
        if (!level.target || !level.lock) {
          if (!level.target) e[targetKey] = "Complete this lock level or remove it.";
          if (!level.lock) e[lockKey] = "Complete this lock level or remove it.";
        } else {
          if (target <= 0 || target <= previousTarget) e[targetKey] = "MTM target must be greater than the previous level.";
          if (seenTargets.has(target)) e[targetKey] = "Each lock level must have a unique MTM target.";
          if (lock >= target) e[lockKey] = "Protected MTM must be below the activation level.";
          if (lock < previousLock) e[lockKey] = "Lock value must be greater than the previous protected level.";
          seenTargets.add(target);
          previousTarget = target;
          previousLock = lock;
        }
      });
    }
    return e;
  },

  preview: (c) => {
    if (!c.progressive) return { sentence: ["Once MTM reaches ", v(money(c.activation)), ", protect ", v(money(c.protected)), ". If MTM falls to ", v(money(c.protected)), " → exit all selected positions."] };
    return {
      sentence: ["Protect selected positions progressively as MTM reaches each level."],
      table: { head: ["Level", "MTM Target", "Protect"], rows: c.levels.map((level, index) => [String(index + 1), money(level.target), money(level.lock)]) },
    };
  },

  review: (c, ctx) => {
    const target = c.positionType === "basket" ? c.basket || "—" : selectedPositions(c.selectedPositionIds, ctx.positions).map((position) => position.symbol).join(" + ") || "—";
    return [{ title: "MTM protection", rows: [["Position Type", c.positionType === "single" ? "Single Position" : "Basket / Strategy"], ["Target", target], ["Activation Level", money(c.activation)], ...(c.progressive ? c.levels.map((level, index) => [`Lock Level ${index + 1}`, `${money(level.target)} → protect ${money(level.lock)}`] as [string, string]) : [["Protected MTM", money(c.protected)] as [string, string]])] }];
  },

  short: (c) => c.progressive ? `${c.levels.length} progressive levels` : `At ${money(c.activation)} → protect ${money(c.protected)}`,
  statusText: (c) => `Inactive until ${money(c.activation)} MTM`,
  targetLabel: (c, ctx) => c.positionType === "basket"
    ? c.basket || "Selected basket"
    : selectedPositions(c.selectedPositionIds, ctx.positions).map((position) => position.symbol).join(" + ") || "Selected positions",
};

function PositionPicker({ positions, onAdd }: { positions: Position[]; onAdd: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = positions.filter((position) => position.symbol.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <TextInput value={search} onChange={setSearch} placeholder="Search open positions" />
      {filtered.length ? filtered.map((position) => (
        <div key={position.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2">
          <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{position.symbol}</p><p className="text-xs text-muted">{position.exchange} · {inr(position.ltp)}</p></div>
          <Button size="sm" variant="secondary" onClick={() => onAdd(position.id)}>+ Add Position</Button>
        </div>
      )) : <p className="text-xs text-muted">No more open positions to add.</p>}
    </div>
  );
}
