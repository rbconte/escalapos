import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type GrupoPlantao = Tables<"grupos_plantao">;
export type GrupoMembro = Tables<"grupo_plantao_membros">;
export type FeriadoConfig = Tables<"feriados_config">;
export type FeriadoEscala = Tables<"feriado_escalas">;

export const TIPOS_GRUPO = ["Plantão", "Feriado", "Ambos"] as const;
export const ESCOPOS = ["Nacional", "Estadual", "Municipal", "Personalizado"] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const SITUACOES_FERIADO = ["Trabalha", "Folga", "Sobreaviso"] as const;
export type SituacaoFeriado = (typeof SITUACOES_FERIADO)[number];

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Domingo de Páscoa (algoritmo de Meeus/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

export type FeriadoBase = { data: string; nome: string; escopo: Escopo };

/** Feriados nacionais + estaduais/municipais de São Paulo para um ano. */
export function feriadosDoAno(ano: number): FeriadoBase[] {
  const p = pascoa(ano);
  const rel = (n: number) => {
    const d = new Date(p);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const fixo = (m: number, d: number) => `${ano}-${pad(m)}-${pad(d)}`;

  const lista: FeriadoBase[] = [
    { data: fixo(1, 1), nome: "Confraternização Universal", escopo: "Nacional" },
    { data: rel(-48), nome: "Carnaval (segunda)", escopo: "Nacional" },
    { data: rel(-47), nome: "Carnaval (terça)", escopo: "Nacional" },
    { data: rel(-46), nome: "Quarta-feira de Cinzas", escopo: "Nacional" },
    { data: rel(-2), nome: "Sexta-feira Santa", escopo: "Nacional" },
    { data: fixo(4, 21), nome: "Tiradentes", escopo: "Nacional" },
    { data: fixo(5, 1), nome: "Dia do Trabalho", escopo: "Nacional" },
    { data: rel(60), nome: "Corpus Christi", escopo: "Nacional" },
    { data: fixo(9, 7), nome: "Independência do Brasil", escopo: "Nacional" },
    { data: fixo(10, 12), nome: "Nossa Senhora Aparecida", escopo: "Nacional" },
    { data: fixo(11, 2), nome: "Finados", escopo: "Nacional" },
    { data: fixo(11, 15), nome: "Proclamação da República", escopo: "Nacional" },
    { data: fixo(11, 20), nome: "Consciência Negra", escopo: "Nacional" },
    { data: fixo(12, 25), nome: "Natal", escopo: "Nacional" },
    { data: fixo(7, 9), nome: "Revolução Constitucionalista", escopo: "Estadual" },
    { data: fixo(1, 25), nome: "Aniversário de São Paulo", escopo: "Municipal" },
  ];
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

export type Feriado = FeriadoBase & {
  config: FeriadoConfig | null;
  plantaoInicio: string;
  plantaoFim: string;
  ativo: boolean;
  customizado: boolean;
};

export function montarFeriados(ano: number, configs: FeriadoConfig[]): Feriado[] {
  const byData = new Map(configs.map((c) => [c.data, c]));
  const base = feriadosDoAno(ano);
  const usados = new Set(base.map((f) => f.data));

  const out: Feriado[] = base.map((f) => {
    const c = byData.get(f.data) ?? null;
    return {
      ...f,
      nome: c?.nome ?? f.nome,
      config: c,
      plantaoInicio: c?.plantao_inicio ?? f.data,
      plantaoFim: c?.plantao_fim ?? f.data,
      ativo: c?.ativo ?? true,
      customizado: false,
    };
  });

  for (const c of configs) {
    if (usados.has(c.data)) continue;
    if (!c.data.startsWith(String(ano))) continue;
    out.push({
      data: c.data,
      nome: c.nome,
      escopo: (c.escopo as Escopo) ?? "Personalizado",
      config: c,
      plantaoInicio: c.plantao_inicio ?? c.data,
      plantaoFim: c.plantao_fim ?? c.data,
      ativo: c.ativo,
      customizado: true,
    });
  }

  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Fins de semana (sábado + domingo) do ano, agrupados por par. */
export function finsDeSemana(ano: number): { inicio: string; fim: string }[] {
  const out: { inicio: string; fim: string }[] = [];
  const d = new Date(ano, 0, 1);
  while (d.getFullYear() === ano) {
    if (d.getDay() === 6) {
      const dom = new Date(d);
      dom.setDate(dom.getDate() + 1);
      out.push({ inicio: iso(d), fim: iso(dom) });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const gruposPlantaoQuery = () =>
  queryOptions({
    queryKey: ["grupos_plantao"],
    queryFn: async (): Promise<GrupoPlantao[]> => {
      const { data, error } = await supabase
        .from("grupos_plantao")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

export const grupoMembrosQuery = () =>
  queryOptions({
    queryKey: ["grupo_plantao_membros"],
    queryFn: async (): Promise<GrupoMembro[]> => {
      const { data, error } = await supabase.from("grupo_plantao_membros").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

export const feriadosConfigQuery = () =>
  queryOptions({
    queryKey: ["feriados_config"],
    queryFn: async (): Promise<FeriadoConfig[]> => {
      const { data, error } = await supabase
        .from("feriados_config")
        .select("*")
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

export const feriadoEscalasQuery = () =>
  queryOptions({
    queryKey: ["feriado_escalas"],
    queryFn: async (): Promise<FeriadoEscala[]> => {
      const { data, error } = await supabase
        .from("feriado_escalas")
        .select("*")
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

/* -------------------------------------------------------------------------- */
/*  Alertas                                                                    */
/* -------------------------------------------------------------------------- */

export type FeriasLite = {
  id: string;
  pessoa_id: string;
  data_inicio: string;
  data_fim: string;
  status: string;
};

export type Alerta = {
  id: string;
  tipo: "grupo-ferias" | "folga-ferias" | "plantao-ferias";
  severidade: "alta" | "media";
  titulo: string;
  detalhe: string;
};

const overlap = (a1: string, a2: string, b1: string, b2: string) =>
  a1 <= b2 && b1 <= a2;

/**
 * Alerta 1: dois membros do MESMO grupo com férias que se sobrepõem.
 * Alerta 2: pessoa com folga prevista em feriado e, na mesma data, de férias.
 * Alerta 3: pessoa escalada para trabalhar no plantão do feriado durante férias.
 */
export function calcularAlertas(params: {
  grupos: GrupoPlantao[];
  membros: GrupoMembro[];
  feriados: Feriado[];
  escalas: FeriadoEscala[];
  ferias: FeriasLite[];
  nomePessoa: (id: string) => string;
}): Alerta[] {
  const { grupos, membros, feriados, escalas, ferias, nomePessoa } = params;
  const alertas: Alerta[] = [];
  const validas = ferias.filter((f) => f.status !== "Cancelada");

  for (const g of grupos) {
    const ids = membros.filter((m) => m.grupo_id === g.id).map((m) => m.pessoa_id);
    const doGrupo = validas.filter((f) => ids.includes(f.pessoa_id));
    for (let i = 0; i < doGrupo.length; i++) {
      for (let j = i + 1; j < doGrupo.length; j++) {
        const a = doGrupo[i];
        const b = doGrupo[j];
        if (a.pessoa_id === b.pessoa_id) continue;
        if (!overlap(a.data_inicio, a.data_fim, b.data_inicio, b.data_fim)) continue;
        alertas.push({
          id: `grupo-${g.id}-${a.id}-${b.id}`,
          tipo: "grupo-ferias",
          severidade: "alta",
          titulo: `Férias conflitantes no grupo ${g.nome}`,
          detalhe: `${nomePessoa(a.pessoa_id)} (${br(a.data_inicio)}–${br(a.data_fim)}) e ${nomePessoa(b.pessoa_id)} (${br(b.data_inicio)}–${br(b.data_fim)}) estão de férias ao mesmo tempo.`,
        });
      }
    }
  }

  const feriadoPorData = new Map(feriados.map((f) => [f.data, f]));
  for (const e of escalas) {
    const conflito = validas.find(
      (f) => f.pessoa_id === e.pessoa_id && e.data >= f.data_inicio && e.data <= f.data_fim,
    );
    if (!conflito) continue;
    const fer = feriadoPorData.get(e.data);
    const rotulo = fer ? fer.nome : br(e.data);
    if (e.situacao === "Folga") {
      alertas.push({
        id: `folga-${e.id}`,
        tipo: "folga-ferias",
        severidade: "media",
        titulo: `Folga em feriado durante férias`,
        detalhe: `${nomePessoa(e.pessoa_id)} tem folga prevista em ${rotulo} (${br(e.data)}) e está de férias (${br(conflito.data_inicio)}–${br(conflito.data_fim)}).`,
      });
    } else {
      alertas.push({
        id: `plantao-${e.id}`,
        tipo: "plantao-ferias",
        severidade: "alta",
        titulo: `Escalado em feriado durante férias`,
        detalhe: `${nomePessoa(e.pessoa_id)} está escalado (${e.situacao}) em ${rotulo} (${br(e.data)}) mas estará de férias (${br(conflito.data_inicio)}–${br(conflito.data_fim)}).`,
      });
    }
  }

  return alertas;
}

export function br(d: string) {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}
