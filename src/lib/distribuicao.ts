import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DistribuicaoTrabalho = Tables<"distribuicao_trabalho">;

export const STATUS_DISTRIBUICAO = [
  "Planejado",
  "Em Andamento",
  "Concluído",
  "Cancelado",
] as const;
export type StatusDistribuicao = (typeof STATUS_DISTRIBUICAO)[number];

export const STATUS_DIST_META: Record<
  StatusDistribuicao,
  { chip: string; dot: string }
> = {
  Planejado: {
    chip: "bg-slate-500/10 text-slate-700 border-slate-500/20",
    dot: "bg-slate-500",
  },
  "Em Andamento": {
    chip: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    dot: "bg-blue-500",
  },
  Concluído: {
    chip: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  Cancelado: {
    chip: "bg-red-500/10 text-red-600 border-red-500/20",
    dot: "bg-red-500",
  },
};

export const distribuicaoQuery = (data?: string) =>
  queryOptions({
    queryKey: ["distribuicao_trabalho", data ?? "all"],
    queryFn: async (): Promise<DistribuicaoTrabalho[]> => {
      let q = supabase
        .from("distribuicao_trabalho")
        .select("*")
        .order("data", { ascending: false })
        .order("hora_inicio", { ascending: true });
      if (data) q = q.eq("data", data);
      const { data: rows, error } = await q;
      if (error) throw error;
      return rows ?? [];
    },
  });

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Conflicts: same pessoa or same ilha with overlapping times on same date. */
export function detectConflicts(rows: DistribuicaoTrabalho[]): {
  ilhas: Set<string>;
  pessoas: Set<string>;
  ids: Set<string>;
} {
  const ilhas = new Set<string>();
  const pessoas = new Set<string>();
  const ids = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.data !== b.data) continue;
      if (!timesOverlap(a.hora_inicio, a.hora_fim, b.hora_inicio, b.hora_fim)) continue;
      if (a.ilha_id === b.ilha_id) {
        ilhas.add(a.ilha_id);
        ids.add(a.id);
        ids.add(b.id);
      }
      if (a.pessoa_id && a.pessoa_id === b.pessoa_id) {
        pessoas.add(a.pessoa_id);
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return { ilhas, pessoas, ids };
}
