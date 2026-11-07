import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { BROKERS, inr, type ArmedStatus, type BrokerId, type Side } from "./data";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-soft" | "link";
type BtnSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 font-medium rounded-md select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed whitespace-nowrap";

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-surface-3 disabled:text-faint",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 disabled:text-faint",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-faint",
  danger: "bg-loss text-white hover:bg-loss/90 disabled:bg-surface-3 disabled:text-faint",
  "danger-soft": "bg-surface text-loss border border-loss-line hover:bg-loss-soft",
  link: "text-primary hover:text-primary-hover hover:underline underline-offset-4 px-0",
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-sm",
};

export function Button({
  variant = "primary", size = "md", icon: Icon, iconRight: IconRight, full, className = "", children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: BtnSize; icon?: LucideIcon; iconRight?: LucideIcon; full?: boolean;
}) {
  return (
    <button
      {...rest}
      className={[BTN_BASE, BTN_VARIANT[variant], variant === "link" ? "h-auto text-sm" : BTN_SIZE[size], full ? "w-full" : "", className].join(" ")}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight size={size === "sm" ? 14 : 16} strokeWidth={2} />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={["inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary", className].join(" ")}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, dots                                                        */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "profit" | "loss" | "warn" | "info" | "primary";

const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  profit: "bg-profit-soft text-profit border-profit-line",
  loss: "bg-loss-soft text-loss border-loss-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  info: "bg-info-soft text-info border-info-line",
  primary: "bg-primary-soft text-primary border-primary-line",
};

const DOT_TONE: Record<Tone, string> = {
  neutral: "bg-faint",
  profit: "bg-profit-dot",
  loss: "bg-loss-dot",
  warn: "bg-warn-dot",
  info: "bg-info",
  primary: "bg-primary",
};

export function Badge({ tone = "neutral", dot, children, className = "" }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={["inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap", BADGE_TONE[tone], className].join(" ")}>
      {dot && <span className={["h-1.5 w-1.5 rounded-full", DOT_TONE[tone]].join(" ")} />}
      {children}
    </span>
  );
}

export function Dot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span className={["inline-block h-2 w-2 shrink-0 rounded-full", DOT_TONE[tone], className].join(" ")} />;
}

export function SideBadge({ side }: { side: Side }) {
  return <Badge tone={side === "BUY" ? "profit" : "loss"}>{side}</Badge>;
}

export const STATUS_TONE: Record<ArmedStatus, Tone> = {
  waiting: "warn",
  active: "profit",
  imminent: "loss",
  paused: "neutral",
  queued: "info",
  failed: "loss",
};

export const STATUS_LABEL: Record<ArmedStatus, string> = {
  waiting: "Waiting",
  active: "Active",
  imminent: "About to trigger",
  paused: "Paused",
  queued: "Queued",
  failed: "Failed",
};

export function BrokerMark({ id, size = "sm" }: { id: BrokerId; size?: "xs" | "sm" | "md" | "lg" }) {
  const b = BROKERS.find((x) => x.id === id);
  const cls = { xs: "h-4 w-4 text-[9px] rounded-[4px]", sm: "h-5 w-5 text-[10px] rounded-sm", md: "h-8 w-8 text-sm rounded-md", lg: "h-11 w-11 text-base rounded-lg" }[size]; // ds-ok: monogram scale
  return (
    <span className={["inline-flex shrink-0 items-center justify-center bg-ink font-semibold text-white", cls].join(" ")} aria-hidden>
      {b?.mono}
    </span>
  );
}

