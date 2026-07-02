import type { Tables } from "@/integrations/supabase/types";

export type Ferias = Tables<"ferias">;

const MS_DAY = 1000 * 60 * 60 * 24;

function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function diffDaysInclusive(inicio: string, fim: string): number {
  const a = parseISO(inicio).getTime();
  const b = parseISO(fim).getTime();
  return Math.round((b - a) / MS_DAY) + 1;
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISO(d);
}

export function fimPorQuantidade(inicio: string, qtd: number): string {
  return addDays(inicio, Math.max(qtd - 1, 0));
}

export type PeriodoAquisitivo = {
  inicio: string;
  fim: string;
  limite: string; // deadline para gozar
  numero: number;
  label: string; // ex: "2024/2025"
};

/** Current acquisitive period for a given hire date. */
export function periodoAquisitivoAtual(
  dataContratacao: string,
  hojeISO: string = formatISO(new Date()),
): PeriodoAquisitivo {
  const contrat = parseISO(dataContratacao);
  const hoje = parseISO(hojeISO);
  let numero = hoje.getUTCFullYear() - contrat.getUTCFullYear();
  const aniversario = new Date(
    Date.UTC(hoje.getUTCFullYear(), contrat.getUTCMonth(), contrat.getUTCDate()),
  );
  if (hoje < aniversario) numero -= 1;
  numero = Math.max(numero, 0);
  return buildPeriodo(contrat, numero);
}

function buildPeriodo(contrat: Date, numero: number): PeriodoAquisitivo {
  const inicioPeriodo = new Date(
    Date.UTC(contrat.getUTCFullYear() + numero, contrat.getUTCMonth(), contrat.getUTCDate()),
  );
  const fimPeriodo = new Date(inicioPeriodo);
  fimPeriodo.setUTCFullYear(fimPeriodo.getUTCFullYear() + 1);
  fimPeriodo.setUTCDate(fimPeriodo.getUTCDate() - 1);
  const limite = new Date(fimPeriodo);
  limite.setUTCFullYear(limite.getUTCFullYear() + 1);
  const yA = inicioPeriodo.getUTCFullYear();
  const yB = fimPeriodo.getUTCFullYear();
  return {
    inicio: formatISO(inicioPeriodo),
    fim: formatISO(fimPeriodo),
    limite: formatISO(limite),
    numero: numero + 1,
    label: yA === yB ? String(yA) : `${yA}/${yB}`,
  };
}

/* ============================================================ */
/* Period-based model                                            */
/* ============================================================ */

export type StatusPeriodo =
  | "Adquirindo"
  | "Disponível"
  | "Parcialmente Usada"
  | "Agendada"
  | "Concluída"
  | "Vence em breve"
  | "Vencida";

export type SetupFerias = {
  vacation_status?: string | null;
  vacation_control_start?: string | null;
  pending_vacation_days?: number | null;
  overdue_vacation_days?: number | null;
} | null | undefined;

export type PeriodoFerias = PeriodoAquisitivo & {
  direito: number;
  proporcionais: number; // dias acumulados até hoje quando ainda em aquisição
  emAquisicao: boolean;
  agendados: number; // dias de gozo em agendamentos futuros ou em curso
  usados: number; // dias de gozo já concluídos
  vendidos: number; // dias de abono no período
  restantes: number; // saldo disponível para novas programações
  diasParaVencer: number | null;
  status: StatusPeriodo;
  origem: "gerado" | "setup_inicial";
  agendamentos: Ferias[];
};

const DIREITO_ANO = 30;

function isBefore(a: string, b: string) {
  return a < b;
}

/** Generates all acquisitive periods from hire date up to next full cycle. */
export function gerarPeriodos(
  dataContratacao: string,
  hojeISO: string = formatISO(new Date()),
): PeriodoAquisitivo[] {
  const contrat = parseISO(dataContratacao);
  const hoje = parseISO(hojeISO);
  const atual = periodoAquisitivoAtual(dataContratacao, hojeISO);
  const totalCiclos = atual.numero + 1; // inclui próximo em aquisição… mas atual já É o em aquisição
  const periodos: PeriodoAquisitivo[] = [];
  for (let i = 0; i < totalCiclos; i += 1) {
    const p = buildPeriodo(contrat, i);
    // só inclui se já iniciou (evita futuros ciclos inúteis)
    if (parseISO(p.inicio) <= hoje) {
      periodos.push(p);
    }
  }
  return periodos;
}

