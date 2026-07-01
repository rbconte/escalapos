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

/** End date inclusive when starting on `inicio` for `qtd` days. */
export function fimPorQuantidade(inicio: string, qtd: number): string {
  return addDays(inicio, Math.max(qtd - 1, 0));
}

export type PeriodoAquisitivo = {
  inicio: string; // contratação base
  fim: string; // inicio + 1 ano - 1 dia
  limite: string; // fim + 1 ano (deadline para gozar)
  numero: number; // 1, 2, 3...
};

/** Returns acquisitive period for the current cycle (the one in progress now). */
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
  const inicioPeriodo = new Date(
    Date.UTC(contrat.getUTCFullYear() + numero, contrat.getUTCMonth(), contrat.getUTCDate()),
  );
  const fimPeriodo = new Date(inicioPeriodo);
  fimPeriodo.setUTCFullYear(fimPeriodo.getUTCFullYear() + 1);
  fimPeriodo.setUTCDate(fimPeriodo.getUTCDate() - 1);
  const limite = new Date(fimPeriodo);
  limite.setUTCFullYear(limite.getUTCFullYear() + 1);
  return {
    inicio: formatISO(inicioPeriodo),
    fim: formatISO(fimPeriodo),
    limite: formatISO(limite),
    numero: numero + 1,
  };
}

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
  setup?: {
    vacation_status?: string | null;
    vacation_control_start?: string | null;
    pending_vacation_days?: number | null;
    overdue_vacation_days?: number | null;
  } | null,
): SaldoFerias {
  if (!dataContratacao) {
    return {
      periodo: null,
      direito: 0,
      programados: 0,
      gozados: 0,
      abonados: 0,
      saldo: 0,
      vencimento: null,
      diasParaVencer: null,
      vencida: false,
    };
  }
  const periodo = periodoAquisitivoAtual(dataContratacao, hojeISO);
  const controlStart = setup?.vacation_control_start ?? null;
  // Ignore records before control start date.
  const feriasConsideradas = controlStart
    ? ferias.filter((f) => f.data_inicio >= controlStart)
    : ferias;
  const doPeriodo = feriasConsideradas.filter((f) => {
    const pa = f.periodo_aquisitivo_inicio ?? periodo.inicio;
    return pa === periodo.inicio;
  });
  let programados = 0;
  let gozados = 0;
  let abonados = 0;
  for (const f of doPeriodo) {
    const gozo = f.dias_gozo ?? diffDaysInclusive(f.data_inicio, f.data_fim);
    const abono = f.dias_abono ?? 0;
    programados += gozo + abono;
    abonados += abono;
    if (f.data_fim <= hojeISO) gozados += gozo;
  }
  const direito = 30;
  const pendenteInicial = Math.max(setup?.pending_vacation_days ?? 0, 0);
  const vencidaInicial = Math.max(setup?.overdue_vacation_days ?? 0, 0);
  const saldo = Math.max(direito - programados, 0) + pendenteInicial + vencidaInicial;
  const vencimento = periodo.limite;
  const diasParaVencer = Math.round(
    (parseISO(vencimento).getTime() - parseISO(hojeISO).getTime()) / MS_DAY,
  );
  const vencida =
    setup?.vacation_status === "vencida" ||
    vencidaInicial > 0 ||
    (diasParaVencer < 0 && saldo > 0);
  return {
    periodo,
    direito,
    programados,
    gozados,
    abonados,
    saldo,
    vencimento,
    diasParaVencer,
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
  if (s.diasParaVencer === null) return null;
  if (s.diasParaVencer < 0)
    return { nivel: "vencida", mensagem: "Férias vencidas" };
  if (s.diasParaVencer <= 30)
    return { nivel: "critical", mensagem: `Vence em ${s.diasParaVencer} dias` };
  if (s.diasParaVencer <= 60)
    return { nivel: "warning", mensagem: `Vence em ${s.diasParaVencer} dias` };
  return null;
}

export function validarProgramacao(input: {
  diasGozo: number;
  diasAbono: number;
  saldo: number;
  abonadosNoPeriodo: number;
}): string | null {
  if (input.diasGozo < 0 || input.diasAbono < 0)
    return "Quantidade de dias inválida.";
  if (input.diasAbono > 10)
    return "O abono pecuniário não pode ultrapassar 10 dias por período aquisitivo.";
  if (input.abonadosNoPeriodo + input.diasAbono > 10)
    return "A soma dos dias abonados ultrapassa o limite de 10 dias por período aquisitivo.";
  if (input.diasGozo + input.diasAbono > input.saldo)
    return "A soma dos dias de férias e dos dias abonados não pode ultrapassar o saldo disponível.";
  return null;
}
