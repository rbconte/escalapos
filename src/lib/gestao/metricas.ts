import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import type { EscalaCompleta, PessoaComFuncao } from "@/lib/domain";

export type Ferias = Tables<"ferias">;
export type Licenca = Tables<"licencas">;

const HORAS_DISPONIVEIS_DIA = 8;

export function horasDeEscala(e: { hora_inicio: string | null; hora_fim: string | null }): number {
  if (!e.hora_inicio || !e.hora_fim) return 0;
  const [h1, m1] = e.hora_inicio.split(":").map(Number);
  const [h2, m2] = e.hora_fim.split(":").map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export function diasNoIntervalo(from: string, to: string): Date[] {
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
}

export function intersectaPeriodo(
  itemFrom: string,
  itemTo: string,
  from: string,
  to: string,
): boolean {
  return itemFrom <= to && itemTo >= from;
}

export function emPeriodo(data: string, from: string, to: string): boolean {
  return data >= from && data <= to;
}

export type EscalasFiltradas = {
  escalas: EscalaCompleta[];
};

export function filtrarEscalas(
  escalas: EscalaCompleta[],
  filtros: {
    conteudo_id?: string;
    programa_id?: string;
    ilha_id?: string;
    pessoa_id?: string;
    status?: string;
  },
): EscalaCompleta[] {
  return escalas.filter((e) => {
    if (filtros.pessoa_id && e.pessoa_id !== filtros.pessoa_id) return false;
    if (filtros.programa_id && e.programa_id !== filtros.programa_id) return false;
    if (filtros.ilha_id && e.ilha_id !== filtros.ilha_id) return false;
    if (filtros.status && e.status !== filtros.status) return false;
    if (filtros.conteudo_id) {
      const cid = e.programa?.conteudo?.id ?? e.programa?.tipo_conteudo_id ?? null;
      if (cid !== filtros.conteudo_id) return false;
    }
    return true;
  });
}

export function filtrarPessoas(
  pessoas: PessoaComFuncao[],
  filtros: { pessoa_id?: string; conteudo_id?: string },
): PessoaComFuncao[] {
  return pessoas.filter((p) => {
    if (filtros.pessoa_id && p.id !== filtros.pessoa_id) return false;
    if (filtros.conteudo_id && p.tipo_conteudo_id !== filtros.conteudo_id) return false;
    return true;
  });
}

export function pessoasAtivas(pessoas: PessoaComFuncao[]): PessoaComFuncao[] {
  return pessoas.filter((p) => p.status === "Ativo");
}

export type OcupacaoResultado = {
  horasAlocadas: number;
  horasDisponiveis: number;
  taxa: number; // 0..1
};

export function calcularOcupacao(
  escalas: EscalaCompleta[],
  pessoas: PessoaComFuncao[],
  from: string,
  to: string,
): OcupacaoResultado {
  const trabalhando = escalas.filter((e) => e.status === "Trabalhando");
  const horasAlocadas = trabalhando.reduce((acc, e) => acc + horasDeEscala(e), 0);
  const dias = diasNoIntervalo(from, to).length;
  const ativos = pessoasAtivas(pessoas).length;
  const horasDisponiveis = ativos * dias * HORAS_DISPONIVEIS_DIA;
  return {
    horasAlocadas,
    horasDisponiveis,
    taxa: horasDisponiveis > 0 ? horasAlocadas / horasDisponiveis : 0,
  };
}

export function escalasPorData(
  escalas: EscalaCompleta[],
  from: string,
  to: string,
): { data: string; label: string; horas: number; escalas: number }[] {
  const map = new Map<string, { horas: number; escalas: number }>();
  for (const d of diasNoIntervalo(from, to)) {
    map.set(format(d, "yyyy-MM-dd"), { horas: 0, escalas: 0 });
  }
  for (const e of escalas) {
    if (e.status !== "Trabalhando") continue;
    const v = map.get(e.data);
    if (!v) continue;
    v.horas += horasDeEscala(e);
    v.escalas += 1;
  }
  return Array.from(map.entries()).map(([data, v]) => ({
    data,
    label: format(parseISO(data), "dd/MM"),
    horas: Math.round(v.horas * 10) / 10,
    escalas: v.escalas,
  }));
}

export function contarStatus(
  escalas: EscalaCompleta[],
  hojeISO: string,
  status: string,
): number {
  const set = new Set<string>();
  for (const e of escalas) {
    if (e.data === hojeISO && e.status === status) set.add(e.pessoa_id);
  }
  return set.size;
}

export function pessoasEmFerias(ferias: Ferias[], dataISO: string): Set<string> {
  const ids = new Set<string>();
  for (const f of ferias) {
    if (f.data_inicio <= dataISO && f.data_fim >= dataISO) ids.add(f.pessoa_id);
  }
  return ids;
}

export function pessoasEmLicenca(licencas: Licenca[], dataISO: string): Set<string> {
  const ids = new Set<string>();
  for (const l of licencas) {
    if (l.data_inicio <= dataISO && l.data_fim >= dataISO) ids.add(l.pessoa_id);
  }
  return ids;
}

export function diasDeFolgaPorPessoa(
  escalas: EscalaCompleta[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of escalas) {
    if (e.status.startsWith("Folga")) {
      map.set(e.pessoa_id, (map.get(e.pessoa_id) ?? 0) + 1);
    }
  }
  return map;
}

export function horasPorPessoa(
  escalas: EscalaCompleta[],
): Map<string, { horas: number; escalas: number }> {
  const map = new Map<string, { horas: number; escalas: number }>();
  for (const e of escalas) {
    if (e.status !== "Trabalhando") continue;
    const v = map.get(e.pessoa_id) ?? { horas: 0, escalas: 0 };
    v.horas += horasDeEscala(e);
    v.escalas += 1;
    map.set(e.pessoa_id, v);
  }
  return map;
}

export function alocacaoPorPrograma(
  escalas: EscalaCompleta[],
): { id: string; nome: string; cor: string; pessoas: number; escalas: number; horas: number }[] {
  type Agg = { nome: string; cor: string; pessoas: Set<string>; escalas: number; horas: number };
  const map = new Map<string, Agg>();
  for (const e of escalas) {
    if (e.status !== "Trabalhando" || !e.programa) continue;
    const k = e.programa.id;
    const cur =
      map.get(k) ??
      ({
        nome: e.programa.nome,
        cor: e.programa.cor,
        pessoas: new Set<string>(),
        escalas: 0,
        horas: 0,
      } satisfies Agg);
    cur.pessoas.add(e.pessoa_id);
    cur.escalas += 1;
    cur.horas += horasDeEscala(e);
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({
      id,
      nome: v.nome,
      cor: v.cor,
      pessoas: v.pessoas.size,
      escalas: v.escalas,
      horas: Math.round(v.horas * 10) / 10,
    }))
    .sort((a, b) => b.horas - a.horas);
}

export function alocacaoPorIlha(
  escalas: EscalaCompleta[],
  from: string,
  to: string,
): { id: string; nome: string; escalas: number; horas: number; ocupacao: number }[] {
  type Agg = { nome: string; escalas: number; horas: number };
  const map = new Map<string, Agg>();
  for (const e of escalas) {
    if (e.status !== "Trabalhando" || !e.ilha) continue;
    const k = e.ilha.id;
    const cur = map.get(k) ?? ({ nome: e.ilha.nome, escalas: 0, horas: 0 } satisfies Agg);
    cur.escalas += 1;
    cur.horas += horasDeEscala(e);
    map.set(k, cur);
  }
  const dias = diasNoIntervalo(from, to).length;
  const horasMax = dias * 24;
  return Array.from(map.entries())
    .map(([id, v]) => ({
      id,
      nome: v.nome,
      escalas: v.escalas,
      horas: Math.round(v.horas * 10) / 10,
      ocupacao: horasMax > 0 ? v.horas / horasMax : 0,
    }))
    .sort((a, b) => b.horas - a.horas);
}

export function coberturaPorPrograma(
  escalas: EscalaCompleta[],
): { id: string; nome: string; cor: string; pessoas: number; risco: "alto" | "medio" | "baixo" }[] {
  const map = new Map<string, { nome: string; cor: string; pessoas: Set<string> }>();
  for (const e of escalas) {
    if (e.status !== "Trabalhando" || !e.programa) continue;
    const k = e.programa.id;
    const cur =
      map.get(k) ?? { nome: e.programa.nome, cor: e.programa.cor, pessoas: new Set<string>() };
    cur.pessoas.add(e.pessoa_id);
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([id, v]) => {
      const n = v.pessoas.size;
      const risco: "alto" | "medio" | "baixo" = n <= 1 ? "alto" : n === 2 ? "medio" : "baixo";
      return { id, nome: v.nome, cor: v.cor, pessoas: n, risco };
    })
    .sort((a, b) => a.pessoas - b.pessoas);
}

export function diasAteFerias(f: Ferias, hojeISO: string): number {
  return differenceInCalendarDays(parseISO(f.data_inicio), parseISO(hojeISO));
}
