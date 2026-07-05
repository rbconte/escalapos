import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Download,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { pessoasQuery } from "@/lib/queries";
import {
  averageByPillar,
  buildInsights,
  buildSmartAlerts,
  confidenceOf,
  IMPACT_META,
  IMPACT_WEIGHT,
  performanceRecordsQuery,
  PILLARS,
  RECOGNITION_TAGS,
  recordScore,
  teamHealth,
  TIPO_META,
  TREND_META,
  trendDirection,
  sentimentOf,
  type PerformanceImpact,
  type PerformanceRecordComPessoa,
  type PerformanceType,
  type PillarKey,
  type PersonInsight,
} from "@/lib/performance";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — Escala Operacional" },
      {
        name: "description",
        content:
          "Inteligência de performance: eventos, tendências, alertas e insights da equipe.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(pessoasQuery());
    context.queryClient.ensureQueryData(performanceRecordsQuery());
  },
  component: PerformancePage,
});

const NONE = "__none__";

function PerformancePage() {
  const { data: records } = useSuspenseQuery(performanceRecordsQuery());
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const [tab, setTab] = useState("dashboard");
  const [openDialog, setOpenDialog] = useState(false);

  return (
    <PageShell
      title="Performance"
      description="Inteligência contínua de desempenho, incidentes e reconhecimentos."
      icon={<TrendingUp className="h-5 w-5" />}
      actions={
        <Button onClick={() => setOpenDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo registro
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Registros
          </TabsTrigger>
          <TabsTrigger value="people" className="gap-1.5">
            <Users className="h-4 w-4" /> Pessoas
          </TabsTrigger>
          <TabsTrigger value="recognition" className="gap-1.5">
            <Award className="h-4 w-4" /> Reconhecimento
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Relatórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0 flex-1">
          <Dashboard records={records} pessoas={pessoas} />
        </TabsContent>
        <TabsContent value="records" className="mt-0 flex-1">
          <RecordsTab records={records} />
        </TabsContent>
        <TabsContent value="people" className="mt-0 flex-1">
          <PeopleTab records={records} pessoas={pessoas} />
        </TabsContent>
        <TabsContent value="recognition" className="mt-0 flex-1">
          <RecognitionTab records={records} />
        </TabsContent>
        <TabsContent value="reports" className="mt-0 flex-1">
          <ReportsTab records={records} pessoas={pessoas} />
        </TabsContent>
      </Tabs>

      <RecordDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        pessoas={pessoas}
      />
    </PageShell>
  );
}

/* -------------------- Dashboard -------------------- */

function Dashboard({
  records,
  pessoas,
}: {
  records: PerformanceRecordComPessoa[];
  pessoas: { id: string; nome: string }[];
}) {
  const insights = useMemo(() => buildInsights(records, pessoas), [records, pessoas]);
  const alerts = useMemo(() => buildSmartAlerts(insights), [insights]);
  const health = useMemo(() => teamHealth(insights), [insights]);
  const teamTrend = useMemo(() => trendDirection(records), [records]);
  const avgs = useMemo(() => averageByPillar(records), [records]);

  const distribution = useMemo(() => {
    let pos = 0, neu = 0, neg = 0;
    for (const r of records) {
      const s = sentimentOf(r);
      if (s === "positivo") pos++;
      else if (s === "negativo") neg++;
      else neu++;
    }
    return { pos, neu, neg };
  }, [records]);

  const trend = useMemo(() => buildTrend(records), [records]);

  const withData = insights.filter((i) => i.count > 0);
  const topPerformers = [...withData]
    .filter((i) => i.weightedAvg !== null && i.count >= 3)
    .sort((a, b) => (b.weightedAvg ?? 0) - (a.weightedAvg ?? 0))
    .slice(0, 5);

  const needsAttention = [...withData]
    .filter(
      (i) =>
        i.trend.dir === "declining" ||
        (i.weightedAvg !== null && i.weightedAvg <= 5) ||
        i.negatives >= 2,
    )
    .sort((a, b) => (a.weightedAvg ?? 10) - (b.weightedAvg ?? 10))
    .slice(0, 5);

  const mostImproved = [...withData]
    .filter((i) => i.trend.dir === "improving" && (i.trend.delta ?? 0) > 0)
    .sort((a, b) => (b.trend.delta ?? 0) - (a.trend.delta ?? 0))
    .slice(0, 5);

  const mostRecognized = [...withData]
    .filter((i) => i.recognitions > 0)
    .sort((a, b) => b.recognitions - a.recognitions)
    .slice(0, 5);

  const noRecentFeedback = insights.filter(
    (i) => i.count === 0 || (i.daysSinceLast !== null && i.daysSinceLast >= 30),
  );

  const recent = records.slice(0, 8);

  const healthChip =
    health.status === "saudavel"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : health.status === "atencao"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
        : "bg-red-500/10 text-red-600 border-red-500/20";

  return (
    <div className="grid gap-4">
      {/* Team Health overview */}
      <div className="grid gap-3 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saúde do time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl font-bold">
                {health.avg !== null ? health.avg.toFixed(1) : "—"}
              </span>
              <Badge variant="outline" className={healthChip}>
                {health.status === "saudavel"
                  ? "Saudável"
                  : health.status === "atencao"
                    ? "Atenção"
                    : "Crítico"}
              </Badge>
              <Badge variant="outline" className={TREND_META[teamTrend.dir].chip}>
                {TREND_META[teamTrend.dir].arrow} {TREND_META[teamTrend.dir].label}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {health.improving} em evolução · {health.stable} estáveis ·{" "}
              {health.declining} em queda
            </p>
          </CardContent>
        </Card>
        {avgs.map((a) => (
          <Card key={a.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Média {a.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-3xl font-bold"
                  style={{ color: a.color }}
                >
                  {a.avg !== null ? a.avg.toFixed(1) : "—"}
                </span>
                <Badge variant="outline" className={confidenceOf(a.count).chip}>
                  {confidenceOf(a.count).label}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.count} {a.count === 1 ? "registro" : "registros"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Smart alerts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Alertas inteligentes
            <span className="ml-auto text-xs text-muted-foreground">
              {alerts.length} sinal{alerts.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <EmptyMini text="Nenhum sinal preocupante. 👍" />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {alerts.slice(0, 6).map((a) => {
                const chip =
                  a.severity === "critical"
                    ? "border-red-500/40 bg-red-500/5"
                    : a.severity === "warn"
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-sky-500/40 bg-sky-500/5";
                return (
                  <li
                    key={a.id}
                    className={`rounded-md border p-3 text-sm ${chip}`}
                  >
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Management insights */}
      <div className="grid gap-3 lg:grid-cols-3">
        <InsightList
          title="Precisa de atenção"
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          items={needsAttention}
          empty="Ninguém no radar agora."
          metric={(i) =>
            `${i.weightedAvg !== null ? i.weightedAvg.toFixed(1) : "—"} · ${TREND_META[i.trend.dir].arrow}`
          }
        />
        <InsightList
          title="Maior evolução"
          icon={<Activity className="h-4 w-4 text-emerald-600" />}
          items={mostImproved}
          empty="Sem evoluções destacadas."
          metric={(i) =>
            `+${(i.trend.delta ?? 0).toFixed(1)} (${i.trend.previous?.toFixed(1)}→${i.trend.recent?.toFixed(1)})`
          }
        />
        <InsightList
          title="Top performers"
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          items={topPerformers}
          empty="Sem dados suficientes."
          metric={(i) => `${i.weightedAvg?.toFixed(1)} · ${i.count} eventos`}
        />
        <InsightList
          title="Mais reconhecidos"
          icon={<Award className="h-4 w-4 text-amber-600" />}
          items={mostRecognized}
          empty="Nenhum reconhecimento ainda."
          metric={(i) => `${i.recognitions} ⭐`}
        />
        <InsightList
          title="Sem feedback recente"
          icon={<Users className="h-4 w-4 text-slate-500" />}
          items={noRecentFeedback.slice(0, 5)}
          empty="Todos foram observados recentemente."
          metric={(i) =>
            i.count === 0
              ? "sem registros"
              : `${i.daysSinceLast}d atrás`
          }
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição de eventos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DistRow label="Positivos" value={distribution.pos} total={records.length} color="bg-emerald-500" />
            <DistRow label="Neutros" value={distribution.neu} total={records.length} color="bg-muted-foreground" />
            <DistRow label="Negativos" value={distribution.neg} total={records.length} color="bg-red-500" />
          </CardContent>
        </Card>
      </div>

      {/* Trend chart + activity */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência por pilar</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] p-2">
            {trend.length === 0 ? (
              <EmptyMini text="Sem dados suficientes ainda." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {PILLARS.map((p) => (
                    <Line
                      key={p.key}
                      type="monotone"
                      dataKey={p.key}
                      name={p.label}
                      stroke={p.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividade recente</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyMini text="Nada por aqui ainda." />
            ) : (
              <ul className="space-y-2 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <Badge variant="outline" className={TIPO_META[r.tipo].chip + " shrink-0"}>
                      {TIPO_META[r.tipo].label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.pessoa?.nome ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(r.data)}
                        {r.observacao ? ` · ${r.observacao}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InsightList({
  title,
  icon,
  items,
  empty,
  metric,
}: {
  title: string;
  icon: React.ReactNode;
  items: PersonInsight[];
  empty: string;
  metric: (i: PersonInsight) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMini text={empty} />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {items.map((i) => (
              <li
                key={i.pessoaId}
                className="flex items-center justify-between rounded-md border px-3 py-1.5"
              >
                <span className="truncate">{i.nome}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {metric(i)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DistRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-6 text-xs text-muted-foreground">
      {text}
    </div>
  );
}

/* -------------------- Records tab -------------------- */

function RecordsTab({ records }: { records: PerformanceRecordComPessoa[] }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<PerformanceType | "">("");
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("performance_records" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance_records"] });
      toast.success("Registro removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records.filter((r) => {
      if (tipo && r.tipo !== tipo) return false;
      if (!needle) return true;
      return (
        r.pessoa?.nome.toLowerCase().includes(needle) ||
        (r.observacao ?? "").toLowerCase().includes(needle) ||
        (r.recognition_tag ?? "").toLowerCase().includes(needle)
      );
    });
  }, [records, q, tipo]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por pessoa, observação, tag…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={tipo || NONE}
          onValueChange={(v) => setTipo(v === NONE ? "" : (v as PerformanceType))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Todos os tipos</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="incidente">Incidente</SelectItem>
            <SelectItem value="reconhecimento">Reconhecimento</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum registro encontrado.
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <Badge variant="outline" className={TIPO_META[r.tipo].chip}>
                  {TIPO_META[r.tipo].label}
                </Badge>
                <Badge variant="outline" className={IMPACT_META[r.impact ?? "medio"].chip}>
                  {IMPACT_META[r.impact ?? "medio"].label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{r.pessoa?.nome ?? "—"}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.data)}
                    </span>
                  </div>
                  {r.recognition_tag && (
                    <p className="mt-0.5 text-xs font-medium text-amber-600">
                      ⭐ {r.recognition_tag}
                    </p>
                  )}
                  {r.observacao && (
                    <p className="mt-1 text-sm text-muted-foreground">{r.observacao}</p>
                  )}
                  <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground">
                    {PILLARS.map((p) =>
                      typeof r[p.key] === "number" ? (
                        <span key={p.key}>
                          <span style={{ color: p.color }}>●</span> {p.label}:{" "}
                          <strong>{r[p.key]}</strong>
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => del.mutate(r.id)}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- People tab -------------------- */

function PeopleTab({
  records,
  pessoas,
}: {
  records: PerformanceRecordComPessoa[];
  pessoas: { id: string; nome: string }[];
}) {
  const [selectedId, setSelectedId] = useState<string>(pessoas[0]?.id ?? "");
  const list = useMemo(
    () => [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [pessoas],
  );

  const personRecords = useMemo(
    () => records.filter((r) => r.pessoa_id === selectedId),
    [records, selectedId],
  );

  const avgs = useMemo(() => averageByPillar(personRecords), [personRecords]);
  const trend = useMemo(() => buildTrend(personRecords), [personRecords]);
  const overallTrend = useMemo(() => trendDirection(personRecords), [personRecords]);
  const conf = confidenceOf(personRecords.length);

  const perPillarTrend = useMemo(() => {
    return PILLARS.map((p) => {
      const subset = personRecords
        .filter((r) => typeof r[p.key] === "number")
        .map((r) => ({ ...r, nota_tecnico: null, nota_comportamento: null, nota_artistico: null, [p.key]: r[p.key] }));
      return { ...p, trend: trendDirection(subset as PerformanceRecordComPessoa[]) };
    });
  }, [personRecords]);

  const sentiment = useMemo(() => {
    let pos = 0, neu = 0, neg = 0;
    for (const r of personRecords) {
      const s = sentimentOf(r);
      if (s === "positivo") pos++;
      else if (s === "negativo") neg++;
      else neu++;
    }
    return { pos, neu, neg };
  }, [personRecords]);

  const recognitions = personRecords.filter((r) => r.tipo === "reconhecimento");
  const selected = pessoas.find((p) => p.id === selectedId);

  const autoInsights = useMemo(() => {
    const items: string[] = [];
    if (personRecords.length === 0) items.push("Nenhum registro ainda — comece a observar.");
    if (overallTrend.dir === "improving")
      items.push(`Desempenho em evolução (+${overallTrend.delta?.toFixed(1)} entre metades).`);
    if (overallTrend.dir === "declining")
      items.push(`Desempenho em queda (${overallTrend.delta?.toFixed(1)}). Considere um 1:1.`);
    if (recognitions.length >= 3)
      items.push(`${recognitions.length} reconhecimentos acumulados.`);
    if (sentiment.neg >= 3 && sentiment.neg > sentiment.pos)
      items.push(`Predomínio de eventos negativos (${sentiment.neg}).`);
    const last = personRecords[0];
    if (last) {
      const days = Math.floor((Date.now() - new Date(last.data).getTime()) / 86400_000);
      if (days >= 30) items.push(`Último registro há ${days} dias.`);
    }
    return items;
  }, [personRecords, overallTrend, recognitions.length, sentiment]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="max-h-[calc(100vh-220px)] overflow-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Colaboradores</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ul className="space-y-0.5">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    p.id === selectedId
                      ? "bg-primary/10 font-medium text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {p.nome}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {!selected ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Selecione um colaborador.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{selected.nome}</CardTitle>
                  <Badge variant="outline" className={conf.chip}>{conf.label}</Badge>
                  <Badge variant="outline" className={TREND_META[overallTrend.dir].chip}>
                    {TREND_META[overallTrend.dir].arrow} {TREND_META[overallTrend.dir].label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {personRecords.length} registro{personRecords.length === 1 ? "" : "s"} ·{" "}
                  <span className="text-emerald-600">{sentiment.pos} positivos</span>
                  {" · "}<span>{sentiment.neu} neutros</span>{" · "}
                  <span className="text-red-600">{sentiment.neg} negativos</span>
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {perPillarTrend.map((a) => {
                  const avg = avgs.find((x) => x.key === a.key);
                  return (
                    <div key={a.key} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{a.label}</p>
                        <Badge variant="outline" className={TREND_META[a.trend.dir].chip + " text-[10px]"}>
                          {TREND_META[a.trend.dir].arrow}
                        </Badge>
                      </div>
                      <p className="font-display text-2xl font-bold" style={{ color: a.color }}>
                        {avg?.avg !== null && avg?.avg !== undefined ? avg.avg.toFixed(1) : "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {avg?.count ?? 0} registros
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {autoInsights.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" /> Insights automáticos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {autoInsights.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendência por pilar</CardTitle>
              </CardHeader>
              <CardContent className="h-[240px] p-2">
                {trend.length === 0 ? (
                  <EmptyMini text="Sem dados suficientes." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      {PILLARS.map((p) => (
                        <Line
                          key={p.key}
                          type="monotone"
                          dataKey={p.key}
                          name={p.label}
                          stroke={p.color}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Linha do tempo</CardTitle>
                </CardHeader>
                <CardContent className="max-h-[400px] space-y-2 overflow-auto">
                  {personRecords.length === 0 ? (
                    <EmptyMini text="Sem eventos registrados." />
                  ) : (
                    personRecords.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <Badge variant="outline" className={TIPO_META[r.tipo].chip}>
                          {TIPO_META[r.tipo].label}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(r.data)} · {IMPACT_META[r.impact ?? "medio"].label}
                          </p>
                          {r.recognition_tag && (
                            <p className="text-xs font-medium text-amber-600">
                              ⭐ {r.recognition_tag}
                            </p>
                          )}
                          {r.observacao && <p>{r.observacao}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Reconhecimentos</CardTitle>
                </CardHeader>
                <CardContent>
                  {recognitions.length === 0 ? (
                    <EmptyMini text="Nenhum reconhecimento ainda." />
                  ) : (
                    <ul className="space-y-2">
                      {recognitions.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
                        >
                          <Award className="h-4 w-4 shrink-0 text-amber-600" />
                          <div className="min-w-0">
                            <p className="font-medium">
                              {r.recognition_tag ?? "Reconhecimento"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(r.data)}
                              {r.observacao ? ` · ${r.observacao}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------- Recognition tab -------------------- */

function RecognitionTab({ records }: { records: PerformanceRecordComPessoa[] }) {
  const recs = records.filter((r) => r.tipo === "reconhecimento");
  const byTag = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recs) {
      const t = r.recognition_tag ?? "Sem tag";
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [recs]);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reconhecimentos por tag</CardTitle>
        </CardHeader>
        <CardContent>
          {byTag.length === 0 ? (
            <EmptyMini text="Sem reconhecimentos ainda." />
          ) : (
            <ul className="space-y-1.5">
              {byTag.map(([tag, count]) => (
                <li
                  key={tag}
                  className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                >
                  <span>{tag}</span>
                  <span className="font-mono text-xs text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Últimos reconhecimentos</CardTitle>
        </CardHeader>
        <CardContent>
          {recs.length === 0 ? (
            <EmptyMini text="Nenhum registro." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {recs.map((r) => (
                <li key={r.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-600" />
                    <p className="font-medium">{r.pessoa?.nome ?? "—"}</p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {r.recognition_tag ?? "Reconhecimento"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(r.data)}</p>
                  {r.observacao && <p className="mt-1 text-sm">{r.observacao}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Reports tab -------------------- */

function ReportsTab({
  records,
  pessoas,
}: {
  records: PerformanceRecordComPessoa[];
  pessoas: { id: string; nome: string }[];
}) {
  const today = new Date();
  const defaultStart = new Date(today.getTime() - 90 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const [inicio, setInicio] = useState(defaultStart);
  const [fim, setFim] = useState(today.toISOString().slice(0, 10));
  const [pessoaId, setPessoaId] = useState<string>("");

  const inRange = (iso: string, a: string, b: string) => iso >= a && iso <= b;

  const periodRecords = useMemo(
    () => records.filter((r) => inRange(r.data, inicio, fim)),
    [records, inicio, fim],
  );

  // Period comparison: same window length immediately before.
  const days =
    (new Date(fim).getTime() - new Date(inicio).getTime()) / 86400_000 + 1;
  const prevFim = new Date(new Date(inicio).getTime() - 86400_000)
    .toISOString()
    .slice(0, 10);
  const prevInicio = new Date(new Date(prevFim).getTime() - (days - 1) * 86400_000)
    .toISOString()
    .slice(0, 10);
  const prevRecords = records.filter((r) => inRange(r.data, prevInicio, prevFim));

  const teamRows = useMemo(() => {
    return pessoas
      .map((p) => {
        const rs = periodRecords.filter((r) => r.pessoa_id === p.id);
        const avgs = averageByPillar(rs);
        let pos = 0, neg = 0;
        for (const r of rs) {
          const s = sentimentOf(r);
          if (s === "positivo") pos++;
          else if (s === "negativo") neg++;
        }
        const conf = confidenceOf(rs.length);
        const t = trendDirection(rs);
        return {
          id: p.id,
          nome: p.nome,
          total: rs.length,
          pos,
          neg,
          artistico: avgs[0].avg,
          tecnico: avgs[1].avg,
          comportamento: avgs[2].avg,
          confidence: conf.label,
          trend: TREND_META[t.dir].label,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [pessoas, periodRecords]);

  const summaryCurrent = summarize(periodRecords);
  const summaryPrev = summarize(prevRecords);

  const individual = pessoaId
    ? periodRecords.filter((r) => r.pessoa_id === pessoaId)
    : [];
  const individualAvgs = averageByPillar(individual);
  const individualTrend = trendDirection(individual);

  const exportCsv = () => {
    const header = [
      "Colaborador",
      "Registros",
      "Positivos",
      "Negativos",
      "Artistico",
      "Tecnico",
      "Comportamento",
      "Confianca",
      "Tendencia",
    ];
    const rows = teamRows.map((r) => [
      r.nome,
      r.total,
      r.pos,
      r.neg,
      r.artistico ?? "",
      r.tecnico ?? "",
      r.comportamento ?? "",
      r.confidence,
      r.trend,
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance_${inicio}_a_${fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportIndividualTxt = () => {
    if (!pessoaId) return;
    const p = pessoas.find((x) => x.id === pessoaId);
    if (!p) return;
    const lines = [
      `Resumo individual — ${p.nome}`,
      `Período: ${inicio} a ${fim}`,
      `Registros: ${individual.length}`,
      `Tendência: ${TREND_META[individualTrend.dir].label}`,
      "",
      "Médias por pilar:",
      ...individualAvgs.map(
        (a) => `- ${a.label}: ${a.avg !== null ? a.avg.toFixed(1) : "—"} (${a.count})`,
      ),
      "",
      "Eventos:",
      ...individual.map(
        (r) =>
          `- ${formatDate(r.data)} · ${TIPO_META[r.tipo].label} · ${IMPACT_META[r.impact ?? "medio"].label}${
            r.observacao ? ` — ${r.observacao}` : ""
          }`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumo_${p.nome.replace(/\s+/g, "_")}_${inicio}_a_${fim}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="min-w-[200px]">
            <Label className="text-xs">Colaborador (resumo individual)</Label>
            <Select value={pessoaId || NONE} onValueChange={(v) => setPessoaId(v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {pessoas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button
              variant="outline"
              onClick={exportIndividualTxt}
              disabled={!pessoaId}
              className="gap-2"
            >
              <Download className="h-4 w-4" /> Resumo individual
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <ComparisonCard label="Total de eventos" cur={summaryCurrent.total} prev={summaryPrev.total} />
        <ComparisonCard label="Positivos" cur={summaryCurrent.pos} prev={summaryPrev.pos} />
        <ComparisonCard label="Negativos" cur={summaryCurrent.neg} prev={summaryPrev.neg} inverted />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Resumo por colaborador</CardTitle>
          <p className="text-xs text-muted-foreground">
            Apenas eventos registrados no período. Dias sem registro e pilares sem nota não contam como zero.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Colaborador</th>
                <th className="px-3 py-2 text-right">Reg.</th>
                <th className="px-3 py-2 text-right">+</th>
                <th className="px-3 py-2 text-right">−</th>
                <th className="px-3 py-2 text-right">Artístico</th>
                <th className="px-3 py-2 text-right">Técnico</th>
                <th className="px-3 py-2 text-right">Comport.</th>
                <th className="px-3 py-2">Confiança</th>
                <th className="px-3 py-2">Tendência</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{r.nome}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.total}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-600">{r.pos}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">{r.neg}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.artistico !== null ? r.artistico.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.tecnico !== null ? r.tecnico.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.comportamento !== null ? r.comportamento.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.confidence}</td>
                  <td className="px-3 py-2 text-xs">{r.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {pessoaId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Resumo individual — {pessoas.find((p) => p.id === pessoaId)?.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {individualAvgs.map((a) => (
              <div key={a.key} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{a.label}</p>
                <p className="font-display text-2xl font-bold" style={{ color: a.color }}>
                  {a.avg !== null ? a.avg.toFixed(1) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">{a.count} registros</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function summarize(rs: PerformanceRecordComPessoa[]) {
  let pos = 0, neg = 0;
  for (const r of rs) {
    const s = sentimentOf(r);
    if (s === "positivo") pos++;
    else if (s === "negativo") neg++;
  }
  return { total: rs.length, pos, neg };
}

function ComparisonCard({
  label,
  cur,
  prev,
  inverted = false,
}: {
  label: string;
  cur: number;
  prev: number;
  inverted?: boolean;
}) {
  const delta = cur - prev;
  const positive = inverted ? delta < 0 : delta > 0;
  const negative = inverted ? delta > 0 : delta < 0;
  const chip = positive
    ? "text-emerald-600"
    : negative
      ? "text-red-600"
      : "text-muted-foreground";
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold">{cur}</span>
          <span className={`text-xs ${chip}`}>
            {arrow} {Math.abs(delta)} vs. período anterior ({prev})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------- Record dialog -------------------- */

function RecordDialog({
  open,
  onOpenChange,
  pessoas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pessoas: { id: string; nome: string }[];
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [pessoaId, setPessoaId] = useState<string>("");
  const [data, setData] = useState(today);
  const [tipo, setTipo] = useState<PerformanceType>("performance");
  const [impact, setImpact] = useState<PerformanceImpact>("medio");
  const [notas, setNotas] = useState<Record<PillarKey, string>>({
    nota_artistico: "",
    nota_tecnico: "",
    nota_comportamento: "",
  });
  const [tag, setTag] = useState<string>("");
  const [obs, setObs] = useState("");

  const reset = () => {
    setPessoaId("");
    setData(today);
    setTipo("performance");
    setImpact("medio");
    setNotas({ nota_artistico: "", nota_tecnico: "", nota_comportamento: "" });
    setTag("");
    setObs("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!pessoaId) throw new Error("Selecione um colaborador.");
      const parseNota = (v: string) => {
        if (!v.trim()) return null;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0 || n > 10)
          throw new Error("Notas devem estar entre 0 e 10.");
        return n;
      };
      const payload = {
        pessoa_id: pessoaId,
        data,
        tipo,
        impact,
        nota_artistico: parseNota(notas.nota_artistico),
        nota_tecnico: parseNota(notas.nota_tecnico),
        nota_comportamento: parseNota(notas.nota_comportamento),
        recognition_tag: tipo === "reconhecimento" ? tag || null : null,
        observacao: obs.trim() || null,
      };
      const { error } = await (
        supabase as unknown as {
          from: (t: string) => {
            insert: (p: unknown) => Promise<{ error: Error | null }>;
          };
        }
      )
        .from("performance_records")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance_records"] });
      toast.success("Registro criado.");
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo registro de performance</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={pessoaId} onValueChange={setPessoaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as PerformanceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="incidente">Incidente</SelectItem>
                  <SelectItem value="reconhecimento">Reconhecimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Impacto</Label>
              <Select value={impact} onValueChange={(v) => setImpact(v as PerformanceImpact)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixo">Baixo (1x)</SelectItem>
                  <SelectItem value="medio">Médio (1.5x)</SelectItem>
                  <SelectItem value="alto">Alto (2x)</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Peso {IMPACT_WEIGHT[impact]}x nas médias.
              </p>
            </div>
          </div>

          {tipo === "reconhecimento" && (
            <div>
              <Label>Tag de reconhecimento</Label>
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {RECOGNITION_TAGS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1 block">
              Notas por pilar (opcional, 0–10 — deixe em branco se não avaliar)
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PILLARS.map((p) => (
                <div key={p.key}>
                  <Label className="text-xs" style={{ color: p.color }}>
                    {p.label}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={notas[p.key]}
                    onChange={(e) =>
                      setNotas((n) => ({ ...n, [p.key]: e.target.value }))
                    }
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Descreva o evento…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- helpers -------------------- */

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildTrend(
  records: {
    data: string;
    nota_artistico: number | null;
    nota_tecnico: number | null;
    nota_comportamento: number | null;
  }[],
) {
  const buckets = new Map<string, Record<PillarKey, { sum: number; count: number }>>();
  for (const r of records) {
    const key = r.data.slice(0, 7);
    let b = buckets.get(key);
    if (!b) {
      b = {
        nota_artistico: { sum: 0, count: 0 },
        nota_tecnico: { sum: 0, count: 0 },
        nota_comportamento: { sum: 0, count: 0 },
      };
      buckets.set(key, b);
    }
    for (const p of PILLARS) {
      const v = r[p.key];
      if (typeof v === "number") {
        b[p.key].sum += v;
        b[p.key].count += 1;
      }
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, b]) => {
      const [y, m] = mes.split("-").map(Number);
      const label = new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      });
      return {
        mes: label,
        nota_artistico: b.nota_artistico.count ? b.nota_artistico.sum / b.nota_artistico.count : null,
        nota_tecnico: b.nota_tecnico.count ? b.nota_tecnico.sum / b.nota_tecnico.count : null,
        nota_comportamento: b.nota_comportamento.count
          ? b.nota_comportamento.sum / b.nota_comportamento.count
          : null,
      };
    });
}

// silence unused imports until wired everywhere
void recordScore;
