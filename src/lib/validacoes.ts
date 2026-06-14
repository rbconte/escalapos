import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const TIPO_OCORRENCIA = {
  ESCALA_6X1: "Escala 6x1 excedida",
  INTERJORNADA: "Interjornada insuficiente",
  DESCANSO_SEMANAL: "Descanso semanal insuficiente",
  CONFLITO_ALOCACAO: "Conflito de alocação simultânea",
  CONFLITO_ILHA: "Conflito de ocupação de ilha",
} as const;

// Ocorrências calculadas por pessoa (histórico individual).
const TIPOS_POR_PESSOA: string[] = [
  TIPO_OCORRENCIA.ESCALA_6X1,
  TIPO_OCORRENCIA.INTERJORNADA,
  TIPO_OCORRENCIA.DESCANSO_SEMANAL,
  TIPO_OCORRENCIA.CONFLITO_ALOCACAO,
];

export type Ocorrencia = {
  id: string;
  pessoa_id: string;
  tipo: string;
  data: string;
  descricao: string;
  valor_encontrado: string | null;
  valor_exigido: string | null;
  status: string;
  created_at: string;
};

export type OcorrenciaCalculada = {
  pessoa_id: string;
  tipo: string;
  data: string;
  descricao: string;
  valor_encontrado: string;
  valor_exigido: string;
};

/** Subconjunto de escala usado nas validações. */
type EscalaMinima = {
  pessoa_id: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: string;
};

// Limites legais
const LIMITE_DIAS_CONSECUTIVOS = 6; // 6x1: alerta a partir do 7º dia
const INTERJORNADA_MIN_MIN = 11 * 60 + 1; // 11h01
const DESCANSO_SEMANAL_MIN_MIN = 35 * 60 + 1; // 35h01

// ---------------------------------------------------------------------------
// Utilidades de tempo
// ---------------------------------------------------------------------------

function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/** Minutos absolutos desde uma origem, considerando data + hora. */
function instante(dataISO: string, hora: string, viraDia = false): number {
  const dias = differenceInCalendarDays(parseISO(dataISO), parseISO("2000-01-01"));
  return dias * 24 * 60 + horaParaMinutos(hora) + (viraDia ? 24 * 60 : 0);
}

/** Datetime de fim de uma jornada (lida com turnos que viram a madrugada). */
function fimJornada(e: EscalaMinima): number | null {
  if (!e.hora_inicio || !e.hora_fim) return null;
  const viraDia = horaParaMinutos(e.hora_fim) <= horaParaMinutos(e.hora_inicio);
  return instante(e.data, e.hora_fim, viraDia);
}

function inicioJornada(e: EscalaMinima): number | null {
  if (!e.hora_inicio) return null;
  return instante(e.data, e.hora_inicio);
}

/** Jornada usada na detecção de conflitos (sobreposição de horários). */
type JornadaConflito = {
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
};

/** Intervalo absoluto [início, fim] em minutos. Sem horário => dia inteiro. */
function intervaloJornada(e: JornadaConflito): [number, number] {
  if (!e.hora_inicio || !e.hora_fim) {
    const ini = instante(e.data, "00:00");
    return [ini, ini + 24 * 60];
  }
  const ini = instante(e.data, e.hora_inicio);
  const viraDia = horaParaMinutos(e.hora_fim) <= horaParaMinutos(e.hora_inicio);
  return [ini, instante(e.data, e.hora_fim, viraDia)];
}

/** Duas jornadas se sobrepõem no tempo? */
function jornadasSobrepoem(a: JornadaConflito, b: JornadaConflito): boolean {
  const [a1, a2] = intervaloJornada(a);
  const [b1, b2] = intervaloJornada(b);
  return a1 < b2 && b1 < a2;
}

function rotuloHorario(e: JornadaConflito): string {
  if (!e.hora_inicio || !e.hora_fim) return "dia inteiro";
  return `${e.hora_inicio.slice(0, 5)}–${e.hora_fim.slice(0, 5)}`;
}

function formatarDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatarData(dataISO: string): string {
  return format(parseISO(dataISO), "dd/MM/yyyy", { locale: ptBR });
}

const isTrabalhando = (e: EscalaMinima) => e.status === "Trabalhando";

// ---------------------------------------------------------------------------
// Engine de validação por pessoa
// ---------------------------------------------------------------------------

