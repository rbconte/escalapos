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

// ── Férias ⇄ Escala (fonte única de indisponibilidade) ────────────────────

/** Marcador de registros de férias criados automaticamente a partir da escala. */
export const FERIAS_AUTO_TAG = "[auto:escala]";

const MS_DIA = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parseIso = (s: string) => new Date(`${s}T00:00:00Z`);

export function datasEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  for (let d = parseIso(inicio); d <= parseIso(fim); d = new Date(d.getTime() + MS_DIA)) {
    out.push(iso(d));
  }
  return out;
}

/** Agrupa datas ordenadas em intervalos contíguos. */
export function intervalosContiguos(datas: string[]): [string, string][] {
  const s = Array.from(new Set(datas)).sort();
  const out: [string, string][] = [];
  let ini = s[0];
  let prev = s[0];
  for (let i = 1; i < s.length; i += 1) {
    const atual = s[i]!;
    const esperado = iso(new Date(parseIso(prev!).getTime() + MS_DIA));
    if (atual !== esperado) {
      out.push([ini!, prev!]);
      ini = atual;
    }
    prev = atual;
  }
  if (ini && prev) out.push([ini, prev]);
  return out;
}

/**
 * Escala → Plano de Férias.
 * Lança (ou remove) os registros automáticos de férias conforme o status
 * aplicado na escala/planejamento macro para as datas informadas.
 */
export async function sincronizarFeriasDeEscalas(
  pessoaIds: string[],
  datas: string[],
  status: string,
) {
  if (pessoaIds.length === 0 || datas.length === 0) return;
  const ordenadas = Array.from(new Set(datas)).sort();
  const min = ordenadas[0]!;
  const max = ordenadas[ordenadas.length - 1]!;

  for (const pessoaId of pessoaIds) {
    const { error: delErr } = await supabase
      .from("ferias")
      .delete()
      .eq("pessoa_id", pessoaId)
      .like("observacao", `${FERIAS_AUTO_TAG}%`)
      .lte("data_inicio", max)
      .gte("data_fim", min);
    if (delErr) throw delErr;

    if (status !== "Férias") continue;

    const rows = intervalosContiguos(ordenadas).map(([ini, fim]) => ({
      pessoa_id: pessoaId,
      data_inicio: ini,
      data_fim: fim,
      dias_gozo: Math.round((parseIso(fim).getTime() - parseIso(ini).getTime()) / MS_DIA) + 1,
      dias_abono: 0,
      status: "Programada",
      observacao: `${FERIAS_AUTO_TAG} lançado pela escala`,
    }));
    if (rows.length) {
      const { error } = await supabase.from("ferias").insert(rows);
      if (error) throw error;
    }
  }
}

/**
 * Plano de Férias → Escala.
 * Materializa o período de férias na escala (status "Férias"), removendo
 * qualquer alocação existente nos dias e suas projeções.
 */
export async function materializarEscalaDeFerias(
  pessoaId: string,
  dataInicio: string,
  dataFim: string,
) {
  const datas = datasEntre(dataInicio, dataFim);
  if (datas.length === 0) return;
  await limparProjecoesDeEscalas((q) => q.eq("pessoa_id", pessoaId).in("data", datas));
  const { error: delErr } = await supabase
    .from("escalas")
    .delete()
    .eq("pessoa_id", pessoaId)
    .in("data", datas);
  if (delErr) throw delErr;
  const { error } = await supabase.from("escalas").insert(
    datas.map((data) => ({
      pessoa_id: pessoaId,
      data,
      programa_id: null,
      ilha_id: null,
      modalidade: "TV",
      status: "Férias",
    })),
  );
  if (error) throw error;
}

/** Remove da escala os dias de férias de um período (ao editar/excluir). */
export async function desmaterializarEscalaDeFerias(
  pessoaId: string,
  dataInicio: string,
  dataFim: string,
) {
  const datas = datasEntre(dataInicio, dataFim);
  if (datas.length === 0) return;
  await limparProjecoesDeEscalas((q) =>
    q.eq("pessoa_id", pessoaId).in("data", datas).eq("status", "Férias"),
  );
  const { error } = await supabase
    .from("escalas")
    .delete()
    .eq("pessoa_id", pessoaId)
    .in("data", datas)
    .eq("status", "Férias");
  if (error) throw error;
}

/**
 * Feriados/Plantões → Escala + Planejamento Macro (+ Mapa de Ilhas e
 * Distribuição, quando houver ilha).
 */
