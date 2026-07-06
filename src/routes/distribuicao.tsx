import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ClipboardList,
  Filter,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ilhasQuery, pessoasQuery, programasQuery } from "@/lib/queries";
import {
  ilhaPlanejamentosQuery,
  planForDate,
  type IlhaPlanejamento,
} from "@/lib/mapa-ilhas";
import {
  STATUS_DISTRIBUICAO,
  STATUS_DIST_META,
  detectConflicts,
  distribuicaoQuery,
  type DistribuicaoTrabalho,
  type StatusDistribuicao,
} from "@/lib/distribuicao";

export const Route = createFileRoute("/distribuicao")({
  head: () => ({
    meta: [
      { title: "Distribuição de Trabalho — Operações Diárias" },
      {
        name: "description",
        content:
          "Gestão diária de atribuições operacionais de trabalho por ilha e profissional.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(ilhasQuery());
    context.queryClient.ensureQueryData(pessoasQuery());
    context.queryClient.ensureQueryData(programasQuery());
    context.queryClient.ensureQueryData(ilhaPlanejamentosQuery());
    context.queryClient.ensureQueryData(distribuicaoQuery());
  },
  component: DistribuicaoPage,
});

const ALL = "__all__";
const NONE = "__none__";
const ISO = (d: Date) => format(d, "yyyy-MM-dd");

type FormState = {
  data: string;
  ilha_id: string;
  produto: string;
  programa_id: string;
  retranca: string;
  parceiro_conteudo: string;
  pessoa_id: string;
  hora_inicio: string;
  hora_fim: string;
  status: StatusDistribuicao;
  notas: string;
};

const emptyForm = (): FormState => ({
  data: ISO(new Date()),
  ilha_id: "",
  produto: "",
  programa_id: NONE,
  retranca: "",
  parceiro_conteudo: "",
  pessoa_id: NONE,
  hora_inicio: "08:00",
  hora_fim: "18:00",
  status: "Planejado",
  notas: "",
});

function DistribuicaoPage() {
  const qc = useQueryClient();
  const { data: ilhas } = useSuspenseQuery(ilhasQuery());
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: programas } = useSuspenseQuery(programasQuery());
  const { data: planejamentos } = useSuspenseQuery(ilhaPlanejamentosQuery());
  const { data: rows } = useSuspenseQuery(distribuicaoQuery());

  const [dateFilter, setDateFilter] = useState<string>(ISO(new Date()));
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState(ALL);
  const [fIlha, setFIlha] = useState(ALL);
  const [fPrograma, setFPrograma] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DistribuicaoTrabalho | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const ilhaById = useMemo(
    () => new Map(ilhas.map((i) => [i.id, i.nome] as const)),
    [ilhas],
  );
  const pessoaById = useMemo(
    () => new Map(pessoas.map((p) => [p.id, p.nome] as const)),
    [pessoas],
  );
  const programaById = useMemo(
    () => new Map(programas.map((p) => [p.id, p.nome] as const)),
    [programas],
  );

  const forDate = useMemo(
    () => rows.filter((r) => r.data === dateFilter),
    [rows, dateFilter],
  );

  const conflicts = useMemo(() => detectConflicts(forDate), [forDate]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return forDate.filter((r) => {
      if (fStatus !== ALL && r.status !== fStatus) return false;
      if (fIlha !== ALL && r.ilha_id !== fIlha) return false;
      if (fPrograma !== ALL && (r.programa_id ?? "") !== fPrograma) return false;
      if (!term) return true;
      const hay = [
        r.produto,
        r.retranca,
        r.parceiro_conteudo,
        r.notas,
        ilhaById.get(r.ilha_id),
        r.pessoa_id ? pessoaById.get(r.pessoa_id) : "",
        r.programa_id ? programaById.get(r.programa_id) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [forDate, fStatus, fIlha, fPrograma, q, ilhaById, pessoaById, programaById]);

  // KPIs
  const kpi = useMemo(() => {
    const ativas = forDate.filter((r) => r.status !== "Cancelado").length;
    const ocupadas = new Set(
      forDate.filter((r) => r.status !== "Cancelado").map((r) => r.ilha_id),
    );
    const disponiveis = Math.max(0, ilhas.length - ocupadas.size);
    const ativosProf = new Set(
      forDate.filter((r) => r.pessoa_id && r.status !== "Cancelado").map((r) => r.pessoa_id),
    ).size;
    const emAndamento = forDate.filter((r) => r.status === "Em Andamento").length;
    return {
      ativas,
      ocupadas: ocupadas.size,
      disponiveis,
      ativosProf,
      conflitos: conflicts.ids.size,
      emAndamento,
    };
  }, [forDate, ilhas, conflicts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), data: dateFilter, ilha_id: ilhas[0]?.id ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (r: DistribuicaoTrabalho) => {
    setEditing(r);
    setForm({
      data: r.data,
      ilha_id: r.ilha_id,
      produto: r.produto ?? "",
      programa_id: r.programa_id ?? NONE,
      retranca: r.retranca ?? "",
      parceiro_conteudo: r.parceiro_conteudo ?? "",
      pessoa_id: r.pessoa_id ?? NONE,
      hora_inicio: r.hora_inicio,
      hora_fim: r.hora_fim,
      status: r.status as StatusDistribuicao,
      notas: r.notas ?? "",
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.ilha_id) throw new Error("Ilha é obrigatória.");
      const payload = {
        data: form.data,
        ilha_id: form.ilha_id,
        produto: form.produto.trim() || null,
        programa_id: form.programa_id === NONE ? null : form.programa_id,
        retranca: form.retranca.trim() || null,
        parceiro_conteudo: form.parceiro_conteudo.trim() || null,
        pessoa_id: form.pessoa_id === NONE ? null : form.pessoa_id,
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
        status: form.status,
        notas: form.notas.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("distribuicao_trabalho")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("distribuicao_trabalho").insert(payload);
        if (error) throw error;
      }
      // Warn against planning divergence
      const plans = planForDate(planejamentos, form.ilha_id, form.data);
      const diverge =
        plans.length > 0 &&
        payload.produto &&
        !plans.some((p) => p.produto.toLowerCase() === payload.produto!.toLowerCase());
      return { diverge, hasPlan: plans.length > 0 };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["distribuicao_trabalho"] });
      setDialogOpen(false);
      if (res.diverge) {
        toast.warning(
          "Atribuição salva — produto diverge do planejamento estratégico da ilha.",
        );
      } else {
        toast.success("Atribuição salva.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("distribuicao_trabalho").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["distribuicao_trabalho"] });
      toast.success("Atribuição removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentPlan =
    form.ilha_id && form.data ? planForDate(planejamentos, form.ilha_id, form.data) : [];

  return (
    <PageShell
      title="Distribuição de Trabalho"
      description="Operação diária — atribuições, ilhas e profissionais."
      icon={<ClipboardList className="h-5 w-5" />}
      actions={
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-[160px]"
          />
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Nova Atribuição
          </Button>
        </div>
      }
    >
      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Atribuições Ativas" value={kpi.ativas} />
        <Kpi label="Ilhas Ocupadas" value={kpi.ocupadas} />
        <Kpi label="Ilhas Disponíveis" value={kpi.disponiveis} />
        <Kpi label="Profissionais Ativos" value={kpi.ativosProf} />
        <Kpi
          label="Conflitos Operacionais"
          value={kpi.conflitos}
          tone={kpi.conflitos > 0 ? "warn" : "default"}
        />
        <Kpi label="Em Andamento" value={kpi.emAndamento} tone="info" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar atribuição, retranca, parceiro…"
            className="w-[260px] pl-8"
          />
        </div>
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={fIlha} onValueChange={setFIlha}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ilha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as ilhas</SelectItem>
            {ilhas.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fPrograma} onValueChange={setFPrograma}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Programa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os programas</SelectItem>
            {programas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {STATUS_DISTRIBUICAO.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="tabela">
        <TabsList>
          <TabsTrigger value="tabela">Tabela</TabsTrigger>
          <TabsTrigger value="ilha">Por Ilha</TabsTrigger>
          <TabsTrigger value="profissional">Por Profissional</TabsTrigger>
          <TabsTrigger value="programa">Por Programa</TabsTrigger>
        </TabsList>

        <TabsContent value="tabela" className="mt-4">
          <DistribuicaoTable
            rows={filtered}
            conflictIds={conflicts.ids}
            ilhaById={ilhaById}
            pessoaById={pessoaById}
            programaById={programaById}
            onEdit={openEdit}
            onDelete={(id) => del.mutate(id)}
          />
        </TabsContent>

        <TabsContent value="ilha" className="mt-4">
          <GroupedView
            rows={filtered}
            groupBy={(r) => ilhaById.get(r.ilha_id) ?? "—"}
            conflictIds={conflicts.ids}
            ilhaById={ilhaById}
            pessoaById={pessoaById}
            programaById={programaById}
            onEdit={openEdit}
            onDelete={(id) => del.mutate(id)}
          />
        </TabsContent>

        <TabsContent value="profissional" className="mt-4">
          <GroupedView
            rows={filtered}
            groupBy={(r) => (r.pessoa_id ? pessoaById.get(r.pessoa_id) ?? "—" : "Sem profissional")}
            conflictIds={conflicts.ids}
            ilhaById={ilhaById}
            pessoaById={pessoaById}
            programaById={programaById}
            onEdit={openEdit}
            onDelete={(id) => del.mutate(id)}
          />
        </TabsContent>

        <TabsContent value="programa" className="mt-4">
          <GroupedView
            rows={filtered}
            groupBy={(r) =>
              r.programa_id ? programaById.get(r.programa_id) ?? "—" : "Sem programa"
            }
            conflictIds={conflicts.ids}
            ilhaById={ilhaById}
            pessoaById={pessoaById}
            programaById={programaById}
            onEdit={openEdit}
            onDelete={(id) => del.mutate(id)}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Atribuição" : "Nova Atribuição"}
            </DialogTitle>
            <DialogDescription>
              Distribuição operacional para o dia selecionado.
            </DialogDescription>
          </DialogHeader>

          {currentPlan.length > 0 && (
            <PlanSuggestion
              plans={currentPlan}
              onApply={(p) =>
                setForm((f) => ({
                  ...f,
                  produto: p.produto,
                  hora_inicio: p.hora_inicio,
                  hora_fim: p.hora_fim,
                }))
              }
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ilha *</Label>
              <Select
                value={form.ilha_id}
                onValueChange={(v) => setForm({ ...form, ilha_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ilhas.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <Input
                value={form.produto}
                onChange={(e) => setForm({ ...form, produto: e.target.value })}
                placeholder="Ex.: Jornal da Manhã"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Programa</Label>
              <Select
                value={form.programa_id}
                onValueChange={(v) => setForm({ ...form, programa_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {programas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Retranca</Label>
              <Input
                value={form.retranca}
                onChange={(e) => setForm({ ...form, retranca: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parceiro de Conteúdo</Label>
              <Input
                value={form.parceiro_conteudo}
                onChange={(e) =>
                  setForm({ ...form, parceiro_conteudo: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Profissional Interno</Label>
              <Select
                value={form.pessoa_id}
                onValueChange={(v) => setForm({ ...form, pessoa_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({ ...form, status: v as StatusDistribuicao })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_DISTRIBUICAO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hora início</Label>
              <Input
                type="time"
                value={form.hora_inicio}
                onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hora fim</Label>
              <Input
                type="time"
                value={form.hora_fim}
                onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notas</Label>
              <Textarea
                rows={3}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  del.mutate(editing.id);
                  setDialogOpen(false);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {editing ? "Atualizar" : "Criar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "info";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-600"
      : tone === "info"
        ? "text-blue-600"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 font-display text-2xl font-bold ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function PlanSuggestion({
  plans,
  onApply,
}: {
  plans: IlhaPlanejamento[];
  onApply: (p: IlhaPlanejamento) => void;
}) {
  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
      <div className="mb-1.5 flex items-center gap-1.5 font-medium text-blue-700">
        <Sparkles className="h-4 w-4" /> Planejamento estratégico para esta ilha
      </div>
      <div className="space-y-1.5">
        {plans.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5"
          >
            <span>
              <b>{p.produto}</b> · {p.hora_inicio.slice(0, 5)}–{p.hora_fim.slice(0, 5)}
              {p.area ? ` · ${p.area}` : ""}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onApply(p)}>
              Preencher automaticamente
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

type TableProps = {
  rows: DistribuicaoTrabalho[];
  conflictIds: Set<string>;
  ilhaById: Map<string, string>;
  pessoaById: Map<string, string>;
  programaById: Map<string, string>;
  onEdit: (r: DistribuicaoTrabalho) => void;
  onDelete: (id: string) => void;
};

function DistribuicaoTable({
  rows,
  conflictIds,
  ilhaById,
  pessoaById,
  programaById,
  onEdit,
  onDelete,
}: TableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhuma atribuição para os filtros atuais.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ilha</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Programa</TableHead>
            <TableHead>Retranca</TableHead>
            <TableHead>Parceiro</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead>Horário</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[110px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const meta = STATUS_DIST_META[r.status as StatusDistribuicao];
            const conflict = conflictIds.has(r.id);
            return (
              <TableRow key={r.id} className={conflict ? "bg-amber-500/5" : undefined}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {conflict && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                    {ilhaById.get(r.ilha_id) ?? "—"}
                  </span>
                </TableCell>
                <TableCell>{r.produto ?? "—"}</TableCell>
                <TableCell>
                  {r.programa_id ? programaById.get(r.programa_id) ?? "—" : "—"}
                </TableCell>
                <TableCell>{r.retranca ?? "—"}</TableCell>
                <TableCell>{r.parceiro_conteudo ?? "—"}</TableCell>
                <TableCell>
                  {r.pessoa_id ? pessoaById.get(r.pessoa_id) ?? "—" : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {r.hora_inicio.slice(0, 5)} – {r.hora_fim.slice(0, 5)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={meta?.chip}>
                    <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${meta?.dot}`} />
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(r.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function GroupedView({
  rows,
  groupBy,
  ...rest
}: TableProps & { groupBy: (r: DistribuicaoTrabalho) => string }) {
  const groups = useMemo(() => {
    const m = new Map<string, DistribuicaoTrabalho[]>();
    for (const r of rows) {
      const k = groupBy(r);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, groupBy]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhuma atribuição para os filtros atuais.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([label, groupRows]) => (
        <div key={label}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">{label}</h3>
            <Badge variant="secondary">{groupRows.length}</Badge>
          </div>
          <DistribuicaoTable rows={groupRows} {...rest} />
        </div>
      ))}
    </div>
  );
}

export default DistribuicaoPage;
