import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarHeart, Plus, Search } from "lucide-react";
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
  calcularSaldo, diffDaysInclusive, fimPorQuantidade, getAlertaFerias,
  validarProgramacao, type Ferias, type SaldoFerias,
} from "@/lib/ferias";

const TODAY = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/ferias")({
  head: () => ({
    meta: [
      { title: "Plano de Férias — Escala Operacional" },
      { name: "description", content: "Controle de férias, abono pecuniário e calendário anual." },
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

  const ativos = useMemo(
    () => pessoas.filter((p) => p.status !== "Desligado" && p.status !== "Inativo"),
    [pessoas],
  );

  const setupOf = (p: PessoaComFuncao) => {
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
  };

  const saldosPorPessoa = useMemo(() => {
    const m = new Map<string, SaldoFerias>();
    for (const p of ativos) {
      const fp = ferias.filter((f) => f.pessoa_id === p.id);
      m.set(p.id, calcularSaldo(p.data_contratacao, fp, hoje, setupOf(p)));
    }
    return m;
  }, [ativos, ferias, hoje]);

  // Setup metrics
  const setupPendente = ativos.filter((p) => p.data_contratacao && !setupOf(p).vacation_status).length;
  const setupEmDia = ativos.filter((p) => setupOf(p).vacation_status === "em_dia").length;
  const setupPending = ativos.filter((p) => setupOf(p).vacation_status === "pendente").length;
  const setupVencida = ativos.filter((p) => setupOf(p).vacation_status === "vencida").length;

  // Dashboard metrics
  const emFeriasHoje = ferias.filter(
    (f) => f.data_inicio <= hoje && f.data_fim >= hoje,
  ).length;
  const proximos30 = ferias.filter((f) => {
    const futureLimit = addDays(hoje, 30);
    return f.data_inicio >= hoje && f.data_inicio <= futureLimit;
  }).length;

  let vencendo60 = 0, vencendo30 = 0, vencidas = 0, abonadosAno = 0, saldoTotal = 0;
  for (const [, s] of saldosPorPessoa) {
    if (s.saldo > 0 && s.diasParaVencer !== null) {
      if (s.diasParaVencer < 0) vencidas += 1;
      else if (s.diasParaVencer <= 30) vencendo30 += 1;
      else if (s.diasParaVencer <= 60) vencendo60 += 1;
    }
    saldoTotal += s.saldo;
  }
  for (const f of ferias) {
    if (f.data_inicio.startsWith(String(ano))) abonadosAno += f.dias_abono ?? 0;
  }

  const filtrados = useMemo(() => {
    const s = search.toLowerCase();
    return ativos.filter(
      (p) => !s || p.nome.toLowerCase().includes(s) || (p.matricula ?? "").toLowerCase().includes(s),
    );
  }, [ativos, search]);

  return (
    <PageShell
      title="Plano de Férias"
      description="Controle automático de períodos aquisitivos, abono pecuniário e cobertura operacional."
      icon={<CalendarHeart className="h-5 w-5" />}
    >
      {setupPendente > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div className="flex-1">
            <p className="font-medium">Configuração inicial de férias pendente</p>
            <p className="text-muted-foreground">
              {setupPendente} colaborador(es) sem status inicial de férias definido. Configure em
              Pessoas › Férias para começar o controle automático.
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Configuração pendente" value={setupPendente} tone={setupPendente > 0 ? "warning" : undefined} />
            <KpiCard label="Férias em dia" value={setupEmDia} />
            <KpiCard label="Saldo pendente (setup)" value={setupPending} tone={setupPending > 0 ? "warning" : undefined} />
            <KpiCard label="Vencidas (setup)" value={setupVencida} tone={setupVencida > 0 ? "danger" : undefined} />
            <KpiCard label="Em férias hoje" value={emFeriasHoje} />
            <KpiCard label="Próximos 30 dias" value={proximos30} />
            <KpiCard label="Vencendo em 60d" value={vencendo60} tone="warning" />
            <KpiCard label="Vencendo em 30d" value={vencendo30} tone="critical" />
            <KpiCard label="Vencidas" value={vencidas} tone="danger" />
            <KpiCard label={`Abonados em ${ano}`} value={abonadosAno} />
            <KpiCard label="Saldo total da equipe" value={saldoTotal} />
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
          <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Colaborador</th>
                  <th className="px-3 py-2">Contratação</th>
                  <th className="px-3 py-2">Período aquisitivo</th>
                  <th className="px-3 py-2 text-right">Direito</th>
                  <th className="px-3 py-2 text-right">Programados</th>
                  <th className="px-3 py-2 text-right">Gozados</th>
                  <th className="px-3 py-2 text-right">Abonados</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2">Alerta</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const s = saldosPorPessoa.get(p.id)!;
                  const alerta = getAlertaFerias(s);
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.matricula, p.funcao?.nome].filter(Boolean).join(" • ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2">{p.data_contratacao ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.periodo ? `${s.periodo.inicio} → ${s.periodo.fim}` : "—"}
                        {s.vencimento && (
                          <div className="text-muted-foreground">vence {s.vencimento}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{s.direito}</td>
                      <td className="px-3 py-2 text-right">{s.programados}</td>
                      <td className="px-3 py-2 text-right">{s.gozados}</td>
                      <td className="px-3 py-2 text-right">{s.abonados}</td>
                      <td className="px-3 py-2 text-right font-semibold">{s.saldo}</td>
                      <td className="px-3 py-2">
                        {alerta && (
                          <Badge
                            variant="secondary"
                            className={
                              alerta.nivel === "vencida"
                                ? "bg-destructive/15 text-destructive"
                                : alerta.nivel === "critical"
                                ? "bg-orange-500/15 text-orange-600"
                                : "bg-amber-500/15 text-amber-600"
                            }
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" /> {alerta.mensagem}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setProgPessoa(p)}
                          disabled={!p.data_contratacao}>
                          <Plus className="h-3.5 w-3.5" /> Programar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
                    Nenhum colaborador encontrado.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Colaboradores sem data de contratação não exibem saldo. Edite o cadastro em{" "}
            <Link to="/pessoas" className="underline">Pessoas</Link>.
          </p>
        </TabsContent>

        <TabsContent value="calendario">
          <CalendarioAnual pessoas={ativos} ferias={ferias} ano={ano} />
        </TabsContent>
      </Tabs>

      {progPessoa && (
        <ProgramarFeriasDialog
          pessoa={progPessoa}
          ferias={ferias.filter((f) => f.pessoa_id === progPessoa.id)}
          escalasIds={new Set(
            escalas.filter((e) => e.pessoa_id === progPessoa.id).map((e) => e.data),
          )}
          onClose={() => setProgPessoa(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["ferias"] });
            qc.invalidateQueries({ queryKey: ["escalas"] });
            setProgPessoa(null);
          }}
          hoje={hoje}
        />
      )}
    </PageShell>
  );
}

function KpiCard({
  label, value, tone,
}: { label: string; value: number; tone?: "warning" | "critical" | "danger" }) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "critical"
      ? "border-orange-500/30 bg-orange-500/5"
      : tone === "warning"
      ? "border-amber-500/30 bg-amber-500/5"
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
  pessoa, ferias, escalasIds, hoje, onClose, onSaved,
}: {
  pessoa: PessoaComFuncao;
  ferias: Ferias[];
  escalasIds: Set<string>;
  hoje: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saldo = calcularSaldo(pessoa.data_contratacao, ferias, hoje);
  const abonadosNoPeriodo = saldo.abonados;

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

  const erro = validarProgramacao({
    diasGozo, diasAbono, saldo: saldo.saldo, abonadosNoPeriodo,
  });

  const conflito = useMemo(() => {
    if (!dataInicio || !fimCalculado) return false;
    let cur = dataInicio;
    while (cur <= fimCalculado) {
      if (escalasIds.has(cur)) return true;
      cur = addDays(cur, 1);
    }
    return false;
  }, [dataInicio, fimCalculado, escalasIds]);

  const save = useMutation({
    mutationFn: async () => {
      if (erro) throw new Error(erro);
      const payload = {
        pessoa_id: pessoa.id,
        data_inicio: dataInicio,
        data_fim: fimCalculado,
        dias_gozo: diasGozo,
        dias_abono: diasAbono,
        tipo_programacao: tipo,
        periodo_aquisitivo_inicio: saldo.periodo?.inicio ?? null,
        periodo_aquisitivo_fim: saldo.periodo?.fim ?? null,
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
    if (erro) {
      toast.error(erro);
      return;
    }
    if (conflito && !confirmConflito) {
      setConfirmConflito(true);
      return;
    }
    save.mutate();
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Programar férias — {pessoa.nome}</DialogTitle>
            <DialogDescription>
              Saldo disponível: <strong>{saldo.saldo}</strong> de {saldo.direito} dias
              {saldo.periodo && ` • Período ${saldo.periodo.inicio} → ${saldo.periodo.fim}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
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

            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              Total programado: <strong>{diasGozo + diasAbono}</strong> dias
              {" "}({diasGozo} gozo + {diasAbono} abono). Saldo após: {Math.max(saldo.saldo - diasGozo - diasAbono, 0)}.
            </div>

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
            <AlertDialogTitle>Conflito com escala existente</AlertDialogTitle>
            <AlertDialogDescription>
              Este colaborador possui alocações previstas durante o período de férias. Deseja continuar?
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
                    {fs.map((f) => (
                      <div
                        key={f.id}
                        title={`${f.data_inicio} → ${f.data_fim}`}
                        className="my-0.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-700"
                      >
                        {f.data_inicio.slice(8)}–{f.data_fim.slice(8)}
                      </div>
                    ))}
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
