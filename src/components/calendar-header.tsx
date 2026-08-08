import type { ReactNode } from "react";

export type CalendarHeaderProps = {
  title: string;
  rangeLabel: string;
  icon?: ReactNode;
  prefix?: ReactNode;
  actions?: ReactNode;
};

export function CalendarHeader({
  title,
  rangeLabel,
  icon,
  prefix,
  actions,
}: CalendarHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {prefix}
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            {icon}
          </div>
        )}
        <div>
          <h1 className="font-display text-lg font-bold leading-tight tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