export function BrokerTag({ id }: { id: BrokerId }) {
  const b = BROKERS.find((x) => x.id === id);
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-line bg-surface pl-0.5 pr-1.5 text-xs text-ink-2">
      <BrokerMark id={id} size="xs" />
      {b?.short}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export function Pnl({ value, pct, size = "sm", className = "" }: { value: number; pct?: number; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const color = value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-ink-2";
  const sz = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl" }[size];
  return (
    <span className={["font-mono font-medium tabular-nums tracking-tight", color, sz, className].join(" ")}>
      {inr(value, { sign: true })}
      {pct !== undefined && (
        <span className={size === "xl" || size === "lg" ? "ml-2 text-sm" : "ml-1.5 text-xs"}>
          ({pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct).toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  options, value, onChange, disabled, size = "md", full = true,
}: {
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  value: T | undefined;
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  full?: boolean;
}) {
  return (
    <div role="radiogroup" className={["inline-flex gap-1 rounded-md border border-line bg-surface-2 p-1", full ? "w-full" : "", disabled ? "opacity-60" : ""].join(" ")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={[
              "flex flex-1 flex-col items-center justify-center rounded-sm px-3 text-center font-medium disabled:cursor-not-allowed",
              size === "sm" ? "h-7 text-xs" : o.hint ? "min-h-12 py-1.5 text-sm" : "h-9 text-sm",
              active ? "bg-surface text-ink shadow-card ring-1 ring-line-strong" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            <span>{o.label}</span>
            {o.hint && <span className={["text-xs font-normal", active ? "text-muted" : "text-faint"].join(" ")}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={["relative inline-flex h-6 w-11 shrink-0 items-center rounded-full disabled:opacity-50", checked ? "bg-primary" : "bg-line-strong"].join(" ")}
    >
      <span className={["inline-block h-5 w-5 rounded-full bg-white shadow-card", checked ? "ml-5.5" : "ml-0.5"].join(" ")} />
    </button>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-6 border-b border-line" role="tablist">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={["-mb-px flex h-11 items-center gap-2 border-b-2 text-sm font-medium", active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"].join(" ")}
          >
            {it.label}
            {it.count !== undefined && (
              <span className={["rounded-sm px-1.5 text-xs font-semibold tabular-nums", active ? "bg-ink text-white" : "bg-surface-3 text-ink-2"].join(" ")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children, icon: Icon }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
        active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
      ].join(" ")}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
}

export function TextInput({
  value, onChange, placeholder, prefix, suffix, type = "text", invalid, className = "", inputMode, autoFocus, maxLength, disabled,
}: {
  value: string | number | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  type?: string;
  invalid?: boolean;
  className?: string;
  inputMode?: "numeric" | "decimal" | "text" | "tel" | "email";
  autoFocus?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "flex h-11 items-center gap-2 rounded-md border bg-surface px-3 focus-within:ring-2",
        invalid ? "border-loss focus-within:ring-loss-line" : "border-line-strong focus-within:border-primary focus-within:ring-primary-line",
        disabled ? "bg-surface-2" : "",
        className,
      ].join(" ")}
    >
      {prefix && <span className="text-sm text-muted">{prefix}</span>}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        maxLength={maxLength}
        disabled={disabled}
        className="h-full w-full min-w-0 bg-transparent font-mono text-sm text-ink tabular-nums outline-none placeholder:font-sans placeholder:text-faint disabled:text-muted"
      />
      {suffix && <span className="shrink-0 text-sm text-muted">{suffix}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={["rounded-lg border border-line bg-surface shadow-card", padded ? "p-4" : "", className].join(" ")}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{children}</h3>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <p className="text-base font-semibold tracking-tight text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Banner({ tone, icon: Icon, children, action }: { tone: Tone; icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={["flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm", BADGE_TONE[tone]].join(" ")}>
      <Icon size={16} strokeWidth={2} className="shrink-0" />
      <div className="min-w-0 flex-1 font-medium">{children}</div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

/** Bottom sheet on mobile, right-side panel on desktop. */
export function Sheet({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-xl bg-surface shadow-pop lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-l lg:border-line">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mt-1 -mr-2" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, actions, tone = "neutral", icon: Icon }: { open: boolean; onClose: () => void; title: string; children?: ReactNode; actions: ReactNode; tone?: "neutral" | "danger" | "warn"; icon?: LucideIcon }) {
  useEsc(open, onClose);
  if (!open) return null;
  const iconTone = tone === "danger" ? "bg-loss-soft text-loss" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary";
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div role="dialog" aria-modal className="relative w-full rounded-t-xl bg-surface p-6 shadow-pop sm:max-w-md sm:rounded-xl">
        {Icon && (
          <div className={["mb-4 flex h-10 w-10 items-center justify-center rounded-full", iconTone].join(" ")}>
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </div>
  );
}
