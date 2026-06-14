import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ViewMode } from "./domain";

export const ISO = (d: Date) => format(d, "yyyy-MM-dd");

export function rangeForView(anchor: Date, view: ViewMode): { start: Date; end: Date } {
  if (view === "Diário") return { start: anchor, end: anchor };
  if (view === "Semanal")
    return {
      start: startOfWeek(anchor, { weekStartsOn: 1 }),
      end: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

export function daysInRange(start: Date, end: Date): Date[] {
  return eachDayOfInterval({ start, end });
}

export function shiftAnchor(anchor: Date, view: ViewMode, dir: 1 | -1): Date {
  if (view === "Diário") return addDays(anchor, dir);
  if (view === "Semanal") return addWeeks(anchor, dir);
  return addMonths(anchor, dir);
}

export function rangeLabel(anchor: Date, view: ViewMode): string {
  const { start, end } = rangeForView(anchor, view);
  if (view === "Diário") return capitalize(format(anchor, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }));
  if (view === "Mensal") return capitalize(format(anchor, "MMMM 'de' yyyy", { locale: ptBR }));
  return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
}

export const dayName = (d: Date) => format(d, "EEE", { locale: ptBR });
export const dayNum = (d: Date) => format(d, "dd");
export const monthShort = (d: Date) => format(d, "MMM", { locale: ptBR });

export function isWeekend(d: Date) {
  const g = d.getDay();
  return g === 0 || g === 6;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