/**
 * Analisa o histórico COMPLETO de uma pessoa e retorna as ocorrências
 * operacionais encontradas. Não persiste nada — apenas calcula.
 */
export function validarPessoa(
  pessoaId: string,
  escalas: EscalaMinima[],
): OcorrenciaCalculada[] {
  const ocorrencias: OcorrenciaCalculada[] = [];

  // Apenas dias de trabalho, ordenados por data.
  const dias = escalas
    .filter(isTrabalhando)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (dias.length === 0) return ocorrencias;

  // ----- Regra 1: Escala 6x1 (dias consecutivos > 6) -----
  // Quebra a sequência sempre que há um intervalo de calendário (folga / dia
  // sem alocação). A contagem reinicia após a última folga.
  let inicioStreak = 0;
  for (let i = 1; i <= dias.length; i++) {
    const fimDoStreak =
      i === dias.length ||
      differenceInCalendarDays(parseISO(dias[i].data), parseISO(dias[i - 1].data)) !== 1;

    if (fimDoStreak) {
      const tamanho = i - inicioStreak;
      if (tamanho > LIMITE_DIAS_CONSECUTIVOS) {
        // Dia do 7º trabalho consecutivo (primeira violação do streak).
        const diaViolacao = dias[inicioStreak + LIMITE_DIAS_CONSECUTIVOS];
        const primeiroDia = parseISO(dias[inicioStreak].data);
        const ultimaFolga = addDays(primeiroDia, -1);
        ocorrencias.push({
          pessoa_id: pessoaId,
          tipo: TIPO_OCORRENCIA.ESCALA_6X1,
          data: diaViolacao.data,
          descricao:
            "Colaborador escalado por mais de 6 dias consecutivos sem folga.",
          valor_encontrado: `${tamanho} dias consecutivos`,
          valor_exigido: `Máximo ${LIMITE_DIAS_CONSECUTIVOS} dias · última folga ${formatarData(
            format(ultimaFolga, "yyyy-MM-dd"),
          )}`,
        });
      }
      inicioStreak = i;
    }
  }

  // ----- Regras 2 e 3: Interjornada e Descanso semanal -----
  // Percorre pares de dias de trabalho consecutivos (na lista ordenada).
  for (let i = 1; i < dias.length; i++) {
    const anterior = dias[i - 1];
    const atual = dias[i];
    const gap = differenceInCalendarDays(
      parseISO(atual.data),
      parseISO(anterior.data),
    );

    const fim = fimJornada(anterior);
    const inicio = inicioJornada(atual);
    if (fim === null || inicio === null) continue;

    const intervalo = inicio - fim;
    if (intervalo < 0) continue;

    if (gap === 1) {
      // Dias adjacentes → interjornada.
      if (intervalo < INTERJORNADA_MIN_MIN) {
        ocorrencias.push({
          pessoa_id: pessoaId,
          tipo: TIPO_OCORRENCIA.INTERJORNADA,
          data: atual.data,
          descricao: "Intervalo entre jornadas inferior ao mínimo permitido.",
          valor_encontrado: formatarDuracao(intervalo),
          valor_exigido: formatarDuracao(INTERJORNADA_MIN_MIN),
        });
      }
    } else if (gap >= 2) {
      // Houve folga entre as jornadas → descanso semanal.
      if (intervalo < DESCANSO_SEMANAL_MIN_MIN) {
        ocorrencias.push({
          pessoa_id: pessoaId,
          tipo: TIPO_OCORRENCIA.DESCANSO_SEMANAL,
          data: atual.data,
          descricao: "Período de descanso inferior ao mínimo permitido.",
          valor_encontrado: formatarDuracao(intervalo),
          valor_exigido: formatarDuracao(DESCANSO_SEMANAL_MIN_MIN),
        });
      }
    }
  }

  // ----- Regra 4: Conflito de alocação simultânea -----
  // Mesma pessoa alocada em duas jornadas que se sobrepõem no tempo.
  const trabalho = escalas.filter(isTrabalhando);
  const conflitoRegistrado = new Set<string>();
  for (let i = 0; i < trabalho.length; i++) {
    for (let j = i + 1; j < trabalho.length; j++) {
      if (!jornadasSobrepoem(trabalho[i], trabalho[j])) continue;
      const dataConf =
        trabalho[i].data >= trabalho[j].data ? trabalho[i].data : trabalho[j].data;
      if (conflitoRegistrado.has(dataConf)) continue;
      conflitoRegistrado.add(dataConf);
      ocorrencias.push({
        pessoa_id: pessoaId,
        tipo: TIPO_OCORRENCIA.CONFLITO_ALOCACAO,
        data: dataConf,
        descricao: "Colaborador alocado em duas escalas no mesmo horário.",
        valor_encontrado: `${rotuloHorario(trabalho[i])} e ${rotuloHorario(trabalho[j])}`,
        valor_exigido: "Sem sobreposição de horários",
      });
    }
  }

  return ocorrencias;
}