/** Compute periods with their metrics/status for a person. */
export function calcularPeriodos(
  dataContratacao: string | null,
  ferias: Ferias[],
  hojeISO: string = formatISO(new Date()),
  setup?: SetupFerias,
): PeriodoFerias[] {
  if (!dataContratacao) return [];
  const controlStart = setup?.vacation_control_start ?? null;
  const brutos = gerarPeriodos(dataContratacao, hojeISO);
  const periodos = controlStart
    ? brutos.filter((p) => p.fim >= controlStart)
    : brutos;

  const overdueInicial = Math.max(setup?.overdue_vacation_days ?? 0, 0);
  const pendingInicial = Math.max(setup?.pending_vacation_days ?? 0, 0);

  const result: PeriodoFerias[] = periodos.map((p, idx) => {
    const isAtual = p.inicio <= hojeISO && hojeISO <= p.fim;
    const emAquisicao = isAtual;
    // agendamentos que pertencem a este período
    const ags = ferias.filter((f) => {
      const key = f.periodo_aquisitivo_inicio ?? null;
      if (key) return key === p.inicio;
      // fallback heurístico: agendamento cujo início cai antes do vencimento do período e após início
      return f.data_inicio >= p.inicio && f.data_inicio <= p.limite;
    });
    let agendados = 0;
    let usados = 0;
    let vendidos = 0;
    for (const f of ags) {
      const gozo = f.dias_gozo ?? diffDaysInclusive(f.data_inicio, f.data_fim);
      const abono = f.dias_abono ?? 0;
      vendidos += abono;
      if (f.data_fim < hojeISO) usados += gozo;
      else agendados += gozo;
    }

    // direito: proporcional se em aquisição (2.5 dias/mês completo)
    let direito = DIREITO_ANO;
    let proporcionais = 0;
    if (emAquisicao) {
      const meses = Math.max(
        0,
        Math.floor(
          (parseISO(hojeISO).getTime() - parseISO(p.inicio).getTime()) / (MS_DAY * 30),
        ),
      );
      proporcionais = Math.min(30, meses * 2.5);
    }
    if (p.fim < hojeISO) direito = DIREITO_ANO; // ciclo completo

    // Aplica saldos do setup inicial ao período mais antigo (primeiro da lista)
    let extraDireito = 0;
    let origem: "gerado" | "setup_inicial" = "gerado";
    if (idx === 0 && (overdueInicial > 0 || pendingInicial > 0)) {
      // Não altera "direito" oficial, mas soma no restante para não perder saldo
      extraDireito = overdueInicial + pendingInicial;
      origem = "setup_inicial";
    }

    const baseDisponivel = emAquisicao ? proporcionais : direito;
    const restantes = Math.max(baseDisponivel + extraDireito - agendados - usados - vendidos, 0);

    const diasParaVencer = Math.round(
      (parseISO(p.limite).getTime() - parseISO(hojeISO).getTime()) / MS_DAY,
    );

    let status: StatusPeriodo;
    if (emAquisicao) {
      status = "Adquirindo";
    } else if (usados + vendidos >= direito + extraDireito) {
      status = "Concluída";
    } else if (diasParaVencer < 0 && restantes > 0) {
      status = "Vencida";
    } else if (agendados > 0 && restantes === 0) {
      status = "Agendada";
    } else if (usados > 0 && restantes > 0) {
      status = "Parcialmente Usada";
    } else if (diasParaVencer <= 60 && diasParaVencer >= 0 && restantes > 0) {
      status = "Vence em breve";
    } else if (agendados > 0) {
      status = "Agendada";
    } else {
      status = "Disponível";
    }

    return {
      ...p,
      direito,
      proporcionais,
      emAquisicao,
      agendados,
      usados,
      vendidos,
      restantes,
      diasParaVencer,
      status,
      origem,
      agendamentos: ags,
    };
  });

  return result;
}

/* ============================================================ */
/* Backwards-compatible aggregate (used elsewhere)               */
/* ============================================================ */

export type SaldoFerias = {
  periodo: PeriodoAquisitivo | null;
  direito: number;
  programados: number;
  gozados: number;
  abonados: number;
  saldo: number;
  vencimento: string | null;
  diasParaVencer: number | null;
  vencida: boolean;
};

