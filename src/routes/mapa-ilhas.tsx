import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { ilhasQuery } from "@/lib/queries";
import {
  colorForProduto,
  findOverlaps,
  ilhaPlanejamentosQuery,
  type IlhaPlanejamento,
} from "@/lib/mapa-ilhas";
import { PROGRAMA_CORES, contrastText } from "@/lib/domain";

export const Route = createFileRoute("/mapa-ilhas")({
  head: () => ({
    meta: [
      { title: "Mapa de Ilhas — Planejamento Estratégico" },
      {
        name: "description",
        content:
          "Planejamento de capacidade de longo prazo para as ilhas de produção.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(ilhasQuery());
    context.queryClient.ensureQueryData(ilhaPlanejamentosQuery());
  },
  component: MapaIlhasPage,
});

type Zoom = "Diário" | "Semanal" | "Mensal" | "Personalizado";
const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const ALL = "__all__";

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

  const [zoom, setZoom] = useState<Zoom>("Semanal");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [customStart, setCustomStart] = useState(ISO(new Date()));
  const [customEnd, setCustomEnd] = useState(ISO(addDays(new Date(), 14)));

  const [fProduto, setFProduto] = useState(ALL);
  const [fArea, setFArea] = useState(ALL);
  const [fIlha, setFIlha] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IlhaPlanejamento | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { start, end } = useMemo(() => rangeFor(zoom, anchor, customStart, customEnd), [
    zoom,
    anchor,
    customStart,
    customEnd,
  ]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) arr.push(d);
    return arr;
  }, [start, end]);

  const totalDays = days.length;
  const colWidth = totalDays <= 14 ? 96 : totalDays <= 45 ? 42 : 24;
  const rowHeight = 68;

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

  const rangeStartISO = ISO(start);
  const rangeEndISO = ISO(end);

  const visiblePlanejamentos = useMemo(() => {
    return planejamentos.filter((p) => {
      if (p.data_fim < rangeStartISO || p.data_inicio > rangeEndISO) return false;
      if (fProduto !== ALL && p.produto !== fProduto) return false;
      if (fArea !== ALL && (p.area ?? "") !== fArea) return false;
      if (fIlha !== ALL && p.ilha_id !== fIlha) return false;
      return true;
    });
  }, [planejamentos, rangeStartISO, rangeEndISO, fProduto, fArea, fIlha]);

  const byIlha = useMemo(() => {
    const m = new Map<string, IlhaPlanejamento[]>();
    for (const p of visiblePlanejamentos) {
      const arr = m.get(p.ilha_id) ?? [];
      arr.push(p);
      m.set(p.ilha_id, arr);
    }
    return m;
  }, [visiblePlanejamentos]);

  const overlapIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of planejamentos) {
      if (findOverlaps(planejamentos, p).length > 0) s.add(p.id);
    }
    return s;
  }, [planejamentos]);

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
      toast.success("Planejamento removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rangeLabel = useMemo(() => {
    if (zoom === "Diário") return format(anchor, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (zoom === "Mensal") return format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
    if (zoom === "Personalizado")
      return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
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
      description="Planejamento de capacidade de longo prazo por ilha."
      icon={<MapIcon className="h-5 w-5" />}
      actions={
        <Button onClick={() => openCreate()} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Novo Planejamento
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={zoom} onValueChange={(v) => setZoom(v as Zoom)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Diário">Diário</SelectItem>
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
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-[160px]"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-[160px]"
            />
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={fProduto} onValueChange={setFProduto}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Produto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os produtos</SelectItem>
              {produtos.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fArea} onValueChange={setFArea}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as áreas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-auto scroll-thin">
        <TooltipProvider delayDuration={200}>
          <div className="min-w-max">
            {/* Header */}
            <div
              className="sticky top-0 z-10 flex border-b bg-card"
              style={{ paddingLeft: 180 }}
            >
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className="flex flex-col items-center justify-center border-r py-2 text-xs"
                  style={{ width: colWidth, minWidth: colWidth }}
                >
                  <span className="text-muted-foreground">
                    {format(d, "EEE", { locale: ptBR })}
                  </span>
                  <span className="font-semibold">{format(d, "dd/MM")}</span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {filteredIlhas.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma ilha cadastrada.
              </div>
            )}
            {filteredIlhas.map((ilha) => {
              const plans = byIlha.get(ilha.id) ?? [];
              return (
                <div
                  key={ilha.id}
                  className="relative flex border-b last:border-b-0 hover:bg-muted/20"
                  style={{ minHeight: rowHeight }}
                >
                  <div
                    className="sticky left-0 z-[5] flex items-center justify-between border-r bg-card px-3"
                    style={{ width: 180, minWidth: 180 }}
                  >
                    <span className="truncate text-sm font-medium">{ilha.nome}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => openCreate(ilha.id, rangeStartISO)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div
                    className="relative flex-1"
                    style={{ minHeight: rowHeight, width: colWidth * totalDays }}
                  >
                    {/* day-cell grid background */}
                    <div className="pointer-events-none absolute inset-0 flex">
                      {days.map((d) => (
                        <div
                          key={d.toISOString()}
                          className="border-r border-dashed border-border/50"
                          style={{ width: colWidth }}
                        />
                      ))}
                    </div>
                    {/* blocks */}
                    {plans.map((p, idx) => {
                      const startD = parseISO(p.data_inicio) < start ? start : parseISO(p.data_inicio);
                      const endD = parseISO(p.data_fim) > end ? end : parseISO(p.data_fim);
                      const offset = Math.max(0, differenceInCalendarDays(startD, start));
                      const spanDays = differenceInCalendarDays(endD, startD) + 1;
                      const left = offset * colWidth + 2;
                      const width = spanDays * colWidth - 4;
                      const color = colorForProduto(p.produto, p.cor);
                      const conflict = overlapIds.has(p.id);
                      return (
                        <Tooltip key={p.id}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => openEdit(p)}
                              className="absolute rounded-md border px-2 py-1 text-left text-xs font-medium shadow-sm transition hover:brightness-110"
                              style={{
                                left,
                                width,
                                top: 6 + (idx % 2) * 30,
                                height: rowHeight - 12 - (idx % 2 === 0 ? 30 : 0),
                                background: color,
                                borderColor: color,
                                color: contrastText(color),
                              }}
                            >
                              <span className="flex items-center gap-1 truncate">
                                {conflict && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                <span className="truncate">{p.produto}</span>
                              </span>
                              <span className="block truncate opacity-80">
                                {p.hora_inicio.slice(0, 5)}–{p.hora_fim.slice(0, 5)}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            <div className="font-semibold">{p.produto}</div>
                            <div>
                              {format(parseISO(p.data_inicio), "dd/MM/yyyy")} –{" "}
                              {format(parseISO(p.data_fim), "dd/MM/yyyy")}
                            </div>
                            <div>
                              {p.hora_inicio.slice(0, 5)} – {p.hora_fim.slice(0, 5)}
                            </div>
                            {p.area && <div>Área: {p.area}</div>}
                            {p.notas && (
                              <div className="mt-1 text-muted-foreground">{p.notas}</div>
                            )}
                            {conflict && (
                              <div className="mt-1 text-amber-600">⚠ Sobreposição de blocos</div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Planejamento" : "Novo Planejamento"}
            </DialogTitle>
            <DialogDescription>
              Bloqueio estratégico de capacidade para uma ilha de produção.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Ilha *</Label>
              <Select
                value={form.ilha_id}
                onValueChange={(v) => setForm({ ...form, ilha_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a ilha" />
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
              <Label>Produto *</Label>
              <Input
                value={form.produto}
                onChange={(e) => setForm({ ...form, produto: e.target.value })}
                placeholder="Ex.: Jornal da Manhã"
              />
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
                    style={{
                      background: c,
                      borderColor: form.cor === c ? "hsl(var(--foreground))" : "transparent",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data início *</Label>
              <Input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data fim *</Label>
              <Input
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
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
              <Label>Área</Label>
              <Input
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder="Ex.: Jornalismo, Esportes"
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
            {form.ilha_id && form.data_inicio && form.data_fim && (
              <OverlapPreview
                planejamentos={planejamentos}
                target={{
                  id: editing?.id,
                  ilha_id: form.ilha_id,
                  data_inicio: form.data_inicio,
                  data_fim: form.data_fim,
                }}
              />
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => del.mutate(editing.id)}
                disabled={del.isPending}
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
                {editing ? (
                  <>
                    <Pencil className="mr-2 h-4 w-4" /> Atualizar
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" /> Criar
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function OverlapPreview({
  planejamentos,
  target,
}: {
  planejamentos: IlhaPlanejamento[];
  target: { id?: string; ilha_id: string; data_inicio: string; data_fim: string };
}) {
  const overlaps = findOverlaps(planejamentos, target);
  if (overlaps.length === 0) return null;
  return (
    <div className="sm:col-span-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
      <div className="mb-1 flex items-center gap-1 font-medium text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5" /> Sobreposição detectada (permitido)
      </div>
      <ul className="space-y-0.5 text-amber-700/90">
        {overlaps.slice(0, 3).map((o) => (
          <li key={o.id}>
            • {o.produto} ({o.data_inicio} → {o.data_fim})
          </li>
        ))}
      </ul>
    </div>
  );
}

function rangeFor(zoom: Zoom, anchor: Date, customStart: string, customEnd: string) {
  if (zoom === "Diário") return { start: anchor, end: anchor };
  if (zoom === "Semanal")
    return {
      start: startOfWeek(anchor, { weekStartsOn: 1 }),
      end: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  if (zoom === "Mensal") return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  return { start: parseISO(customStart), end: parseISO(customEnd) };
}

export default MapaIlhasPage;
