import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarHeart, ChevronDown, ChevronRight, Plus, Search,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { supabase } from "@/integrations/supabase/client";
import { pessoasQuery, todasFeriasQuery, escalasQuery } from "@/lib/queries";
import type { PessoaComFuncao } from "@/lib/domain";
import { TIPO_PROGRAMACAO_FERIAS, TIPO_PROGRAMACAO_LABEL, type TipoProgramacaoFerias } from "@/lib/domain";
import {
  calcularPeriodos, diffDaysInclusive, fimPorQuantidade, diasAcumuladosAte,
  validarProgramacao, STATUS_PERIODO_STYLE,
  type Ferias, type PeriodoFerias,
} from "@/lib/ferias";

const POLICY_KEY = "ferias.allowScheduleAccruing";
function getAllowAccruing(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(POLICY_KEY);
  return v === null ? true : v === "true";
}
function setAllowAccruing(v: boolean) {
  if (typeof window !== "undefined") window.localStorage.setItem(POLICY_KEY, String(v));
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/ferias")({
  head: () => ({
    meta: [
      { title: "Plano de Férias — Escala Operacional" },
      { name: "description", content: "Controle de férias por período aquisitivo, abono e cobertura." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(pessoasQuery());
    context.queryClient.ensureQueryData(todasFeriasQuery());
    const ano = new Date().getFullYear();
    context.queryClient.ensureQueryData(escalasQuery(`${ano}-01-01`, `${ano + 1}-12-31`));
  },
  component: FeriasPage,
});

type SetupPessoa = {
  vacation_status: string | null;
  vacation_control_start: string | null;
  pending_vacation_days: number;
  overdue_vacation_days: number;
};

function setupOf(p: PessoaComFuncao): SetupPessoa {
  const a = p as unknown as {
    vacation_status?: string | null;
    vacation_control_start?: string | null;
    pending_vacation_days?: number | null;
    overdue_vacation_days?: number | null;
  };
  return {
    vacation_status: a.vacation_status ?? null,
    vacation_control_start: a.vacation_control_start ?? null,
    pending_vacation_days: a.pending_vacation_days ?? 0,
    overdue_vacation_days: a.overdue_vacation_days ?? 0,
  };
}

function FeriasPage() {
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: ferias } = useSuspenseQuery(todasFeriasQuery());
  const ano = new Date().getFullYear();
  const { data: escalas } = useSuspenseQuery(
    escalasQuery(`${ano}-01-01`, `${ano + 1}-12-31`),
  );
  const qc = useQueryClient();
  const hoje = TODAY();

  const [search, setSearch] = useState("");
  const [progPessoa, setProgPessoa] = useState<PessoaComFuncao | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allowAccruing, setAllowAccruingState] = useState<boolean>(() => getAllowAccruing());

  const ativos = useMemo(
    () => pessoas.filter((p) => p.status !== "Desligado" && p.status !== "Inativo"),
    [pessoas],
  );

  const periodosPorPessoa = useMemo(() => {
    const m = new Map<string, PeriodoFerias[]>();
    for (const p of ativos) {
      const fp = ferias.filter((f) => f.pessoa_id === p.id);
      m.set(p.id, calcularPeriodos(p.data_contratacao, fp, hoje, setupOf(p)));
    }
    return m;
  }, [ativos, ferias, hoje]);

  const setupPendente = ativos.filter(
    (p) => p.data_contratacao && !setupOf(p).vacation_status,
  ).length;

  // ---- Dashboard aggregations by period ----
  let emFeriasHoje = 0;
  let comVencidas = 0;
  let periodosVencidos = 0;
  let vencendo60 = 0;
  let vencendo30 = 0;
  let semAgendamento = 0;
  let diasDisponiveis = 0;
  let diasAgendados = 0;
  let diasVendidos = 0;

  for (const p of ativos) {
    const periodos = periodosPorPessoa.get(p.id) ?? [];
    let vencidasNa = 0;
    let temAgendamentoAtivo = false;
    for (const per of periodos) {
      diasDisponiveis += per.restantes;
      diasAgendados += per.agendados;
      diasVendidos += per.vendidos;
      if (per.status === "Vencida") { vencidasNa += 1; periodosVencidos += 1; }
      if (per.diasParaVencer !== null && per.restantes > 0 && !per.emAquisicao) {
        if (per.diasParaVencer >= 0 && per.diasParaVencer <= 30) vencendo30 += 1;
        else if (per.diasParaVencer > 30 && per.diasParaVencer <= 60) vencendo60 += 1;
      }
      if (per.agendados > 0) temAgendamentoAtivo = true;
    }
    if (vencidasNa > 0) comVencidas += 1;
    const temSaldoUtilizavel = periodos.some((per) => per.restantes > 0 && !per.emAquisicao);
    if (temSaldoUtilizavel && !temAgendamentoAtivo) semAgendamento += 1;
  }
  emFeriasHoje = new Set(
    ferias.filter((f) => f.data_inicio <= hoje && f.data_fim >= hoje).map((f) => f.pessoa_id),
  ).size;

  const filtrados = useMemo(() => {
    const s = search.toLowerCase();
    return ativos.filter(
      (p) => !s || p.nome.toLowerCase().includes(s) || (p.matricula ?? "").toLowerCase().includes(s),
    );
  }, [ativos, search]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSaved() {
    // Fonte única: invalidar todas as caches que dependem de férias
    qc.invalidateQueries({ queryKey: ["ferias"] });
    qc.invalidateQueries({ queryKey: ["escalas"] });
    qc.invalidateQueries({ queryKey: ["programa_necessidades"] });
    qc.invalidateQueries({ queryKey: ["ocorrencias"] });
    qc.invalidateQueries({ queryKey: ["pessoas"] });
    setProgPessoa(null);
  }

  return (
    <PageShell
      title="Plano de Férias"
      description="Gestão por período aquisitivo. Fonte única para escala e planejamento macro."
      icon={<CalendarHeart className="h-5 w-5" />}
    >
      {setupPendente > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div className="flex-1">
            <p className="font-medium">Configuração inicial de férias pendente</p>
            <p className="text-muted-foreground">
              {setupPendente} colaborador(es) sem status inicial. Configure em Pessoas › Férias.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href="/pessoas">Ir para Pessoas</a>
          </Button>
        </div>
      )}

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
          <TabsTrigger value="calendario">Calendário anual</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-soft">
            <div>
              <div className="text-sm font-medium">Política: agendar em períodos em aquisição</div>
              <div className="text-xs text-muted-foreground">
                Quando ativado, colaboradores podem agendar férias usando o período aquisitivo em curso,
                com base nos dias acumulados até a data de início.
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allowAccruing}
                onChange={(e) => { setAllowAccruing(e.target.checked); setAllowAccruingState(e.target.checked); }}
              />
              {allowAccruing ? "Sim" : "Não"}
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <KpiCard label="Colaboradores em férias hoje" value={emFeriasHoje} />
            <KpiCard label="Colaboradores com férias vencidas" value={comVencidas} tone={comVencidas > 0 ? "danger" : undefined} />
            <KpiCard label="Períodos aquisitivos vencidos" value={periodosVencidos} tone={periodosVencidos > 0 ? "danger" : undefined} />
            <KpiCard label="Vencendo em 60 dias" value={vencendo60} tone={vencendo60 > 0 ? "warning" : undefined} />
            <KpiCard label="Vencendo em 30 dias" value={vencendo30} tone={vencendo30 > 0 ? "critical" : undefined} />
            <KpiCard label="Sem férias programadas" value={semAgendamento} tone={semAgendamento > 0 ? "warning" : undefined} />
            <KpiCard label="Dias disponíveis" value={diasDisponiveis} />
            <KpiCard label="Dias programados" value={diasAgendados} />
            <KpiCard label="Dias vendidos (abono)" value={diasVendidos} />
            <KpiCard label="Configuração pendente" value={setupPendente} tone={setupPendente > 0 ? "warning" : undefined} />
            <KpiCard label="Colaboradores ativos" value={ativos.length} />
          </div>
        </TabsContent>

        <TabsContent value="colaboradores" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou matrícula..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            {filtrados.map((p) => {
              const periodos = periodosPorPessoa.get(p.id) ?? [];
              const isOpen = expanded.has(p.id);
              const totalRestantes = periodos.reduce((a, x) => a + x.restantes, 0);
              const alertaCount = periodos.filter(
                (per) => per.status === "Vencida" ||
                  (per.diasParaVencer !== null && per.diasParaVencer <= 60 && per.restantes > 0 && !per.emAquisicao),
              ).length;

              return (
                <div key={p.id} className="rounded-xl border bg-card shadow-soft">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => toggle(p.id)}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="flex-1">
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {[p.matricula, p.funcao?.nome, p.data_contratacao && `contratado ${p.data_contratacao}`]
                          .filter(Boolean).join(" • ") || "—"}
                      </div>
                    </div>
                    <div className="hidden gap-4 text-xs text-muted-foreground sm:flex">
                      <span><strong className="text-foreground">{periodos.length}</strong> períodos</span>
                      <span><strong className="text-foreground">{totalRestantes}</strong> dias restantes</span>
                      {alertaCount > 0 && (
                        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700">
                          <AlertTriangle className="mr-1 h-3 w-3" /> {alertaCount} alerta(s)
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!p.data_contratacao}
                      onClick={(e) => { e.stopPropagation(); setProgPessoa(p); }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Programar
                    </Button>
                  </button>

                  {isOpen && (
                    <div className="border-t px-4 py-3">
                      {periodos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Sem períodos calculados. Verifique a data de contratação em{" "}
                          <Link to="/pessoas" className="underline">Pessoas</Link>.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase text-muted-foreground">
                              <tr>
                                <th className="py-1">Período</th>
                                <th className="py-1">Aquisitivo</th>
                                <th className="py-1">Vence</th>
                                <th className="py-1 text-right">Direito</th>
                                <th className="py-1 text-right">Usados</th>
                                <th className="py-1 text-right">Agendados</th>
                                <th className="py-1 text-right">Vendidos</th>
                                <th className="py-1 text-right">Restantes</th>
                                <th className="py-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {periodos.map((per) => {
                                const st = STATUS_PERIODO_STYLE[per.status];
                                return (
                                  <tr key={per.inicio} className="border-t">
                                    <td className="py-1.5 font-medium">{per.label}</td>
                                    <td className="py-1.5 text-xs text-muted-foreground">
                                      {per.inicio} → {per.fim}
                                    </td>
                                    <td className="py-1.5 text-xs text-muted-foreground">{per.limite}</td>
                                    <td className="py-1.5 text-right">
                                      {per.emAquisicao ? `${per.proporcionais.toFixed(1)}` : per.direito}
                                    </td>
                                    <td className="py-1.5 text-right">{per.usados}</td>
                                    <td className="py-1.5 text-right">{per.agendados}</td>
                                    <td className="py-1.5 text-right">{per.vendidos}</td>
                                    <td className="py-1.5 text-right font-semibold">{per.restantes}</td>
                                    <td className="py-1.5">
                                      <Badge variant="outline" className={st.chip}>
                                        <span className={`mr-1 inline-block h-2 w-2 rounded-full ${st.dot}`} />
                                        {per.status}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtrados.length === 0 && (
              <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                Nenhum colaborador encontrado.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendario">
          <CalendarioAnual pessoas={ativos} ferias={ferias} ano={ano} />
        </TabsContent>
      </Tabs>

      {progPessoa && (
        <ProgramarFeriasDialog
          pessoa={progPessoa}
          periodos={periodosPorPessoa.get(progPessoa.id) ?? []}
          ferias={ferias.filter((f) => f.pessoa_id === progPessoa.id)}
          escalasIds={new Set(
            escalas.filter((e) => e.pessoa_id === progPessoa.id).map((e) => e.data),
          )}
          onClose={() => setProgPessoa(null)}
          onSaved={handleSaved}
          hoje={hoje}
          allowAccruing={allowAccruing}
        />
      )}
    </PageShell>
  );
}

function KpiCard({
  label, value, tone,
}: { label: string; value: number; tone?: "warning" | "critical" | "danger" }) {
  const toneClass =
    tone === "danger" ? "border-destructive/30 bg-destructive/5"
    : tone === "critical" ? "border-orange-500/30 bg-orange-500/5"
    : tone === "warning" ? "border-amber-500/30 bg-amber-500/5"
    : "";
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-soft ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/* --------------------------- Programar dialog --------------------------- */

function ProgramarFeriasDialog({
  pessoa, periodos, ferias, escalasIds, hoje, onClose, onSaved, allowAccruing,
}: {
  pessoa: PessoaComFuncao;
  periodos: PeriodoFerias[];
  ferias: Ferias[];
  escalasIds: Set<string>;
  hoje: string;
  onClose: () => void;
  onSaved: () => void;
  allowAccruing: boolean;
}) {
  // Períodos selecionáveis: com saldo restante OU em aquisição (se política permite)
  const selecionaveis = periodos.filter(
    (p) => p.restantes > 0 || (allowAccruing && p.emAquisicao),
  );
  const defaultPeriodo =
    selecionaveis.slice().sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? periodos[0];

  const [periodoInicio, setPeriodoInicio] = useState<string>(defaultPeriodo?.inicio ?? "");
  const periodoSel = periodos.find((p) => p.inicio === periodoInicio) ?? defaultPeriodo;

  const [modo, setModo] = useState<"intervalo" | "quantidade">("intervalo");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [qtdDias, setQtdDias] = useState(20);
  const [diasAbono, setDiasAbono] = useState(0);
  const [tipo, setTipo] = useState<TipoProgramacaoFerias>("Integrais");
  const [observacao, setObservacao] = useState("");
  const [confirmConflito, setConfirmConflito] = useState(false);

  const diasGozo = modo === "intervalo"
    ? Math.max(diffDaysInclusive(dataInicio, dataFim), 0)
    : qtdDias;
  const fimCalculado = modo === "intervalo" ? dataFim : fimPorQuantidade(dataInicio, qtdDias);

  // Cálculo dinâmico para períodos em aquisição
  const emAquisicao = !!periodoSel?.emAquisicao;
  const acumuladoHoje = periodoSel ? diasAcumuladosAte(periodoSel.inicio, hoje) : 0;
  const acumuladoInicio = periodoSel && dataInicio
    ? diasAcumuladosAte(periodoSel.inicio, dataInicio)
    : 0;
  const consumidoPeriodo = periodoSel
    ? periodoSel.usados + periodoSel.agendados + periodoSel.vendidos
    : 0;
  const maxSchedulable = periodoSel
    ? emAquisicao
      ? Math.max(acumuladoInicio - consumidoPeriodo, 0)
      : periodoSel.restantes
    : 0;

  // Validação por período selecionado
  const abonadosNoPeriodo = periodoSel?.vendidos ?? 0;
  let erro: string | null = periodoSel ? null : "Selecione um período aquisitivo.";
  if (periodoSel) {
    if (emAquisicao && diasGozo + diasAbono > maxSchedulable) {
      erro = "Os dias solicitados ultrapassam o saldo acumulado disponível na data de início das férias.";
    } else {
      erro = validarProgramacao({
        diasGozo, diasAbono,
        saldo: maxSchedulable,
        abonadosNoPeriodo,
      });
    }
  }

  // Conflitos: escala existente
  const conflitoEscala = useMemo(() => {
    if (!dataInicio || !fimCalculado) return false;
    let cur = dataInicio;
    while (cur <= fimCalculado) {
      if (escalasIds.has(cur)) return true;
      cur = addDays(cur, 1);
    }
    return false;
  }, [dataInicio, fimCalculado, escalasIds]);

  // Conflito: sobreposição com outra férias
  const conflitoSobreposicao = useMemo(() => {
    return ferias.some(
      (f) => f.data_inicio <= fimCalculado && f.data_fim >= dataInicio,
    );
  }, [ferias, dataInicio, fimCalculado]);

  const temConflito = conflitoEscala || conflitoSobreposicao;

  const save = useMutation({
    mutationFn: async () => {
      if (erro) throw new Error(erro);
      if (!periodoSel) throw new Error("Período aquisitivo obrigatório.");
      const payload = {
        pessoa_id: pessoa.id,
        data_inicio: dataInicio,
        data_fim: fimCalculado,
        dias_gozo: diasGozo,
        dias_abono: diasAbono,
        tipo_programacao: tipo,
        periodo_aquisitivo_inicio: periodoSel.inicio,
        periodo_aquisitivo_fim: periodoSel.fim,
        status: "Programada",
        observacao: observacao || null,
      };
      const { error } = await supabase.from("ferias").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias programadas.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSave() {
    if (erro) { toast.error(erro); return; }
    if (temConflito && !confirmConflito) { setConfirmConflito(true); return; }
    save.mutate();
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Programar férias — {pessoa.nome}</DialogTitle>
            <DialogDescription>
              {periodoSel
                ? emAquisicao
                  ? <>Período <strong>{periodoSel.label}</strong> — em aquisição · acumulado hoje: <strong>{acumuladoHoje}</strong>/30 dias</>
                  : <>Período <strong>{periodoSel.label}</strong> — restantes: <strong>{maxSchedulable}</strong> dias · vence {periodoSel.limite}</>
                : "Nenhum período disponível para programação."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>Período aquisitivo *</Label>
              <Select value={periodoInicio} onValueChange={setPeriodoInicio}>
                <SelectTrigger><SelectValue placeholder="Selecione o período" /></SelectTrigger>
                <SelectContent>
                  {periodos.map((p) => {
                    const acumulado = diasAcumuladosAte(p.inicio, hoje);
                    const isSelectable = p.restantes > 0 || (allowAccruing && p.emAquisicao);
                    const label = p.emAquisicao
                      ? `🟡 ${p.label} — Adquirindo (${acumulado}/30 dias)`
                      : `${p.label} — ${p.restantes} dias restantes${p.status === "Vencida" ? " ⚠️ vencida" : ""}`;
                    return (
                      <SelectItem key={p.inicio} value={p.inicio} disabled={!isSelectable}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Padrão: período mais antigo com saldo disponível.
                {allowAccruing ? " Períodos em aquisição podem ser agendados com base na data de início." : ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tipo de programação</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoProgramacaoFerias)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_PROGRAMACAO_FERIAS.map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_PROGRAMACAO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="intervalo">Por intervalo</TabsTrigger>
                <TabsTrigger value="quantidade">Por quantidade</TabsTrigger>
              </TabsList>
              <TabsContent value="intervalo" className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              </TabsContent>
              <TabsContent value="quantidade" className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de dias</Label>
                  <Input
                    type="number" min={1} value={qtdDias}
                    onChange={(e) => setQtdDias(parseInt(e.target.value || "0", 10))}
                  />
                  <p className="text-xs text-muted-foreground">Fim: {fimCalculado}</p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Dias de gozo</Label>
                <Input type="number" value={diasGozo} readOnly className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <Label>Dias de abono (máx. 10)</Label>
                <Input
                  type="number" min={0} max={10} value={diasAbono}
                  onChange={(e) => setDiasAbono(parseInt(e.target.value || "0", 10))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div>Total: <strong>{diasGozo + diasAbono}</strong> ({diasGozo} gozo + {diasAbono} abono).</div>
              {periodoSel && emAquisicao && (
                <>
                  <div>Acumulado atual: <strong>{acumuladoHoje}</strong> dias.</div>
                  <div>Acumulado na data de início ({dataInicio}): <strong>{acumuladoInicio}</strong> dias.</div>
                  <div>Máximo agendável: <strong>{maxSchedulable}</strong> dias.</div>
                </>
              )}
              {periodoSel && !emAquisicao && (
                <div>Saldo do período após: {Math.max(maxSchedulable - diasGozo - diasAbono, 0)}.</div>
              )}
            </div>

            {temConflito && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                {conflitoEscala && "Existe escala no período. "}
                {conflitoSobreposicao && "Há sobreposição com outra férias. "}
                Aviso — não bloqueia o salvamento.
              </div>
            )}

            {erro && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {erro}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!!erro || save.isPending}>
              Salvar programação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmConflito} onOpenChange={setConfirmConflito}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflitos detectados</AlertDialogTitle>
            <AlertDialogDescription>
              {conflitoEscala && "Este colaborador possui alocações previstas no período. "}
              {conflitoSobreposicao && "Existe outra férias sobreposta. "}
              Deseja continuar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmConflito(false); save.mutate(); }}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* --------------------------- Calendário anual --------------------------- */

function CalendarioAnual({
  pessoas, ferias, ano,
}: { pessoas: PessoaComFuncao[]; ferias: Ferias[]; ano: number }) {
  const meses = Array.from({ length: 12 }, (_, i) => i);
  const monthLabel = (m: number) =>
    new Date(ano, m, 1).toLocaleDateString("pt-BR", { month: "short" });
  const daysInMonth = (m: number) => new Date(ano, m + 1, 0).getDate();

  function feriasNoMes(pessoaId: string, m: number) {
    const start = `${ano}-${String(m + 1).padStart(2, "0")}-01`;
    const end = `${ano}-${String(m + 1).padStart(2, "0")}-${daysInMonth(m)}`;
    return ferias.filter(
      (f) => f.pessoa_id === pessoaId && f.data_fim >= start && f.data_inicio <= end,
    );
  }

  function periodoLabelFromISO(iso: string | null | undefined): string {
    if (!iso) return "";
    const y = Number(iso.slice(0, 4));
    return `${y}/${y + 1}`;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
      <table className="w-full min-w-[900px] text-xs">
        <thead className="bg-muted/40 text-left uppercase text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2">Colaborador</th>
            {meses.map((m) => (
              <th key={m} className="px-2 py-2 text-center capitalize">{monthLabel(m)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pessoas.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">{p.nome}</td>
              {meses.map((m) => {
                const fs = feriasNoMes(p.id, m);
                if (fs.length === 0) return <td key={m} className="px-2 py-2"></td>;
                return (
                  <td key={m} className="px-1 py-1">
                    {fs.map((f) => {
                      const gozo = f.dias_gozo ?? diffDaysInclusive(f.data_inicio, f.data_fim);
                      const abono = f.dias_abono ?? 0;
                      const label = periodoLabelFromISO(f.periodo_aquisitivo_inicio);
                      return (
                        <div
                          key={f.id}
                          title={`${f.data_inicio} → ${f.data_fim} • ${gozo}d gozo${abono ? ` + ${abono}d abono` : ""}${label ? ` • Período ${label}` : ""}`}
                          className="my-0.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-800"
                        >
                          <div className="font-semibold">{f.data_inicio.slice(8)}–{f.data_fim.slice(8)}</div>
                          <div className="text-[9px]">
                            {gozo}d{abono ? ` + ${abono}d abono` : ""}
                            {label && ` · ${label}`}
                          </div>
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
