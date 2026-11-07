import type { JSX } from "react";
import type { Instrument, Position } from "../data";

/** A preview sentence: plain strings, with `{ v }` for highlighted values. */
export type Part = string | { v: string };

export type Preview = {
  sentence: Part[];
  /** Optional ladder / step table shown under the sentence. */
  table?: { head: string[]; rows: string[][] };
};

export type ToolCtx = {
  /** Selected position for position-based tools. */
  position?: Position;
  /** Selected instrument for Time-Based Entry. */
  instrument?: Instrument;
  /** All open positions (MTM Lock / Dependency pickers). */
  positions: Position[];
};

export type FormProps<C> = {
  value: C;
  set: (patch: Partial<C>) => void;
  ctx: ToolCtx;
  /** Field-keyed messages. Show only when `showErrors` (after Review & Arm was pressed) or the field is non-empty. */
  errors: Record<string, string>;
  showErrors: boolean;
};

export type ReviewSection = { title: string; rows: [string, string][] };

export type ToolModule<C> = {
  defaults: (ctx: ToolCtx) => C;
  Form: (p: FormProps<C>) => JSX.Element;
  preview: (c: C, ctx: ToolCtx) => Preview;
  review: (c: C, ctx: ToolCtx) => ReviewSection[];
  /** Return {} when valid. */
  validate: (c: C, ctx: ToolCtx) => Record<string, string>;
  /** One-line config summary used on chips & cards, e.g. "Exit 100% at 15:10". */
  short: (c: C, ctx: ToolCtx) => string;
  /** Status line once armed, e.g. "Fires at 15:10". */
  statusText: (c: C, ctx: ToolCtx) => string;
  /** For tools without a pre-selected position (MTM Lock, Dependency). */
  targetLabel?: (c: C, ctx: ToolCtx) => string;
};
