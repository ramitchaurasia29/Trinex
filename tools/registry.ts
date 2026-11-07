import type { ToolId } from "../data";
import type { ToolModule } from "./types";
import { timedExit } from "./TimedExit";
import { trailingSL } from "./TrailingSL";
import { timedEntry } from "./TimedEntry";
import { noMotion } from "./NoMotion";
import { rangeBreak } from "./RangeBreak";
import { partialProfit } from "./PartialProfit";
import { mtmLock } from "./MtmLock";
import { dependency } from "./Dependency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODULES: Record<ToolId, ToolModule<any>> = {
  "timed-exit": timedExit,
  "trailing-sl": trailingSL,
  "timed-entry": timedEntry,
  "no-motion": noMotion,
  "range-break": rangeBreak,
  "partial-profit": partialProfit,
  "mtm-lock": mtmLock,
  dependency,
};
