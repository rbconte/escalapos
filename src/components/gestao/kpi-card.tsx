import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const TONE: Record<Tone, { ring: string; iconBg: string; iconFg: string }> = {
  default: { ring: "border-border", iconBg: "bg-muted", iconFg: "text-muted-foreground" },
  primary: { ring: "border-primary/20", iconBg: "bg-primary/10", iconFg: "text-primary" },
  success: { ring: "border-success/25", iconBg: "bg-success/10", iconFg: "text-success" },
  warning: { ring: "border-warning/30", iconBg: "bg-warning/15", iconFg: "text-warning-foreground" },
  danger: { ring: "border-destructive/25", iconBg: "bg-destructive/10", iconFg: "text-destructive" },
  info: { ring: "border-chart-5/25", iconBg: "bg-chart-5/10", iconFg: "text-chart-5" },
};

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  trend?: { delta: number; suffix?: string } | null;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 shadow-soft transition hover:shadow-card",
        t.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-foreground">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          {trend && (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                trend.delta > 0
                  ? "bg-success/10 text-success"
                  : trend.delta < 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {trend.delta > 0 ? "▲" : trend.delta < 0 ? "▼" : "■"}
              {Math.abs(trend.delta).toFixed(1)}
              {trend.suffix ?? "%"}
              <span className="font-normal text-muted-foreground">vs. anterior</span>
            </p>
          )}
        </div>
        {icon && (
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", t.iconBg, t.iconFg)}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-soft", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
