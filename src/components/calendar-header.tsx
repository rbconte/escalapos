import type { ReactNode } from "react";

export type CalendarHeaderProps = {
  title: string;
  rangeLabel?: string;
  description?: string;
  icon?: ReactNode;
  prefix?: ReactNode;
  actions?: ReactNode;
};

export function CalendarHeader({
  title,
  rangeLabel,
  description,
  icon,
  prefix,
  actions,
}: CalendarHeaderProps) {
  const subtitle = description ?? rangeLabel;
  return (
    <div className="border-b bg-card/50 px-4 py-3 sm:px-6">
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
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

