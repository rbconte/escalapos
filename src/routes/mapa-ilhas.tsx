import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Gauge,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { KpiCard } from "@/components/gestao/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { ilhasQuery, escalasQuery, pessoasQuery } from "@/lib/queries";
import {
  assignLanes,
  colorForProduto,
  computeHealth,
  computeStatus,
  escalasForPlan,
  findOverlaps,
  hhmmToMinutes,
  ilhaPlanejamentosQuery,
  HEALTH_META,
  STATUS_ALLOC_META,
  type AllocationHealth,
  type AllocationStatus,
  type IlhaPlanejamento,
} from "@/lib/mapa-ilhas";
import { PROGRAMA_CORES, contrastText } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mapa-ilhas")({
  head: () => ({
    meta: [
      { title: "Mapa de Ilhas — Painel de Capacidade Operacional" },
      {
        name: "description",
        content:
          "Painel operacional em tempo real de capacidade das ilhas de produção, sincronizado com Planejamento Macro e Escalas.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(ilhasQuery());
    context.queryClient.ensureQueryData(ilhaPlanejamentosQuery());
    context.queryClient.ensureQueryData(pessoasQuery());
  },
  component: MapaIlhasPage,
});

type Zoom = "Diário" | "Semanal" | "Mensal" | "Personalizado";
const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const ALL = "__all__";

const ROW_HEIGHT = 76;
const LANE_HEIGHT = 32;
const LANE_GAP = 4;
const SIDEBAR_W = 200;
const HOUR_PX = 72; // width per hour in Daily view

type FormState = {
  ilha_id: string;
  produto: string;
  cor: string;
  area: string;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  notas: string;
};

const EMPTY: FormState = {
  ilha_id: "",
  produto: "",
  cor: PROGRAMA_CORES[0],
  area: "",
  data_inicio: ISO(new Date()),
  data_fim: ISO(new Date()),
  hora_inicio: "08:00",
  hora_fim: "18:00",
  notas: "",
};

function MapaIlhasPage() {
  const qc = useQueryClient();
  const { data: ilhas } = useSuspenseQuery(ilhasQuery());
  const { data: planejamentos } = useSuspenseQuery(ilhaPlanejamentosQuery());
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());

  // Live clock — updates every 60s for indicator + status recomputation
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [zoom, setZoom] = useState<Zoom>("Diário");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [customStart, setCustomStart] = useState(ISO(new Date()));
  const [customEnd, setCustomEnd] = useState(ISO(addDays(new Date(), 14)));

  // Hourly window (only meaningful in Daily view)
  const [hourStart, setHourStart] = useState(6);
  const [hourEnd, setHourEnd] = useState(24);

  const [fProduto, setFProduto] = useState(ALL);
  const [fArea, setFArea] = useState(ALL);
  const [fIlha, setFIlha] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IlhaPlanejamento | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const [selected, setSelected] = useState<IlhaPlanejamento | null>(null);

  const { start, end } = useMemo(
    () => rangeFor(zoom, anchor, customStart, customEnd),
    [zoom, anchor, customStart, customEnd],
  );

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) arr.push(d);
    return arr;
  }, [start, end]);

  const rangeStartISO = ISO(start);
  const rangeEndISO = ISO(end);

  // Fetch escalas for the visible range (single source of truth for "team assigned")
  const escalasQ = useQuery(escalasQuery(rangeStartISO, rangeEndISO));
  const escalas = escalasQ.data ?? [];

  const produtos = useMemo(
    () => Array.from(new Set(planejamentos.map((p) => p.produto))).sort(),
    [planejamentos],
  );
  const areas = useMemo(
    () =>
      Array.from(
        new Set(planejamentos.map((p) => p.area).filter((a): a is string => !!a)),
      ).sort(),
    [planejamentos],
  );

  const filteredIlhas = useMemo(() => {
    if (fIlha === ALL) return ilhas;
    return ilhas.filter((i) => i.id === fIlha);
  }, [ilhas, fIlha]);

  const visiblePlanejamentos = useMemo(() => {
    return planejamentos.filter((p) => {
      if (p.data_fim < rangeStartISO || p.data_inicio > rangeEndISO) return false;
      if (fProduto !== ALL && p.produto !== fProduto) return false;
      if (fArea !== ALL && (p.area ?? "") !== fArea) return false;
      if (fIlha !== ALL && p.ilha_id !== fIlha) return false;
      return true;
    });
  }, [planejamentos, rangeStartISO, rangeEndISO, fProduto, fArea, fIlha]);

  const overlapIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of visiblePlanejamentos) {
      if (findOverlaps(visiblePlanejamentos, p).length > 0) s.add(p.id);
    }
    return s;
  }, [visiblePlanejamentos]);

  const byIlha = useMemo(() => {
    const m = new Map<string, IlhaPlanejamento[]>();
    for (const p of visiblePlanejamentos) {
      const arr = m.get(p.ilha_id) ?? [];
      arr.push(p);
      m.set(p.ilha_id, arr);
    }
    return m;
  }, [visiblePlanejamentos]);

  // KPIs
  const kpis = useMemo(() => {
    const ilhasIds = new Set(filteredIlhas.map((i) => i.id));
    const occupied = new Set<string>();
    let running = 0;
    let planned = 0;
    let idleHours = 0;
    for (const p of visiblePlanejamentos) {
      if (!ilhasIds.has(p.ilha_id)) continue;
      occupied.add(p.ilha_id);
      const status = computeStatus(p, escalas, overlapIds.has(p.id), now);
      if (status === "Em Execução") running += 1;
      if (status === "Planejado") planned += 1;
    }
    // idle hours: for each island × day in window, subtract occupied hours from operating window
    const windowMin = (hourEnd - hourStart) * 60;
    for (const ilha of filteredIlhas) {
      for (const d of days) {
        const iso = ISO(d);
        const plans = visiblePlanejamentos.filter(
          (p) => p.ilha_id === ilha.id && p.data_inicio <= iso && p.data_fim >= iso,
        );
        if (plans.length === 0) {
          idleHours += windowMin / 60;
          continue;
        }
        // sum unique occupied minutes within the window
        const segs = plans
          .map((p) => [
            Math.max(hhmmToMinutes(p.hora_inicio), hourStart * 60),
            Math.min(hhmmToMinutes(p.hora_fim), hourEnd * 60),
          ])
          .filter(([a, b]) => b > a)
          .sort((a, b) => a[0] - b[0]);
        let occ = 0;
        let cursor = -1;
        let curEnd = -1;
        for (const [a, b] of segs) {
          if (a > curEnd) {
            occ += curEnd - cursor > 0 ? 0 : 0;
            if (curEnd > cursor) occ += curEnd - cursor;
            cursor = a;
            curEnd = b;
          } else if (b > curEnd) curEnd = b;
        }
        if (curEnd > cursor) occ += curEnd - cursor;
        idleHours += Math.max(0, (windowMin - occ) / 60);
      }
    }
    const total = filteredIlhas.length;
    const rate = total > 0 ? Math.round((occupied.size / total) * 100) : 0;
    return {
      occupied: occupied.size,
      available: Math.max(0, total - occupied.size),
      rate,
      conflicts: overlapIds.size,
      idleHours: Math.round(idleHours),
      planned,
      running,
    };
  }, [visiblePlanejamentos, filteredIlhas, escalas, overlapIds, now, days, hourStart, hourEnd]);

  const openCreate = (ilhaId?: string, dateISO?: string) => {
    setEditing(null);
    setForm({
      ...EMPTY,
      ilha_id: ilhaId ?? ilhas[0]?.id ?? "",
      data_inicio: dateISO ?? ISO(new Date()),
      data_fim: dateISO ?? ISO(new Date()),
      cor: PROGRAMA_CORES[Math.floor(Math.random() * PROGRAMA_CORES.length)],
    });
    setDialogOpen(true);
  };

  const openEdit = (p: IlhaPlanejamento) => {
    setEditing(p);
    setForm({
      ilha_id: p.ilha_id,
      produto: p.produto,
      cor: p.cor ?? colorForProduto(p.produto),
      area: p.area ?? "",
      data_inicio: p.data_inicio,
      data_fim: p.data_fim,
      hora_inicio: p.hora_inicio,
      hora_fim: p.hora_fim,
      notas: p.notas ?? "",
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.ilha_id || !form.produto.trim()) {
        throw new Error("Ilha e Produto são obrigatórios.");
      }
      if (form.data_inicio > form.data_fim) {
        throw new Error("Data final deve ser posterior ou igual à inicial.");
      }
      const payload = {
        ilha_id: form.ilha_id,
        produto: form.produto.trim(),
        cor: form.cor || null,
        area: form.area.trim() || null,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
        notas: form.notas.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("ilha_planejamentos")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ilha_planejamentos").insert(payload);
        if (error) throw error;
      }
      const overlaps = findOverlaps(planejamentos, {
        id: editing?.id,
        ilha_id: payload.ilha_id,
        data_inicio: payload.data_inicio,
        data_fim: payload.data_fim,
        hora_inicio: payload.hora_inicio,
        hora_fim: payload.hora_fim,
      });
      return { overlaps: overlaps.length };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ilha_planejamentos"] });
      setDialogOpen(false);
      if (res.overlaps > 0) {
        toast.warning(
          `Planejamento salvo — sobreposição detectada com ${res.overlaps} outro(s) bloco(s).`,
        );
      } else {
        toast.success("Planejamento salvo.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ilha_planejamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ilha_planejamentos"] });
      setDialogOpen(false);
      setSelected(null);
      toast.success("Planejamento removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rangeLabel = useMemo(() => {
    if (zoom === "Diário") return format(anchor, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (zoom === "Mensal") return format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
    return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
  }, [zoom, anchor, start, end]);

  const shift = (dir: 1 | -1) => {
    if (zoom === "Personalizado") return;
    if (zoom === "Diário") setAnchor(addDays(anchor, dir));
    else if (zoom === "Semanal") setAnchor(addWeeks(anchor, dir));
    else setAnchor(addMonths(anchor, dir));
  };

  return (
    <PageShell
      title="Mapa de Ilhas"
      description="Painel operacional de capacidade — sincronizado com Planejamento Macro e Escalas."
      icon={<MapIcon className="h-5 w-5" />}
      actions={
        <Button onClick={() => openCreate()} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Novo Planejamento
        </Button>
      }
    >
      {/* KPI dashboard */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Ilhas Ocupadas" value={kpis.occupied} icon={<Activity className="h-4 w-4" />} tone="primary" />
        <KpiCard label="Ilhas Disponíveis" value={kpis.available} icon={<Gauge className="h-4 w-4" />} tone="success" />
        <KpiCard label="Taxa de Ocupação" value={`${kpis.rate}%`} icon={<Gauge className="h-4 w-4" />} tone="info" />
        <KpiCard label="Conflitos Ativos" value={kpis.conflicts} icon={<AlertTriangle className="h-4 w-4" />} tone={kpis.conflicts > 0 ? "danger" : "default"} />
        <KpiCard label="Horas Ociosas" value={`${kpis.idleHours}h`} icon={<Clock className="h-4 w-4" />} tone="warning" />
        <KpiCard label="Eventos Planejados" value={kpis.planned} icon={<CalendarCheck className="h-4 w-4" />} tone="default" />
        <KpiCard label="Em Execução" value={kpis.running} icon={<Zap className="h-4 w-4" />} tone={kpis.running > 0 ? "primary" : "default"} />
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={zoom} onValueChange={(v) => setZoom(v as Zoom)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Diário">Diário (por hora)</SelectItem>
            <SelectItem value="Semanal">Semanal</SelectItem>
            <SelectItem value="Mensal">Mensal</SelectItem>
            <SelectItem value="Personalizado">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {zoom !== "Personalizado" ? (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[220px] text-center text-sm font-medium capitalize">
              {rangeLabel}
            </div>
            <Button size="icon" variant="outline" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>
              Hoje
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[160px]" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[160px]" />
          </div>
        )}

        {zoom === "Diário" && (
          <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Janela</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={hourStart}
              onChange={(e) => setHourStart(Math.max(0, Math.min(23, Number(e.target.value))))}
              className="h-7 w-14"
            />
            <span>–</span>
            <Input
              type="number"
              min={1}
              max={24}
              value={hourEnd}
              onChange={(e) => setHourEnd(Math.max(1, Math.min(24, Number(e.target.value))))}
              className="h-7 w-14"
            />
            <span className="text-muted-foreground">h</span>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={fProduto} onValueChange={setFProduto}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os produtos</SelectItem>
              {produtos.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={fArea} onValueChange={setFArea}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as áreas</SelectItem>
              {areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={fIlha} onValueChange={setFIlha}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Ilha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as ilhas</SelectItem>
              {ilhas.map((i) => (<SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Status:</span>
        {(Object.keys(STATUS_ALLOC_META) as AllocationStatus[]).map((s) => (
          <Badge key={s} variant="outline" className={cn("gap-1 border", STATUS_ALLOC_META[s].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_ALLOC_META[s].dot)} />
            {s}
          </Badge>
        ))}
        <span className="ml-2 text-muted-foreground">Saúde:</span>
        {(Object.keys(HEALTH_META) as AllocationHealth[]).map((h) => (
          <Badge key={h} variant="outline" className={cn("gap-1 border", HEALTH_META[h].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_META[h].dot)} />
            {h}
          </Badge>
        ))}
      </div>

      {/* Timeline */}
      <TooltipProvider delayDuration={200}>
        {zoom === "Diário" ? (
          <HourlyBoard
            ilhas={filteredIlhas}
            byIlha={byIlha}
            escalas={escalas}
            overlapIds={overlapIds}
            day={anchor}
            hourStart={hourStart}
            hourEnd={hourEnd}
            now={now}
            onSelect={setSelected}
            onCreate={openCreate}
          />
        ) : (
          <DayBoard
            ilhas={filteredIlhas}
            byIlha={byIlha}
            escalas={escalas}
            overlapIds={overlapIds}
            days={days}
            now={now}
            onSelect={setSelected}
            onExpandDay={(d) => {
              setAnchor(d);
              setZoom("Diário");
            }}
            onCreate={openCreate}
          />
        )}
      </TooltipProvider>

      {/* Detail side panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selected && (
            <PlanDetail
              plan={selected}
              escalas={escalas}
              pessoasCount={pessoas.length}
              hasConflict={overlapIds.has(selected.id)}
              now={now}
              onEdit={() => {
                setSelected(null);
                openEdit(selected);
              }}
              onDelete={() => del.mutate(selected.id)}
              ilhaName={ilhas.find((i) => i.id === selected.ilha_id)?.nome ?? "—"}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create / Edit dialog (preserved) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Planejamento" : "Novo Planejamento"}</DialogTitle>
            <DialogDescription>
              Bloqueio de capacidade — flui automaticamente para o Mapa como alocação Planejada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Ilha *</Label>
              <Select value={form.ilha_id} onValueChange={(v) => setForm({ ...form, ilha_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a ilha" /></SelectTrigger>
                <SelectContent>
                  {ilhas.map((i) => (<SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Produto *</Label>
              <Input value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} placeholder="Ex.: Premium Wedding" />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1">
                {PROGRAMA_CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, cor: c })}
                    className="h-7 w-7 rounded border-2"
                    style={{ background: c, borderColor: form.cor === c ? "hsl(var(--foreground))" : "transparent" }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data início *</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim *</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora início</Label>
              <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora fim</Label>
              <Input type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Área</Label>
              <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex.: Jornalismo, Esportes" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notas</Label>
              <Textarea rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button variant="destructive" size="sm" onClick={() => del.mutate(editing.id)} disabled={del.isPending}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            ) : (<span />)}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {editing ? (<><Pencil className="mr-2 h-4 w-4" /> Atualizar</>) : (<><Plus className="mr-2 h-4 w-4" /> Criar</>)}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── Hourly (Daily) board ───────────────────────────────────────────────────

function HourlyBoard({
  ilhas,
  byIlha,
  escalas,
  overlapIds,
  day,
  hourStart,
  hourEnd,
  now,
  onSelect,
  onCreate,
}: {
  ilhas: { id: string; nome: string }[];
  byIlha: Map<string, IlhaPlanejamento[]>;
  escalas: import("@/lib/mapa-ilhas").Escala[];
  overlapIds: Set<string>;
  day: Date;
  hourStart: number;
  hourEnd: number;
  now: Date;
  onSelect: (p: IlhaPlanejamento) => void;
  onCreate: (ilhaId?: string, iso?: string) => void;
}) {
  const dayISO = ISO(day);
  const totalMin = (hourEnd - hourStart) * 60;
  const totalW = (hourEnd - hourStart) * HOUR_PX;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on today
  useEffect(() => {
    if (!isSameDay(day, now)) return;
    const el = scrollRef.current;
    if (!el) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const offset = ((nowMin - hourStart * 60) / totalMin) * totalW;
    el.scrollLeft = Math.max(0, offset - 200);
  }, [day, now, hourStart, hourEnd, totalMin, totalW]);

  const showNowLine = isSameDay(day, now) &&
    now.getHours() * 60 + now.getMinutes() >= hourStart * 60 &&
    now.getHours() * 60 + now.getMinutes() <= hourEnd * 60;
  const nowLeft = showNowLine
    ? ((now.getHours() * 60 + now.getMinutes() - hourStart * 60) / totalMin) * totalW
    : 0;

  const hours = Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i);

  return (
    <div className="rounded-xl border bg-card">
      <div className="overflow-auto scroll-thin" ref={scrollRef}>
        <div style={{ minWidth: SIDEBAR_W + totalW }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b bg-card">
            <div
              className="sticky left-0 z-30 border-r bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W }}
            >
              Ilha
            </div>
            <div className="relative" style={{ width: totalW }}>
              <div className="flex">
                {hours.slice(0, -1).map((h) => (
                  <div key={h} className="border-r py-2 text-center text-[11px] text-muted-foreground" style={{ width: HOUR_PX }}>
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          {ilhas.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma ilha cadastrada.</div>
          )}
          {ilhas.map((ilha) => {
            const plans = (byIlha.get(ilha.id) ?? []).filter(
              (p) => p.data_inicio <= dayISO && p.data_fim >= dayISO,
            );
            const segments = plans
              .map((p) => ({
                plan: p,
                start: Math.max(hhmmToMinutes(p.hora_inicio), hourStart * 60),
                end: Math.min(hhmmToMinutes(p.hora_fim), hourEnd * 60),
              }))
              .filter((s) => s.end > s.start)
              .sort((a, b) => a.start - b.start);
            const lanes = assignLanes(segments);
            const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
            const rowH = Math.max(ROW_HEIGHT, laneCount * (LANE_HEIGHT + LANE_GAP) + 12);

            return (
              <div key={ilha.id} className="relative flex border-b last:border-b-0" style={{ minHeight: rowH }}>
                <div
                  className="sticky left-0 z-10 flex items-center justify-between border-r bg-card px-3"
                  style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{ilha.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {plans.length === 0 ? "Ociosa" : `${plans.length} alocação(ões)`}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onCreate(ilha.id, dayISO)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div
                  className="relative flex-1"
                  style={{ minHeight: rowH, width: totalW }}
                  onDoubleClick={() => onCreate(ilha.id, dayISO)}
                >
                  {/* Hour grid lines */}
                  <div className="pointer-events-none absolute inset-0 flex">
                    {hours.slice(0, -1).map((h) => (
                      <div key={h} className="border-r border-dashed border-border/40" style={{ width: HOUR_PX }} />
                    ))}
                  </div>
                  {/* Idle base (subtle) */}
                  {plans.length === 0 && (
                    <div className="pointer-events-none absolute inset-2 rounded-md border border-dashed border-emerald-500/25 bg-emerald-500/[0.04] text-[11px] font-medium text-emerald-700/70 flex items-center justify-center">
                      Capacidade disponível
                    </div>
                  )}
                  {/* Bars */}
                  {segments.map((seg, i) => {
                    const p = seg.plan;
                    const left = ((seg.start - hourStart * 60) / totalMin) * totalW;
                    const width = ((seg.end - seg.start) / totalMin) * totalW;
                    const lane = lanes[i];
                    const conflict = overlapIds.has(p.id);
                    const status = computeStatus(p, escalas, conflict, now);
                    const health = computeHealth(p, escalas, conflict);
                    return (
                      <Bar
                        key={p.id}
                        plan={p}
                        left={left}
                        width={width}
                        top={6 + lane * (LANE_HEIGHT + LANE_GAP)}
                        height={LANE_HEIGHT}
                        status={status}
                        health={health}
                        conflict={conflict}
                        onClick={() => onSelect(p)}
                        variant="hourly"
                      />
                    );
                  })}
                  {/* Current time indicator */}
                  {showNowLine && (
                    <div className="pointer-events-none absolute top-0 bottom-0 z-10" style={{ left: nowLeft }}>
                      <div className="h-full w-px bg-red-500/80" />
                      <div className="absolute -top-1 -translate-x-1/2 rounded-sm bg-red-500 px-1 text-[10px] font-semibold text-white">
                        {format(now, "HH:mm")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Day-based board (Weekly / Monthly / Custom) ────────────────────────────

function DayBoard({
  ilhas,
  byIlha,
  escalas,
  overlapIds,
  days,
  now,
  onSelect,
  onExpandDay,
  onCreate,
}: {
  ilhas: { id: string; nome: string }[];
  byIlha: Map<string, IlhaPlanejamento[]>;
  escalas: import("@/lib/mapa-ilhas").Escala[];
  overlapIds: Set<string>;
  days: Date[];
  now: Date;
  onSelect: (p: IlhaPlanejamento) => void;
  onExpandDay: (d: Date) => void;
  onCreate: (ilhaId?: string, iso?: string) => void;
}) {
  const totalDays = days.length;
  const colWidth = totalDays <= 10 ? 120 : totalDays <= 20 ? 84 : totalDays <= 45 ? 48 : 30;

  const startD = days[0];
  const endD = days[days.length - 1];

  return (
    <div className="rounded-xl border bg-card">
      <div className="overflow-auto scroll-thin">
        <div style={{ minWidth: SIDEBAR_W + colWidth * totalDays }}>
          <div className="sticky top-0 z-20 flex border-b bg-card">
            <div
              className="sticky left-0 z-30 border-r bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W }}
            >
              Ilha
            </div>
            {days.map((d) => {
              const isToday = isSameDay(d, now);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => onExpandDay(d)}
                  className={cn(
                    "flex flex-col items-center justify-center border-r py-2 text-xs transition hover:bg-muted",
                    isToday && "bg-primary/5 text-primary",
                  )}
                  style={{ width: colWidth, minWidth: colWidth }}
                  title="Expandir para visão horária"
                >
                  <span className="text-muted-foreground">{format(d, "EEE", { locale: ptBR })}</span>
                  <span className={cn("font-semibold", isToday && "text-primary")}>{format(d, "dd/MM")}</span>
                </button>
              );
            })}
          </div>

          {ilhas.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma ilha cadastrada.</div>
          )}
          {ilhas.map((ilha) => {
            const plans = (byIlha.get(ilha.id) ?? []).slice().sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
            const segments = plans.map((p) => {
              const s = parseISO(p.data_inicio) < startD ? startD : parseISO(p.data_inicio);
              const e = parseISO(p.data_fim) > endD ? endD : parseISO(p.data_fim);
              return {
                plan: p,
                start: differenceInCalendarDays(s, startD),
                end: differenceInCalendarDays(e, startD) + 1,
              };
            });
            const lanes = assignLanes(segments);
            const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
            const rowH = Math.max(ROW_HEIGHT, laneCount * (LANE_HEIGHT + LANE_GAP) + 12);

            return (
              <div key={ilha.id} className="relative flex border-b last:border-b-0" style={{ minHeight: rowH }}>
                <div
                  className="sticky left-0 z-10 flex items-center justify-between border-r bg-card px-3"
                  style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{ilha.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {plans.length === 0 ? "Ociosa no período" : `${plans.length} alocação(ões)`}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onCreate(ilha.id, ISO(startD))}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="relative flex-1" style={{ minHeight: rowH, width: colWidth * totalDays }}>
                  <div className="pointer-events-none absolute inset-0 flex">
                    {days.map((d) => (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "border-r border-dashed border-border/40",
                          isSameDay(d, now) && "bg-primary/[0.04]",
                        )}
                        style={{ width: colWidth }}
                      />
                    ))}
                  </div>
                  {segments.map((seg, i) => {
                    const p = seg.plan;
                    const left = seg.start * colWidth + 2;
                    const width = (seg.end - seg.start) * colWidth - 4;
                    const lane = lanes[i];
                    const conflict = overlapIds.has(p.id);
                    const status = computeStatus(p, escalas, conflict, now);
                    const health = computeHealth(p, escalas, conflict);
                    return (
                      <Bar
                        key={p.id}
                        plan={p}
                        left={left}
                        width={width}
                        top={6 + lane * (LANE_HEIGHT + LANE_GAP)}
                        height={LANE_HEIGHT}
                        status={status}
                        health={health}
                        conflict={conflict}
                        onClick={() => onSelect(p)}
                        variant="day"
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Bar ────────────────────────────────────────────────────────────────────

function Bar({
  plan,
  left,
  width,
  top,
  height,
  status,
  health,
  conflict,
  onClick,
  variant,
}: {
  plan: IlhaPlanejamento;
  left: number;
  width: number;
  top: number;
  height: number;
  status: AllocationStatus;
  health: AllocationHealth;
  conflict: boolean;
  onClick: () => void;
  variant: "hourly" | "day";
}) {
  const color = colorForProduto(plan.produto, plan.cor);
  const fg = contrastText(color);
  const days = differenceInCalendarDays(parseISO(plan.data_fim), parseISO(plan.data_inicio)) + 1;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "absolute overflow-hidden rounded-md border-l-4 px-2 text-left text-[11px] font-medium shadow-sm transition hover:brightness-110 hover:shadow-md",
            status === "Em Execução" && "ring-2 ring-amber-400 ring-offset-1",
            conflict && "outline outline-2 outline-red-500/70",
          )}
          style={{
            left,
            width: Math.max(width, 8),
            top,
            height,
            background: color,
            borderLeftColor: fg === "#ffffff" ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.3)",
            color: fg,
          }}
        >
          <div className="flex items-center gap-1 truncate">
            {conflict && <AlertTriangle className="h-3 w-3 shrink-0" />}
            <span className="truncate font-semibold">{plan.produto}</span>
          </div>
          {width > 90 && (
            <div className="truncate opacity-85">
              {plan.hora_inicio.slice(0, 5)}–{plan.hora_fim.slice(0, 5)}
              {variant === "day" && days > 1 && ` · ${days}d`}
            </div>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <div className="font-semibold">{plan.produto}</div>
        <div>
          {format(parseISO(plan.data_inicio), "dd MMM", { locale: ptBR })} →{" "}
          {format(parseISO(plan.data_fim), "dd MMM yyyy", { locale: ptBR })}
        </div>
        <div>{plan.hora_inicio.slice(0, 5)} → {plan.hora_fim.slice(0, 5)}</div>
        <div>{days} dia{days > 1 ? "s" : ""}</div>
        {plan.area && <div>Área: {plan.area}</div>}
        <div className="mt-1 flex gap-1">
          <Badge variant="outline" className={cn("gap-1 border", STATUS_ALLOC_META[status].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_ALLOC_META[status].dot)} />
            {status}
          </Badge>
          <Badge variant="outline" className={cn("gap-1 border", HEALTH_META[health].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_META[health].dot)} />
            {health}
          </Badge>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Detail side panel ──────────────────────────────────────────────────────

function PlanDetail({
  plan,
  escalas,
  hasConflict,
  now,
  onEdit,
  onDelete,
  ilhaName,
}: {
  plan: IlhaPlanejamento;
  escalas: import("@/lib/mapa-ilhas").Escala[];
  pessoasCount: number;
  hasConflict: boolean;
  now: Date;
  onEdit: () => void;
  onDelete: () => void;
  ilhaName: string;
}) {
  const color = colorForProduto(plan.produto, plan.cor);
  const status = computeStatus(plan, escalas, hasConflict, now);
  const health = computeHealth(plan, escalas, hasConflict);
  const team = escalasForPlan(plan, escalas);
  const days = differenceInCalendarDays(parseISO(plan.data_fim), parseISO(plan.data_inicio)) + 1;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 rounded" style={{ background: color }} />
          <div className="min-w-0">
            <SheetTitle className="truncate">{plan.produto}</SheetTitle>
            <SheetDescription className="text-xs">{ilhaName}</SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <div className="mt-4 space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("gap-1 border", STATUS_ALLOC_META[status].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_ALLOC_META[status].dot)} />
            {status}
          </Badge>
          <Badge variant="outline" className={cn("gap-1 border", HEALTH_META[health].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_META[health].dot)} />
            {health}
          </Badge>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Início</div>
              <div className="font-semibold">{format(parseISO(plan.data_inicio), "dd MMM yyyy", { locale: ptBR })}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fim</div>
              <div className="font-semibold">{format(parseISO(plan.data_fim), "dd MMM yyyy", { locale: ptBR })}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Horário</div>
              <div className="font-semibold">{plan.hora_inicio.slice(0, 5)} – {plan.hora_fim.slice(0, 5)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Duração</div>
              <div className="font-semibold">{days} dia{days > 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>

        {plan.area && (
          <div className="text-xs">
            <div className="text-muted-foreground">Área</div>
            <div className="font-medium">{plan.area}</div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Equipe escalada
          </div>
          {team.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Nenhuma pessoa escalada para esta ilha no período. Alocação aparecerá como <b>Planejada</b> até a escala ser criada.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {team.length} registro(s) de escala vinculado(s) a esta ilha no período.
            </div>
          )}
        </div>

        {hasConflict && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700">
            <div className="mb-1 flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> Conflito operacional
            </div>
            Este bloco sobrepõe outro planejamento na mesma ilha e horário.
          </div>
        )}

        {plan.notas && (
          <div className="text-xs">
            <div className="text-muted-foreground">Notas</div>
            <div className="whitespace-pre-wrap rounded-md border bg-muted/20 p-2">{plan.notas}</div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={onEdit} className="flex-1">
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

// ── util ───────────────────────────────────────────────────────────────────

function rangeFor(zoom: Zoom, anchor: Date, customStart: string, customEnd: string) {
  if (zoom === "Diário") return { start: anchor, end: anchor };
  if (zoom === "Semanal")
    return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) };
  if (zoom === "Mensal") return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  return { start: parseISO(customStart), end: parseISO(customEnd) };
}

export default MapaIlhasPage;
