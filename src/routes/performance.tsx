import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Award,
  BarChart3,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { pessoasQuery } from "@/lib/queries";
import {
  averageByPillar,
  performanceRecordsQuery,
  PILLARS,
  RECOGNITION_TAGS,
  TIPO_META,
  sentimentOf,
  type PerformanceRecordComPessoa,
  type PerformanceType,
  type PillarKey,
} from "@/lib/performance";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — Escala Operacional" },
      {
        name: "description",
        content:
          "Registro contínuo de desempenho e reconhecimento da equipe.",
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
      description="Log contínuo de desempenho, incidentes e reconhecimentos."
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
  const avgs = useMemo(() => averageByPillar(records), [records]);

  const distribution = useMemo(() => {
    let pos = 0,
      neu = 0,
      neg = 0;
    for (const r of records) {
      const s = sentimentOf(r);
      if (s === "positivo") pos++;
      else if (s === "negativo") neg++;
      else neu++;
    }
    return { pos, neu, neg };
  }, [records]);

  const trend = useMemo(() => buildTrend(records), [records]);

  const perPersonAvg = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; sum: number; count: number }
    >();
    for (const r of records) {
      const vals = PILLARS.map((p) => r[p.key]).filter(
        (v): v is number => typeof v === "number",
      );
      if (!vals.length) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const nome = r.pessoa?.nome ?? "—";
      const cur = map.get(r.pessoa_id) ?? { nome, sum: 0, count: 0 };
      cur.sum += avg;
      cur.count += 1;
      map.set(r.pessoa_id, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, nome: v.nome, avg: v.sum / v.count, count: v.count }))
      .sort((a, b) => b.avg - a.avg);
  }, [records]);

  const top = perPersonAvg.slice(0, 5);

  const semRegistros = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const withRecent = new Set(
      records
        .filter((r) => new Date(r.data).getTime() >= cutoff)
        .map((r) => r.pessoa_id),
    );
    return pessoas.filter((p) => !withRecent.has(p.id));
  }, [records, pessoas]);

  const recent = records.slice(0, 8);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {avgs.map((a) => (
          <Card key={a.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
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
                <span className="text-xs text-muted-foreground">
                  / 10 · {a.count} {a.count === 1 ? "registro" : "registros"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <CardTitle className="text-sm">Distribuição de eventos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DistRow
              label="Positivos"
              value={distribution.pos}
              total={records.length}
              color="bg-success"
            />
            <DistRow
              label="Neutros"
              value={distribution.neu}
              total={records.length}
              color="bg-muted-foreground"
            />
            <DistRow
              label="Negativos"
              value={distribution.neg}
              total={records.length}
              color="bg-destructive"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top performers</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <EmptyMini text="Nenhum registro com notas ainda." />
            ) : (
              <ul className="space-y-2">
                {top.map((p, i) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      {p.nome}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.avg.toFixed(1)} · {p.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Sem registros nos últimos 30 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            {semRegistros.length === 0 ? (
              <EmptyMini text="Todos os colaboradores foram observados." />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {semRegistros.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {p.nome}
                  </li>
                ))}
                {semRegistros.length > 8 && (
                  <li className="pt-1 text-xs text-muted-foreground">
                    +{semRegistros.length - 8} outros
                  </li>
                )}
              </ul>
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
                    <Badge
                      variant="outline"
                      className={TIPO_META[r.tipo].chip + " shrink-0"}
                    >
                      {TIPO_META[r.tipo].label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {r.pessoa?.nome ?? "—"}
                      </p>
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
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.observacao}
                    </p>
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
    () =>
      [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [pessoas],
  );

  const personRecords = useMemo(
    () => records.filter((r) => r.pessoa_id === selectedId),
    [records, selectedId],
  );

  const avgs = useMemo(() => averageByPillar(personRecords), [personRecords]);
  const trend = useMemo(() => buildTrend(personRecords), [personRecords]);

  const sentiment = useMemo(() => {
    let pos = 0,
      neu = 0,
      neg = 0;
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
                <CardTitle>{selected.nome}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {personRecords.length} registro
                  {personRecords.length === 1 ? "" : "s"} ·{" "}
                  <span className="text-success">{sentiment.pos} positivos</span>
                  {" · "}
                  <span>{sentiment.neu} neutros</span>
                  {" · "}
                  <span className="text-destructive">
                    {sentiment.neg} negativos
                  </span>
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {avgs.map((a) => (
                  <div key={a.key} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{a.label}</p>
                    <p
                      className="font-display text-2xl font-bold"
                      style={{ color: a.color }}
                    >
                      {a.avg !== null ? a.avg.toFixed(1) : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.count} registros
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

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
                        <Badge
                          variant="outline"
                          className={TIPO_META[r.tipo].chip}
                        >
                          {TIPO_META[r.tipo].label}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(r.data)}
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

function RecognitionTab({
  records,
}: {
  records: PerformanceRecordComPessoa[];
}) {
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
                  <span className="font-mono text-xs text-muted-foreground">
                    {count}
                  </span>
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
                <li
                  key={r.id}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-600" />
                    <p className="font-medium">{r.pessoa?.nome ?? "—"}</p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {r.recognition_tag ?? "Reconhecimento"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(r.data)}
                  </p>
                  {r.observacao && (
                    <p className="mt-1 text-sm">{r.observacao}</p>
                  )}
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
  const rows = useMemo(() => {
    return pessoas
      .map((p) => {
        const rs = records.filter((r) => r.pessoa_id === p.id);
        const avgs = averageByPillar(rs);
        let pos = 0,
          neg = 0;
        for (const r of rs) {
          const s = sentimentOf(r);
          if (s === "positivo") pos++;
          else if (s === "negativo") neg++;
        }
        return {
          id: p.id,
          nome: p.nome,
          total: rs.length,
          pos,
          neg,
          artistico: avgs[0].avg,
          tecnico: avgs[1].avg,
          comportamento: avgs[2].avg,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [records, pessoas]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Consolidado por colaborador
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Apenas eventos registrados são considerados. Dias sem registro não
          contam como zero.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Colaborador</th>
              <th className="px-3 py-2 text-right">Registros</th>
              <th className="px-3 py-2 text-right">Positivos</th>
              <th className="px-3 py-2 text-right">Negativos</th>
              <th className="px-3 py-2 text-right">Artístico</th>
              <th className="px-3 py-2 text-right">Técnico</th>
              <th className="px-3 py-2 text-right">Comportamento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">{r.nome}</td>
                <td className="px-3 py-2 text-right font-mono">{r.total}</td>
                <td className="px-3 py-2 text-right font-mono text-success">
                  {r.pos}
                </td>
                <td className="px-3 py-2 text-right font-mono text-destructive">
                  {r.neg}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.artistico !== null ? r.artistico.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.tecnico !== null ? r.tecnico.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.comportamento !== null
                    ? r.comportamento.toFixed(1)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        nota_artistico: parseNota(notas.nota_artistico),
        nota_tecnico: parseNota(notas.nota_tecnico),
        nota_comportamento: parseNota(notas.nota_comportamento),
        recognition_tag: tipo === "reconhecimento" ? tag || null : null,
        observacao: obs.trim() || null,
      };
      const { error } = await supabase
        .from("performance_records" as never)
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

          <div>
            <Label>Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as PerformanceType)}
            >
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

          {tipo === "reconhecimento" && (
            <div>
              <Label>Tag de reconhecimento</Label>
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {RECOGNITION_TAGS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1 block">Notas por pilar (opcional, 0–10)</Label>
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

function buildTrend(records: { data: string; nota_artistico: number | null; nota_tecnico: number | null; nota_comportamento: number | null }[]) {
  const buckets = new Map<
    string,
    Record<PillarKey, { sum: number; count: number }>
  >();
  for (const r of records) {
    const key = r.data.slice(0, 7); // YYYY-MM
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
        nota_artistico: b.nota_artistico.count
          ? b.nota_artistico.sum / b.nota_artistico.count
          : null,
        nota_tecnico: b.nota_tecnico.count
          ? b.nota_tecnico.sum / b.nota_tecnico.count
          : null,
        nota_comportamento: b.nota_comportamento.count
          ? b.nota_comportamento.sum / b.nota_comportamento.count
          : null,
      };
    });
}
