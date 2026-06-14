import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

export const PERIODOS = ["hoje", "semana", "mes", "30d", "90d", "custom"] as const;
export type PeriodoPreset = (typeof PERIODOS)[number];

export const gestaoSearchSchema = z.object({
  periodo: fallback(z.enum(PERIODOS), "mes").default("mes"),
  from: z.string().optional(),
  to: z.string().optional(),
  conteudo_id: z.string().optional(),
  programa_id: z.string().optional(),
  ilha_id: z.string().optional(),
  pessoa_id: z.string().optional(),
  status: z.string().optional(),
});

export const gestaoSearchValidator = zodValidator(gestaoSearchSchema);
export type GestaoSearch = z.infer<typeof gestaoSearchSchema>;

const ISO = (d: Date) => format(d, "yyyy-MM-dd");

export function resolvePeriodo(s: GestaoSearch): {
  from: string;
  to: string;
  label: string;
} {
  const today = new Date();
  if (s.periodo === "custom" && s.from && s.to) {
    return { from: s.from, to: s.to, label: `${s.from} → ${s.to}` };
  }
  switch (s.periodo) {
    case "hoje":
      return { from: ISO(today), to: ISO(today), label: "Hoje" };
    case "semana": {
      const a = startOfWeek(today, { weekStartsOn: 1 });
      const b = endOfWeek(today, { weekStartsOn: 1 });
      return { from: ISO(a), to: ISO(b), label: "Esta semana" };
    }
    case "30d":
      return { from: ISO(subDays(today, 29)), to: ISO(today), label: "Últimos 30 dias" };
    case "90d":
      return { from: ISO(subDays(today, 89)), to: ISO(today), label: "Últimos 90 dias" };
    case "mes":
    default: {
      const a = startOfMonth(today);
      const b = endOfMonth(today);
      return { from: ISO(a), to: ISO(b), label: "Este mês" };
    }
  }
}

/** Previous period of equal length, for comparativos. */
export function periodoAnterior(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const dias = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const newTo = subDays(f, 1);
  const newFrom = subDays(newTo, dias - 1);
  return { from: ISO(newFrom), to: ISO(newTo) };
}