export async function materializarSituacaoFeriado(
  pessoaIds: string[],
  datas: string[],
  status: string,
  opts?: {
    ilhaId?: string | null;
    programaId?: string | null;
    horaInicio?: string | null;
    horaFim?: string | null;
    produto?: string;
  },
) {
  if (pessoaIds.length === 0 || datas.length === 0) return;
  await limparProjecoesDeEscalas((q) => q.in("pessoa_id", pessoaIds).in("data", datas));
  const { error: delErr } = await supabase
    .from("escalas")
    .delete()
    .in("pessoa_id", pessoaIds)
    .in("data", datas);
  if (delErr) throw delErr;
  const rows = pessoaIds.flatMap((pessoa_id) =>
    datas.map((data) => ({
      demanda_id: crypto.randomUUID(),
      pessoa_id,
      data,
      programa_id: opts?.programaId ?? null,
      ilha_id: opts?.ilhaId ?? null,
      hora_inicio: opts?.horaInicio || null,
      hora_fim: opts?.horaFim || null,
      modalidade: "TV",
      status,
    })),
  );
  const { error } = await supabase.from("escalas").insert(rows);
  if (error) throw error;

  if (status === "Trabalhando" && opts?.ilhaId) {
    const produtoPorPrograma = new Map<string, string>();
    if (opts.programaId && opts.produto) {
      produtoPorPrograma.set(opts.programaId, opts.produto);
    }
    await sincronizarEscalas(
      rows.map((r) => ({
        id: r.demanda_id,
        demanda_id: r.demanda_id,
        pessoa_id: r.pessoa_id,
        programa_id: r.programa_id,
        ilha_id: r.ilha_id,
        data: r.data,
        hora_inicio: r.hora_inicio,
        hora_fim: r.hora_fim,
        status: r.status,
      })),
      produtoPorPrograma,
    );
  }
}

export type ConflitoOperacional = {
  pessoa_id: string;
  data: string;
  tipo: string;
  detalhe: string;
};

/** Verifica alocações já existentes (escala/férias/licenças) antes de sobrescrever. */
export async function conflitosOperacionais(
  pessoaIds: string[],
  datas: string[],
): Promise<ConflitoOperacional[]> {
  if (pessoaIds.length === 0 || datas.length === 0) return [];
  const ordenadas = Array.from(new Set(datas)).sort();
  const min = ordenadas[0]!;
  const max = ordenadas[ordenadas.length - 1]!;

  const [esc, fer, lic] = await Promise.all([
    supabase
      .from("escalas")
      .select("pessoa_id, data, status")
      .in("pessoa_id", pessoaIds)
      .in("data", ordenadas),
    supabase
      .from("ferias")
      .select("pessoa_id, data_inicio, data_fim, status")
      .in("pessoa_id", pessoaIds)
      .lte("data_inicio", max)
      .gte("data_fim", min),
    supabase
      .from("licencas")
      .select("pessoa_id, data_inicio, data_fim, tipo")
      .in("pessoa_id", pessoaIds)
      .lte("data_inicio", max)
      .gte("data_fim", min),
  ]);
  if (esc.error) throw esc.error;
  if (fer.error) throw fer.error;
  if (lic.error) throw lic.error;

  const out: ConflitoOperacional[] = [];
  for (const e of esc.data ?? []) {
    out.push({
      pessoa_id: e.pessoa_id,
      data: e.data,
      tipo: "Escala",
      detalhe: `já consta como "${e.status}"`,
    });
  }
  for (const f of fer.data ?? []) {
    if (f.status === "Cancelada") continue;
    for (const d of ordenadas) {
      if (f.data_inicio <= d && f.data_fim >= d) {
        out.push({ pessoa_id: f.pessoa_id, data: d, tipo: "Férias", detalhe: "período de férias" });
      }
    }
  }
  for (const l of lic.data ?? []) {
    for (const d of ordenadas) {
      if (l.data_inicio <= d && l.data_fim >= d) {
        out.push({
          pessoa_id: l.pessoa_id,
          data: d,
          tipo: "Licença",
          detalhe: l.tipo || "licença",
        });
      }
    }
  }
  return out;
}


/** Remove da escala uma situação de feriado previamente materializada. */
export async function desmaterializarSituacaoFeriado(
  pessoaIds: string[],
  datas: string[],
  status: string,
) {
  if (pessoaIds.length === 0 || datas.length === 0) return;
  await limparProjecoesDeEscalas((q) =>
    q.in("pessoa_id", pessoaIds).in("data", datas).eq("status", status),
  );
  const { error } = await supabase
    .from("escalas")
    .delete()
    .in("pessoa_id", pessoaIds)
    .in("data", datas)
    .eq("status", status);
  if (error) throw error;
}

