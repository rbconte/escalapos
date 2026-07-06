import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PROGRAMA_CORES } from "./domain";

export type IlhaPlanejamento = Tables<"ilha_planejamentos">;

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

/** Deterministic color for a product name when no explicit color is set. */
export function colorForProduto(produto: string, cor?: string | null): string {
  if (cor && /^#[0-9a-fA-F]{6}$/.test(cor)) return cor;
  let hash = 0;
  for (let i = 0; i < produto.length; i++) {
    hash = (hash * 31 + produto.charCodeAt(i)) >>> 0;
  }
  return PROGRAMA_CORES[hash % PROGRAMA_CORES.length];
}

/** Returns true if two planejamentos overlap on the same island. */
export function planejamentosOverlap(a: IlhaPlanejamento, b: IlhaPlanejamento): boolean {
  if (a.id === b.id) return false;
  if (a.ilha_id !== b.ilha_id) return false;
  return a.data_inicio <= b.data_fim && b.data_inicio <= a.data_fim;
}

export function findOverlaps(
  planejamentos: IlhaPlanejamento[],
  target: Pick<IlhaPlanejamento, "ilha_id" | "data_inicio" | "data_fim"> & { id?: string },
): IlhaPlanejamento[] {
  return planejamentos.filter(
    (p) =>
      p.id !== target.id &&
      p.ilha_id === target.ilha_id &&
      p.data_inicio <= target.data_fim &&
      target.data_inicio <= p.data_fim,
  );
}

/** Returns the plan(s) that cover a given date for a given island. */
export function planForDate(
  planejamentos: IlhaPlanejamento[],
  ilhaId: string,
  isoDate: string,
): IlhaPlanejamento[] {
  return planejamentos.filter(
    (p) => p.ilha_id === ilhaId && p.data_inicio <= isoDate && p.data_fim >= isoDate,
  );
}
