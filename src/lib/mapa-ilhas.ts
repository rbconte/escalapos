import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PROGRAMA_CORES } from "./domain";
import { differenceInCalendarDays, parseISO } from "date-fns";

export type IlhaPlanejamento = Tables<"ilha_planejamentos">;
export type Escala = Tables<"escalas">;

export const ilhaPlanejamentosQuery = () =>
  queryOptions({
    queryKey: ["ilha_planejamentos"],
    queryFn: async (): Promise<IlhaPlanejamento[]> => {
      const { data, error } = await supabase
        .from("ilha_planejamentos")
        .select("*")
        .order("data_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

/** Deterministic color for a product when no explicit color is set. */
export function colorForProduto(produto: string, cor?: string | null): string {
  if (cor && /^#[0-9a-fA-F]{6}$/.test(cor)) return cor;
  let hash = 0;
  for (let i = 0; i < produto.length; i++) {
    hash = (hash * 31 + produto.charCodeAt(i)) >>> 0;
  }
  return PROGRAMA_CORES[hash % PROGRAMA_CORES.length];
}

export function planejamentosOverlap(a: IlhaPlanejamento, b: IlhaPlanejamento): boolean {
  if (a.id === b.id) return false;
  if (a.ilha_id !== b.ilha_id) return false;
  if (a.data_inicio > b.data_fim || b.data_inicio > a.data_fim) return false;
  // date range overlaps — also check daily time overlap
  return a.hora_inicio < b.hora_fim && b.hora_inicio < a.hora_fim;
}

export function findOverlaps(
  planejamentos: IlhaPlanejamento[],
  target: Pick<IlhaPlanejamento, "ilha_id" | "data_inicio" | "data_fim"> & {
    id?: string;
    hora_inicio?: string;
    hora_fim?: string;
  },
): IlhaPlanejamento[] {
  const hi = target.hora_inicio ?? "00:00:00";
  const hf = target.hora_fim ?? "23:59:59";
  return planejamentos.filter(
    (p) =>
      p.id !== target.id &&
      p.ilha_id === target.ilha_id &&
      p.data_inicio <= target.data_fim &&
      target.data_inicio <= p.data_fim &&
      p.hora_inicio < hf &&
      hi < p.hora_fim,
  );
}

export function planForDate(
  planejamentos: IlhaPlanejamento[],
  ilhaId: string,
  isoDate: string,
): IlhaPlanejamento[] {
  return planejamentos.filter(
    (p) => p.ilha_id === ilhaId && p.data_inicio <= isoDate && p.data_fim >= isoDate,
  );
}

// ── Status & Health ────────────────────────────────────────────────────────

export type AllocationStatus =
  | "Planejado"
  | "Escalado"
  | "Pronto"
  | "Em Execução"
  | "Concluído";

export type AllocationHealth = "Saudável" | "Atenção" | "Conflito";

export const STATUS_ALLOC_META: Record<
  AllocationStatus,
  { chip: string; dot: string; label: string }
> = {
  Planejado: {
    label: "Planejado",
    dot: "bg-slate-400",
    chip: "bg-slate-500/10 text-slate-700 border-slate-500/25",
  },
  Escalado: {
    label: "Escalado",
    dot: "bg-blue-500",
    chip: "bg-blue-500/10 text-blue-700 border-blue-500/25",
  },
  Pronto: {
    label: "Pronto",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
  },
  "Em Execução": {
    label: "Em Execução",
    dot: "bg-amber-500 animate-pulse",
    chip: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  },
  Concluído: {
    label: "Concluído",
    dot: "bg-zinc-400",
    chip: "bg-zinc-400/10 text-zinc-600 border-zinc-400/25",
  },
};

export const HEALTH_META: Record<AllocationHealth, { chip: string; dot: string }> = {
  Saudável: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
  },
  Atenção: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  Conflito: {
    dot: "bg-red-500",
    chip: "bg-red-500/10 text-red-700 border-red-500/25",
  },
};

/** True when `now` falls inside plan's [data_inicio..data_fim] AND today's [hora_inicio..hora_fim]. */
export function isRunning(p: IlhaPlanejamento, now: Date): boolean {
  const iso = now.toISOString().slice(0, 10);
  if (iso < p.data_inicio || iso > p.data_fim) return false;
  const hhmm = now.toTimeString().slice(0, 8);
  return hhmm >= p.hora_inicio && hhmm <= p.hora_fim;
}

export function isCompleted(p: IlhaPlanejamento, now: Date): boolean {
  const iso = now.toISOString().slice(0, 10);
  if (iso > p.data_fim) return true;
  if (iso === p.data_fim) {
    const hhmm = now.toTimeString().slice(0, 8);
    return hhmm > p.hora_fim;
  }
  return false;
}

/** Count escalas that overlap the plan's island + date range. */
export function escalasForPlan(p: IlhaPlanejamento, escalas: Escala[]): Escala[] {
  return escalas.filter(
    (e) =>
      e.ilha_id === p.ilha_id &&
      e.data >= p.data_inicio &&
      e.data <= p.data_fim &&
      e.status === "Trabalhando",
  );
}

export function computeStatus(
  p: IlhaPlanejamento,
  escalas: Escala[],
  hasConflict: boolean,
  now: Date,
): AllocationStatus {
  if (isCompleted(p, now)) return "Concluído";
  if (isRunning(p, now)) return "Em Execução";
  const team = escalasForPlan(p, escalas);
  if (team.length === 0) return "Planejado";
  if (hasConflict) return "Escalado";
  return "Pronto";
}

export function computeHealth(
  p: IlhaPlanejamento,
  escalas: Escala[],
  hasConflict: boolean,
): AllocationHealth {
  if (hasConflict) return "Conflito";
  const team = escalasForPlan(p, escalas);
  const durationDays = differenceInCalendarDays(parseISO(p.data_fim), parseISO(p.data_inicio)) + 1;
  // If no team assigned and event isn't in the far future window, flag attention
  if (team.length === 0 && durationDays > 0) return "Atenção";
  return "Saudável";
}

// ── Layout helpers (hourly) ────────────────────────────────────────────────

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** Stack overlapping items into non-conflicting lanes (greedy). */
export function assignLanes<T extends { start: number; end: number }>(items: T[]): number[] {
  const lanes: number[] = []; // lanes[i] = end of last item in lane i
  const result: number[] = [];
  for (const it of items) {
    let placed = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= it.start) {
        placed = i;
        lanes[i] = it.end;
        break;
      }
    }
    if (placed === -1) {
      lanes.push(it.end);
      placed = lanes.length - 1;
    }
    result.push(placed);
  }
  return result;
}