// ── Criação compartilhada (qualquer painel é porta de entrada) ─────────────


export type NovaDemandaPlano = {
  ilha_id: string;
  produto: string;
  cor?: string | null;
  area?: string | null;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  notas?: string | null;
  programa_id?: string | null;
  pessoa_id?: string | null;
};

/**
 * Cria uma demanda a partir do Mapa de Ilhas: gera o bloco de planejamento e
 * as linhas diárias em Distribuição de Trabalho (e a escala, se houver pessoa),
 * todos com a mesma `demanda_id`.
 */
export async function criarDemandaDePlano(input: NovaDemandaPlano) {
  const demanda = crypto.randomUUID();
  const datas = datasEntre(input.data_inicio, input.data_fim);

  const { error: planoErr } = await supabase.from("ilha_planejamentos").insert({
    demanda_id: demanda,
    ilha_id: input.ilha_id,
    produto: input.produto,
    cor: input.cor ?? null,
    area: input.area ?? null,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    hora_inicio: input.hora_inicio,
    hora_fim: input.hora_fim,
    notas: input.notas ?? null,
    programa_id: input.programa_id ?? null,
    pessoa_id: input.pessoa_id ?? null,
    status: input.pessoa_id ? "Escalado" : "Planejado",
  });
  if (planoErr) throw planoErr;

  const { error: distErr } = await supabase.from("distribuicao_trabalho").insert(
    datas.map((data) => ({
      demanda_id: demanda,
      data,
      ilha_id: input.ilha_id,
      produto: input.produto,
      programa_id: input.programa_id ?? null,
      pessoa_id: input.pessoa_id ?? null,
      hora_inicio: input.hora_inicio,
      hora_fim: input.hora_fim,
      status: "Planejado",
    })),
  );
  if (distErr) throw distErr;

  if (input.pessoa_id) {
    const { error } = await supabase.from("escalas").insert(
      datas.map((data) => ({
        demanda_id: demanda,
        pessoa_id: input.pessoa_id!,
        data,
        programa_id: input.programa_id ?? null,
        ilha_id: input.ilha_id,
        hora_inicio: input.hora_inicio,
        hora_fim: input.hora_fim,
        modalidade: "TV",
        status: "Trabalhando",
      })),
    );
    if (error) throw error;
  }
  return demanda;
}

export type NovaDemandaDistribuicao = {
  data: string;
  ilha_id: string;
  produto?: string | null;
  programa_id?: string | null;
  pessoa_id?: string | null;
  retranca?: string | null;
  parceiro_conteudo?: string | null;
  hora_inicio: string;
  hora_fim: string;
  status: string;
  notas?: string | null;
};

/**
 * Cria uma demanda a partir da Distribuição de Trabalho: gera a linha diária,
 * o bloco no Mapa de Ilhas e a escala do profissional (quando informado).
 */
export async function criarDemandaDeDistribuicao(input: NovaDemandaDistribuicao) {
  const demanda = crypto.randomUUID();
  const produto = input.produto?.trim() || "Alocação";

  const { error: distErr } = await supabase.from("distribuicao_trabalho").insert({
    demanda_id: demanda,
    data: input.data,
    ilha_id: input.ilha_id,
    produto: input.produto ?? null,
    programa_id: input.programa_id ?? null,
    pessoa_id: input.pessoa_id ?? null,
    retranca: input.retranca ?? null,
    parceiro_conteudo: input.parceiro_conteudo ?? null,
    hora_inicio: input.hora_inicio,
    hora_fim: input.hora_fim,
    status: input.status,
    notas: input.notas ?? null,
  });
  if (distErr) throw distErr;

  const { error: planoErr } = await supabase.from("ilha_planejamentos").insert({
    demanda_id: demanda,
    ilha_id: input.ilha_id,
    produto,
    programa_id: input.programa_id ?? null,
    pessoa_id: input.pessoa_id ?? null,
    data_inicio: input.data,
    data_fim: input.data,
    hora_inicio: input.hora_inicio,
    hora_fim: input.hora_fim,
    notas: input.notas ?? null,
    status: input.pessoa_id ? "Escalado" : "Planejado",
  });
  if (planoErr) throw planoErr;

  if (input.pessoa_id) {
    const { error } = await supabase.from("escalas").insert({
      demanda_id: demanda,
      pessoa_id: input.pessoa_id,
      data: input.data,
      programa_id: input.programa_id ?? null,
      ilha_id: input.ilha_id,
      hora_inicio: input.hora_inicio,
      hora_fim: input.hora_fim,
      modalidade: "TV",
      status: "Trabalhando",
    });
    if (error) throw error;
  }
  return demanda;
}
