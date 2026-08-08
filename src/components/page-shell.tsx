import type { ReactNode } from "react";
import { CalendarHeader } from "./calendar-header";

export function PageShell({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] flex-col">
      <CalendarHeader
        title={title}
        description={description}
        icon={icon}
        actions={actions}
      />\n      <div className="min-h-0 flex-1 overflow-auto scroll-thin px-5 py-5 sm:px-7">
        {children}
      </div>
    </div>
  );
}