// ---------------------------------------------------------------------------
// Reprocessamento + persistência
// ---------------------------------------------------------------------------

const chave = (o: { pessoa_id: string; tipo: string; data: string }) =>
  `${o.pessoa_id}|${o.tipo}|${o.data}`;

/**
 * Recalcula e persiste as ocorrências dos colaboradores informados, analisando
 * o histórico completo de cada um. Preserva o status "Resolvida" definido
 * manualmente para ocorrências idênticas. Retorna as ocorrências EM ABERTO.
 */
export async function reprocessarOcorrencias(
  pessoaIds: string[],
): Promise<OcorrenciaCalculada[]> {
  const ids = Array.from(new Set(pessoaIds.filter(Boolean)));

  // Conflitos de ilha são globais (envolvem várias pessoas) e sempre recalculados.
  const conflitosIlha = await reprocessarConflitosIlha();

  if (ids.length === 0) return conflitosIlha;

  const { data: escalas, error: escErr } = await supabase
    .from("escalas")
    .select("pessoa_id, data, hora_inicio, hora_fim, status")
    .in("pessoa_id", ids);
  if (escErr) throw escErr;

  const porPessoa = new Map<string, EscalaMinima[]>();
  for (const e of (escalas ?? []) as EscalaMinima[]) {
    const arr = porPessoa.get(e.pessoa_id) ?? [];
    arr.push(e);
    porPessoa.set(e.pessoa_id, arr);
  }

  const calculadas = ids.flatMap((pid) =>
    validarPessoa(pid, porPessoa.get(pid) ?? []),
  );

  // Preserva ocorrências (de pessoa) resolvidas manualmente.
  const { data: existentes } = await supabase
    .from("ocorrencias")
    .select("pessoa_id, tipo, data, status")
    .in("pessoa_id", ids)
    .in("tipo", TIPOS_POR_PESSOA);

  const resolvidas = new Set(
    ((existentes ?? []) as Ocorrencia[])
      .filter((o) => o.status === "Resolvida")
      .map(chave),
  );

  const { error: delErr } = await supabase
    .from("ocorrencias")
    .delete()
    .in("pessoa_id", ids)
    .in("tipo", TIPOS_POR_PESSOA);
  if (delErr) throw delErr;

  if (calculadas.length > 0) {
    const rows = calculadas.map((o) => ({
      ...o,
      status: resolvidas.has(chave(o)) ? "Resolvida" : "Aberta",
    }));
    const { error: insErr } = await supabase.from("ocorrencias").insert(rows);
    if (insErr) throw insErr;
  }

  const abertasPessoa = calculadas.filter((o) => !resolvidas.has(chave(o)));
  // Inclui conflitos de ilha das pessoas afetadas no retorno (para os toasts).
  return [
    ...abertasPessoa,
    ...conflitosIlha.filter((o) => ids.includes(o.pessoa_id)),
  ];
}

/**
 * Recalcula globalmente os conflitos de ocupação de ilha: duas (ou mais)
 * pessoas alocadas na MESMA ilha com horários sobrepostos no mesmo dia.
 * Gera uma ocorrência para cada pessoa envolvida e preserva as resolvidas.
 */
