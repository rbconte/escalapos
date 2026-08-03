/**
 * Camada de sincronização operacional (Single Source of Truth).
 *
 * Toda alocação operacional possui uma identidade compartilhada — `demanda_id`.
 * A escala é a origem da verdade; Mapa de Ilhas e Distribuição de Trabalho são
 * projeções materializadas da mesma demanda. Qualquer edição/remoção feita em
 * um módulo é propagada às demais tabelas pela `demanda_id`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Todas as chaves de cache derivadas de dados operacionais. */
export const OPERATIONAL_KEYS = [
  "escalas",
  "ilha_planejamentos",
  "distribuicao_trabalho",
  "ferias",
  "licencas",
  "ocorrencias",
  "pessoas",
  "programas",
  "programa_necessidades",
  "performance",
] as const;

/** Invalida todas as views derivadas — usado após qualquer mutação operacional. */
export function invalidateOperacional(qc: QueryClient) {
  for (const key of OPERATIONAL_KEYS) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export type EscalaSync = {
  id: string;
  demanda_id: string | null;
  pessoa_id: string;
  programa_id: string | null;
  ilha_id: string | null;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: string;
};

const DEFAULT_INICIO = "08:00:00";
const DEFAULT_FIM = "18:00:00";

const hhmm = (v: string | null, fallback: string) => (v && v.length >= 5 ? v : fallback);

export function demandaIdsDe(rows: { demanda_id: string | null }[]): string[] {
  return Array.from(
    new Set(rows.map((r) => r.demanda_id).filter((d): d is string => !!d)),
  );
}

/** Remove as projeções (ilha/distribuição) de um conjunto de demandas. */
export async function removerProjecoes(demandaIds: string[]) {
  if (demandaIds.length === 0) return;
  const [a, b] = await Promise.all([
    supabase.from("ilha_planejamentos").delete().in("demanda_id", demandaIds),
    supabase.from("distribuicao_trabalho").delete().in("demanda_id", demandaIds),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

/** Remove a demanda inteira — escala + todas as projeções. Sem registros órfãos. */
export async function excluirDemanda(demandaId: string) {
  const { error } = await supabase.from("escalas").delete().eq("demanda_id", demandaId);
  if (error) throw error;
  await removerProjecoes([demandaId]);
}

/**
 * Coleta as `demanda_id` de escalas que serão apagadas e limpa as projeções,
 * evitando registros órfãos nos demais módulos.
 */
export async function limparProjecoesDeEscalas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
): Promise<void> {
  const { data, error } = await build(
    supabase.from("escalas").select("demanda_id"),
  );
  if (error) throw error;
  const ids = demandaIdsDe((data ?? []) as { demanda_id: string | null }[]);
  await removerProjecoes(ids);
}


/**
 * Materializa/atualiza as projeções de um conjunto de escalas.
 * - Escala "Trabalhando" com ilha  → bloco no Mapa de Ilhas + linha na Distribuição.
 * - Qualquer outro caso           → projeções removidas (sem duplicidade/órfãos).
 */
export async function sincronizarEscalas(
  escalas: EscalaSync[],
  produtoPorPrograma: Map<string, string>,
) {
  const comDemanda = escalas.filter((e) => !!e.demanda_id);
  if (comDemanda.length === 0) return;

  const ativas = comDemanda.filter(
    (e) => e.status === "Trabalhando" && !!e.ilha_id,
  );
  const inativas = comDemanda.filter(
    (e) => !(e.status === "Trabalhando" && !!e.ilha_id),
  );

  await removerProjecoes(demandaIdsDe(inativas));

  if (ativas.length === 0) return;
  const ids = demandaIdsDe(ativas);

  const [planos, dists] = await Promise.all([
    supabase.from("ilha_planejamentos").select("id, demanda_id").in("demanda_id", ids),
    supabase.from("distribuicao_trabalho").select("id, demanda_id").in("demanda_id", ids),
  ]);
  if (planos.error) throw planos.error;
  if (dists.error) throw dists.error;

  const planoPorDemanda = new Map(
    (planos.data ?? []).map((p) => [p.demanda_id as string, p.id] as const),
  );
  const distPorDemanda = new Map(
    (dists.data ?? []).map((d) => [d.demanda_id as string, d.id] as const),
  );

  const novosPlanos: Record<string, unknown>[] = [];
  const novasDists: Record<string, unknown>[] = [];

  for (const e of ativas) {
    const demanda = e.demanda_id!;
    const produto = (e.programa_id && produtoPorPrograma.get(e.programa_id)) || "Alocação";
    const inicio = hhmm(e.hora_inicio, DEFAULT_INICIO);
    const fim = hhmm(e.hora_fim, DEFAULT_FIM);

    const plano = {
      demanda_id: demanda,
      ilha_id: e.ilha_id!,
      programa_id: e.programa_id,
      pessoa_id: e.pessoa_id,
      produto,
      data_inicio: e.data,
      data_fim: e.data,
      hora_inicio: inicio,
      hora_fim: fim,
      status: "Escalado",
    };
    const dist = {
      demanda_id: demanda,
      data: e.data,
      ilha_id: e.ilha_id!,
      programa_id: e.programa_id,
      pessoa_id: e.pessoa_id,
      produto,
      hora_inicio: inicio,
      hora_fim: fim,
      status: "Planejado",
    };

    const planoId = planoPorDemanda.get(demanda);
    if (planoId) {
      const { error } = await supabase
        .from("ilha_planejamentos")
        .update(plano)
        .eq("id", planoId);
      if (error) throw error;
    } else novosPlanos.push(plano);

    const distId = distPorDemanda.get(demanda);
    if (distId) {
      const { status: _s, ...patch } = dist; // preserva o status operacional já definido
      const { error } = await supabase
        .from("distribuicao_trabalho")
        .update(patch)
        .eq("id", distId);
      if (error) throw error;
    } else novasDists.push(dist);
  }

  if (novosPlanos.length) {
    const { error } = await supabase
      .from("ilha_planejamentos")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(novosPlanos as any);
    if (error) throw error;
  }
  if (novasDists.length) {
    const { error } = await supabase
      .from("distribuicao_trabalho")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(novasDists as any);
    if (error) throw error;
  }
}

export type DemandaPatch = {
  ilha_id?: string | null;
  pessoa_id?: string | null;
  programa_id?: string | null;
  hora_inicio?: string;
  hora_fim?: string;
  produto?: string;
};

/**
 * Propaga a edição de uma demanda para os demais módulos (ilha, profissional,
 * programa, horários e produto permanecem idênticos em todas as views).
 */
export async function propagarDemanda(demandaId: string, patch: DemandaPatch) {
  const escalaPatch: Record<string, unknown> = {};
  if (patch.ilha_id !== undefined) escalaPatch.ilha_id = patch.ilha_id;
  if (patch.pessoa_id !== undefined && patch.pessoa_id) escalaPatch.pessoa_id = patch.pessoa_id;
  if (patch.programa_id !== undefined) escalaPatch.programa_id = patch.programa_id;
  if (patch.hora_inicio) escalaPatch.hora_inicio = patch.hora_inicio;
  if (patch.hora_fim) escalaPatch.hora_fim = patch.hora_fim;

  if (Object.keys(escalaPatch).length) {
    const { error } = await supabase
      .from("escalas")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(escalaPatch as any)
      .eq("demanda_id", demandaId);
    if (error) throw error;
  }

  const comum: Record<string, unknown> = { ...escalaPatch };
  if (patch.produto !== undefined) comum.produto = patch.produto;

  if (Object.keys(comum).length) {
    const [a, b] = await Promise.all([
      supabase
        .from("ilha_planejamentos")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(comum as any)
        .eq("demanda_id", demandaId),
      supabase
        .from("distribuicao_trabalho")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(comum as any)
        .eq("demanda_id", demandaId),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
  }
}

// ── Disponibilidade unificada ──────────────────────────────────────────────

export type Ausencia = {
  pessoa_id: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
};

/** Férias (exceto abono) e licenças formam a indisponibilidade compartilhada. */
export function indisponibilidade(
  ferias: { pessoa_id: string; data_inicio: string; data_fim: string; status: string }[],
  licencas: { pessoa_id: string; data_inicio: string; data_fim: string; tipo: string }[],
): Ausencia[] {
  return [
    ...ferias
      .filter((f) => f.status !== "Cancelada")
      .map((f) => ({
        pessoa_id: f.pessoa_id,
        data_inicio: f.data_inicio,
        data_fim: f.data_fim,
        tipo: "Férias",
      })),
    ...licencas.map((l) => ({
      pessoa_id: l.pessoa_id,
      data_inicio: l.data_inicio,
      data_fim: l.data_fim,
      tipo: l.tipo || "Licença",
    })),
  ];
}

export function ausenciaEm(
  ausencias: Ausencia[],
  pessoaId: string,
  isoDate: string,
): Ausencia | null {
  return (
    ausencias.find(
      (a) => a.pessoa_id === pessoaId && a.data_inicio <= isoDate && a.data_fim >= isoDate,
    ) ?? null
  );
}