export function calcularSaldo(
  dataContratacao: string | null,
  ferias: Ferias[],
  hojeISO: string = formatISO(new Date()),
  setup?: SetupFerias,
): SaldoFerias {
  if (!dataContratacao) {
    return {
      periodo: null, direito: 0, programados: 0, gozados: 0, abonados: 0,
      saldo: 0, vencimento: null, diasParaVencer: null, vencida: false,
    };
  }
  const periodos = calcularPeriodos(dataContratacao, ferias, hojeISO, setup);
  const atual = periodos.find((p) => p.emAquisicao) ?? periodos[periodos.length - 1] ?? null;
  const totalAgendados = periodos.reduce((a, p) => a + p.agendados, 0);
  const totalUsados = periodos.reduce((a, p) => a + p.usados, 0);
  const totalAbonos = periodos.reduce((a, p) => a + p.vendidos, 0);
  const saldo = periodos.reduce((a, p) => a + p.restantes, 0);
  const vencida = periodos.some((p) => p.status === "Vencida");
  return {
    periodo: atual,
    direito: DIREITO_ANO,
    programados: totalAgendados + totalAbonos,
    gozados: totalUsados,
    abonados: totalAbonos,
    saldo,
    vencimento: atual?.limite ?? null,
    diasParaVencer: atual?.diasParaVencer ?? null,
    vencida,
  };
}

export type AlertaFerias = {
  nivel: "info" | "warning" | "critical" | "vencida";
  mensagem: string;
};

export function getAlertaFerias(s: SaldoFerias): AlertaFerias | null {
  if (!s.periodo) return null;
  if (s.saldo <= 0) return null;
  if (s.vencida) return { nivel: "vencida", mensagem: "Férias vencidas" };
  if (s.diasParaVencer === null) return null;
  if (s.diasParaVencer < 0) return { nivel: "vencida", mensagem: "Férias vencidas" };
  if (s.diasParaVencer <= 30) return { nivel: "critical", mensagem: `Vence em ${s.diasParaVencer} dias` };
  if (s.diasParaVencer <= 60) return { nivel: "warning", mensagem: `Vence em ${s.diasParaVencer} dias` };
  return null;
}

/** Alerts by period (new). */
export function alertasDoPeriodo(p: PeriodoFerias): AlertaFerias[] {
  const out: AlertaFerias[] = [];
  if (p.status === "Vencida") out.push({ nivel: "vencida", mensagem: `${p.label} vencida` });
  else if (p.diasParaVencer !== null && p.diasParaVencer <= 30 && p.restantes > 0 && !p.emAquisicao)
    out.push({ nivel: "critical", mensagem: `${p.label} vence em ${p.diasParaVencer} dias` });
  else if (p.diasParaVencer !== null && p.diasParaVencer <= 60 && p.restantes > 0 && !p.emAquisicao)
    out.push({ nivel: "warning", mensagem: `${p.label} vence em ${p.diasParaVencer} dias` });
  return out;
}

export function validarProgramacao(input: {
  diasGozo: number;
  diasAbono: number;
  saldo: number; // restantes do período selecionado
  abonadosNoPeriodo: number;
}): string | null {
  if (input.diasGozo < 0 || input.diasAbono < 0) return "Quantidade de dias inválida.";
  if (input.diasAbono > 10)
    return "O abono pecuniário não pode ultrapassar 10 dias por período aquisitivo.";
  if (input.abonadosNoPeriodo + input.diasAbono > 10)
    return "A soma dos dias abonados ultrapassa o limite de 10 dias por período aquisitivo.";
  if (input.diasGozo + input.diasAbono > input.saldo)
    return "A soma dos dias de férias e dos dias abonados não pode ultrapassar o saldo disponível do período selecionado.";
  return null;
}

export const STATUS_PERIODO_STYLE: Record<StatusPeriodo, { chip: string; dot: string }> = {
  Adquirindo: { chip: "bg-slate-500/15 text-slate-600 border-slate-500/20", dot: "bg-slate-500" },
  Disponível: { chip: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20", dot: "bg-emerald-500" },
  "Parcialmente Usada": { chip: "bg-blue-500/15 text-blue-700 border-blue-500/20", dot: "bg-blue-500" },
  Agendada: { chip: "bg-amber-500/15 text-amber-700 border-amber-500/20", dot: "bg-amber-500" },
  Concluída: { chip: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  "Vence em breve": { chip: "bg-orange-500/15 text-orange-700 border-orange-500/20", dot: "bg-orange-500" },
  Vencida: { chip: "bg-destructive/15 text-destructive border-destructive/20", dot: "bg-destructive" },
};