async function reprocessarConflitosIlha(): Promise<OcorrenciaCalculada[]> {
  type EscalaIlha = {
    pessoa_id: string;
    data: string;
    hora_inicio: string | null;
    hora_fim: string | null;
    ilha_id: string;
    status: string;
  };

  const { data: escalas, error } = await supabase
    .from("escalas")
    .select("pessoa_id, data, hora_inicio, hora_fim, ilha_id, status")
    .not("ilha_id", "is", null);
  if (error) throw error;

  const trab = ((escalas ?? []) as EscalaIlha[]).filter(
    (e) => e.status === "Trabalhando" && e.ilha_id,
  );

  // Agrupa por ilha + data.
  const grupos = new Map<string, EscalaIlha[]>();
  for (const e of trab) {
    const k = `${e.ilha_id}|${e.data}`;
    const arr = grupos.get(k) ?? [];
    arr.push(e);
    grupos.set(k, arr);
  }

  // Nomes para descrição.
  const ilhaIds = Array.from(new Set(trab.map((e) => e.ilha_id)));
  const pessoaIds = Array.from(new Set(trab.map((e) => e.pessoa_id)));
  const [ilhasRes, pessoasRes] = await Promise.all([
    supabase.from("ilhas").select("id, nome").in("id", ilhaIds),
    supabase.from("pessoas").select("id, nome").in("id", pessoaIds),
  ]);
  const nomeIlha = new Map(
    ((ilhasRes.data ?? []) as { id: string; nome: string }[]).map((i) => [
      i.id,
      i.nome,
    ]),
  );
  const nomePessoa = new Map(
    ((pessoasRes.data ?? []) as { id: string; nome: string }[]).map((p) => [
      p.id,
      p.nome,
    ]),
  );

  const calculadas: OcorrenciaCalculada[] = [];
  const vistos = new Set<string>(); // dedupe por pessoa|data
  for (const lista of grupos.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i];
        const b = lista[j];
        if (a.pessoa_id === b.pessoa_id) continue;
        if (!jornadasSobrepoem(a, b)) continue;
        const ilha = nomeIlha.get(a.ilha_id) ?? "ilha";
        for (const [eu, outro] of [
          [a, b],
          [b, a],
        ] as const) {
          const dedupe = `${eu.pessoa_id}|${eu.data}`;
          if (vistos.has(dedupe)) continue;
          vistos.add(dedupe);
          calculadas.push({
            pessoa_id: eu.pessoa_id,
            tipo: TIPO_OCORRENCIA.CONFLITO_ILHA,
            data: eu.data,
            descricao: `Ilha "${ilha}" ocupada no mesmo horário por ${
              nomePessoa.get(outro.pessoa_id) ?? "outro colaborador"
            }.`,
            valor_encontrado: `${rotuloHorario(eu)} · ${ilha}`,
            valor_exigido: "Ocupação exclusiva da ilha",
          });
        }
      }
    }
  }

  // Persistência global preservando conflitos resolvidos manualmente.
  const { data: existentes } = await supabase
    .from("ocorrencias")
    .select("pessoa_id, tipo, data, status")
    .eq("tipo", TIPO_OCORRENCIA.CONFLITO_ILHA);

  const resolvidas = new Set(
    ((existentes ?? []) as Ocorrencia[])
      .filter((o) => o.status === "Resolvida")
      .map(chave),
  );

  const { error: delErr } = await supabase
    .from("ocorrencias")
    .delete()
    .eq("tipo", TIPO_OCORRENCIA.CONFLITO_ILHA);
  if (delErr) throw delErr;

  if (calculadas.length > 0) {
    const rows = calculadas.map((o) => ({
      ...o,
      status: resolvidas.has(chave(o)) ? "Resolvida" : "Aberta",
    }));
    const { error: insErr } = await supabase.from("ocorrencias").insert(rows);
    if (insErr) throw insErr;
  }

  return calculadas.filter((o) => !resolvidas.has(chave(o)));
}

// ---------------------------------------------------------------------------
// Resumo (toast)
// ---------------------------------------------------------------------------

/** Exibe um resumo das ocorrências encontradas após uma operação. */
export function notificarResumoOcorrencias(
  ocorrencias: OcorrenciaCalculada[],
  nomePorPessoa: Map<string, string>,
): void {
  if (ocorrencias.length === 0) {
    toast.success("Escala salva. Nenhuma inconformidade encontrada.");
    return;
  }

  const linhas = ocorrencias
    .slice(0, 8)
    .map((o) => `${nomePorPessoa.get(o.pessoa_id) ?? "Colaborador"} — ${o.tipo}`);
  const restante = ocorrencias.length - linhas.length;

  toast.warning(
    `${ocorrencias.length} ocorrência${ocorrencias.length > 1 ? "s" : ""} encontrada${
      ocorrencias.length > 1 ? "s" : ""
    }`,
    {
      description: [
        ...linhas,
        ...(restante > 0 ? [`+ ${restante} outra(s)…`] : []),
      ].join("\n"),
      duration: 8000,
    },
  );
}
