import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { invalidateOperacional, limparProjecoesDeEscalas, sincronizarFeriasDeEscalas } from "@/lib/sync";

import {
  conteudosQuery,
  escalasQuery,
  pessoasQuery,
  programaNecessidadesQuery,
  programasQuery,
} from "@/lib/queries";
import {
  SITUACOES_ESPECIAIS,
  contrastText,
  hexToSoftBg,
  type EscalaCompleta,
  type PessoaComFuncao,
  type ProgramaComConteudo,
  type ViewMode,
} from "@/lib/domain";
import {
  ISO,
  daysInRange,
  dayName,
  dayNum,
  isWeekend,
  monthShort,
  rangeForView,
  rangeLabel,
  shiftAnchor,
} from "@/lib/dates";

export const Route = createFileRoute("/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento Macro — Gestão de Equipes" },
      {
        name: "description",
        content:
          "Visão estratégica de cobertura: aloque produtos, férias, folgas e licenças e acompanhe necessidade vs. alocados.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(pessoasQuery());
    context.queryClient.ensureQueryData(programasQuery());
    context.queryClient.ensureQueryData(conteudosQuery());
    context.queryClient.ensureQueryData(programaNecessidadesQuery());
  },
  component: PlanejamentoPage,
});

const ALL = "__all__";
const SEM_CONTEUDO = "__sem_conteudo__";

function PlanejamentoPage() {
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: programas } = useSuspenseQuery(programasQuery());
  const { data: conteudos } = useSuspenseQuery(conteudosQuery());
  const { data: necessidades } = useSuspenseQuery(programaNecessidadesQuery());
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("Semanal");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [fConteudo, setFConteudo] = useState(ALL);
  const [fPrograma, setFPrograma] = useState(ALL);
  const [fPessoa, setFPessoa] = useState(ALL);

  const { start, end } = rangeForView(anchor, view);
  const days = useMemo(() => daysInRange(start, end), [start, end]);
  const { data: escalas = [] } = useQuery(escalasQuery(ISO(start), ISO(end)));

  // Mutations -----------------------------------------------------------
  const setCell = useMutation({
    mutationFn: async (args: {
      pessoaId: string;
      data: string;
      programaId: string | null;
      status: string;
    }) => {
      // Replace any existing allocation for that pessoa+data (one entry per cell in macro view).
      await limparProjecoesDeEscalas((q) =>
        q.eq("pessoa_id", args.pessoaId).eq("data", args.data),
      );
      const { error: delErr } = await supabase
        .from("escalas")
        .delete()
        .eq("pessoa_id", args.pessoaId)
        .eq("data", args.data);
      if (delErr) throw delErr;
      const { error } = await supabase.from("escalas").insert({
        pessoa_id: args.pessoaId,
        data: args.data,
        programa_id: args.programaId,
        modalidade: "TV",
        status: args.status,
      });
      if (error) throw error;
      await sincronizarFeriasDeEscalas([args.pessoaId], [args.data], args.status);
    },
    onSuccess: () => invalidateOperacional(qc),
    onError: (e: Error) => toast.error(e.message),
  });

  const setRange = useMutation({
    mutationFn: async (args: {
      pessoaId: string;
      startISO: string;
      endISO: string;
      programaId: string | null;
      status: string;
    }) => {
      const start = new Date(args.startISO + "T00:00:00");
      const end = new Date(args.endISO + "T00:00:00");
      const dates: string[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(ISO(d));
      }
      if (!dates.length) return;
      await limparProjecoesDeEscalas((q) =>
        q.eq("pessoa_id", args.pessoaId).in("data", dates),
      );
      const { error: delErr } = await supabase
        .from("escalas")
        .delete()
        .eq("pessoa_id", args.pessoaId)
        .in("data", dates);
      if (delErr) throw delErr;
      const rows = dates.map((data) => ({
        pessoa_id: args.pessoaId,
        data,
        programa_id: args.programaId,
        modalidade: "TV",
        status: args.status,
      }));
      const { error } = await supabase.from("escalas").insert(rows);
      if (error) throw error;
      await sincronizarFeriasDeEscalas([args.pessoaId], dates, args.status);
    },
    onSuccess: () => invalidateOperacional(qc),
    onError: (e: Error) => toast.error(e.message),
  });

  const clearCell = useMutation({
    mutationFn: async (args: { pessoaId: string; data: string }) => {
      await limparProjecoesDeEscalas((q) =>
        q.eq("pessoa_id", args.pessoaId).eq("data", args.data),
      );
      const { error } = await supabase
        .from("escalas")
        .delete()
        .eq("pessoa_id", args.pessoaId)
        .eq("data", args.data);
      if (error) throw error;
      await sincronizarFeriasDeEscalas([args.pessoaId], [args.data], "");
    },
    onSuccess: () => invalidateOperacional(qc),
    onError: (e: Error) => toast.error(e.message),

  });

  // Indexing ------------------------------------------------------------
  const programaById = useMemo(
    () => new Map(programas.map((p) => [p.id, p])),
    [programas],
  );

  const conteudoIdOfPessoa = (p: PessoaComFuncao): string =>
    p.tipo_conteudo_id ?? SEM_CONTEUDO;

  const conteudoIdOfPrograma = (p: ProgramaComConteudo): string =>
    p.tipo_conteudo_id ?? SEM_CONTEUDO;

  // Filtered escalas (apply row-level filters)
  const escalasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return escalas.filter((e) => {
      if (fPrograma !== ALL && e.programa_id !== fPrograma) return false;
      if (fConteudo !== ALL) {
        const cKey = e.programa?.conteudo?.id ?? SEM_CONTEUDO;
        if (cKey !== fConteudo) return false;
      }
      if (fPessoa !== ALL && e.pessoa_id !== fPessoa) return false;
      if (q) {
        const pessoa = pessoas.find((x) => x.id === e.pessoa_id);
        const m =
          (pessoa?.nome ?? "").toLowerCase().includes(q) ||
          (e.programa?.nome ?? "").toLowerCase().includes(q);
        if (!m) return false;
      }
      return true;
    });
  }, [escalas, search, fPrograma, fConteudo, fPessoa, pessoas]);

  // Map: pessoaId -> data -> escala (one per cell)
  const cellMap = useMemo(() => {
    const m = new Map<string, EscalaCompleta>();
    for (const e of escalasFiltradas) {
      m.set(`${e.pessoa_id}|${e.data}`, e);
    }
    return m;
  }, [escalasFiltradas]);

  // Group pessoas by conteúdo (apenas ativos)
  const pessoasAtivas = useMemo(
    () => pessoas.filter((p) => p.status === "Ativo"),
    [pessoas],
  );

  const pessoasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pessoasAtivas.filter((p) => {
      if (fPessoa !== ALL && p.id !== fPessoa) return false;
      if (fConteudo !== ALL && conteudoIdOfPessoa(p) !== fConteudo) return false;
      if (q && !p.nome.toLowerCase().includes(q)) {
        // person can still appear if matched by allocation; keep loose
        const hasMatch = Array.from(cellMap.values()).some(
          (e) => e.pessoa_id === p.id,
        );
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [pessoasAtivas, fPessoa, fConteudo, cellMap, search]);

  const grupos = useMemo(() => {
    const conteudoInfo = new Map(
      conteudos.map((c) => [c.id, { nome: c.nome, cor: c.cor, ordem: c.ordem }]),
    );
    type Grupo = {
      key: string;
      nome: string;
      cor: string;
      ordem: number;
      pessoas: PessoaComFuncao[];
      programas: ProgramaComConteudo[];
    };
    const map = new Map<string, Grupo>();

    function ensure(key: string): Grupo {
      let g = map.get(key);
      if (!g) {
        const info = key !== SEM_CONTEUDO ? conteudoInfo.get(key) : undefined;
        g = {
          key,
          nome: info?.nome ?? "Alocações",
          cor: info?.cor ?? "#94a3b8",
          ordem: info?.ordem ?? 99999,
          pessoas: [],
          programas: [],
        };
        map.set(key, g);
      }
      return g;
    }

    for (const p of pessoasFiltradas) {
      ensure(conteudoIdOfPessoa(p)).pessoas.push(p);
    }
    for (const pr of programas) {
      if (fPrograma !== ALL && pr.id !== fPrograma) continue;
      ensure(conteudoIdOfPrograma(pr)).programas.push(pr);
    }

    return Array.from(map.values())
      .filter((g) => g.pessoas.length > 0 || g.programas.length > 0)
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
      .map((g) => ({
        ...g,
        pessoas: g.pessoas.sort(
          (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
        ),
        programas: g.programas.sort((a, b) => a.nome.localeCompare(b.nome)),
      }));
  }, [conteudos, pessoasFiltradas, programas, fPrograma]);

  // Coverage: programaId|iso -> count alocados
  const alocadosPorProgramaDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of escalasFiltradas) {
      if (!e.programa_id) continue;
      const k = `${e.programa_id}|${e.data}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [escalasFiltradas]);

  const necessidadeByProgramaDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of necessidades) {
      m.set(`${n.programa_id}|${n.dia_semana}`, n.quantidade);
    }
    return m;
  }, [necessidades]);

  const hasActiveFilters =
    fConteudo !== ALL ||
    fPrograma !== ALL ||
    fPessoa !== ALL ||
    !!search;

  function clearFilters() {
    setFConteudo(ALL);
    setFPrograma(ALL);
    setFPessoa(ALL);
    setSearch("");
  }

  const colWidth = view === "Diário" ? 220 : view === "Semanal" ? 120 : 84;

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Toolbar */}
      <div className="border-b bg-card/50 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold leading-tight tracking-tight">
                Planejamento Macro
              </h1>
              <p className="text-sm text-muted-foreground">
                {rangeLabel(anchor, view)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border bg-background p-0.5">
              {(["Diário", "Semanal", "Mensal"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    view === v
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setAnchor((a) => shiftAnchor(a, view, -1))}
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarRange className="h-4 w-4" />
                    Ir para
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={anchor}
                    onSelect={(d) => d && setAnchor(d)}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setAnchor((a) => shiftAnchor(a, view, 1))}
                aria-label="Próximo período"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setAnchor(new Date())}>
                Hoje
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador, programa..."
              className="h-9 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <FilterSelect
            value={fConteudo}
            onChange={setFConteudo}
            placeholder="Conteúdo"
            options={conteudos.map((c) => ({ value: c.id, label: c.nome }))}
          />
          <FilterSelect
            value={fPrograma}
            onChange={setFPrograma}
            placeholder="Produto"
            options={programas.map((p) => ({ value: p.id, label: p.nome }))}
          />
          <FilterSelect
            value={fPessoa}
            onChange={setFPessoa}
            placeholder="Colaborador"
            options={pessoasAtivas.map((p) => ({ value: p.id, label: p.nome }))}
          />

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filtros
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        {grupos.length === 0 ? (
          <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
            Nenhum colaborador ativo encontrado para os filtros atuais.
          </div>
        ) : (
          <table className="border-separate border-spacing-0" style={{ width: "max-content" }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 border-b border-r bg-card px-4 py-2.5 text-left"
                  style={{ width: 220, minWidth: 220 }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Conteúdo / Colaborador
                  </span>
                </th>
                {days.map((d) => (
                  <th
                    key={ISO(d)}
                    className={cn(
                      "sticky top-0 z-20 border-b border-r bg-card px-2 py-1.5 text-center align-middle",
                      isWeekend(d) && "bg-muted",
                    )}
                    style={{ width: colWidth, minWidth: colWidth }}
                  >
                    <div className="text-[11px] font-medium uppercase text-muted-foreground">
                      {dayName(d)}
                    </div>
                    <div className="font-display text-sm font-semibold leading-tight">
                      {dayNum(d)}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        {monthShort(d)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.key}>
                  {/* Conteúdo band */}
                  <tr>
                    <td
                      className="sticky left-0 z-10 border-b border-r px-4 py-2"
                      style={{
                        width: 220,
                        minWidth: 220,
                        backgroundColor: g.cor,
                        color: contrastText(g.cor),
                      }}
                    >
                      <span className="font-display text-sm font-bold uppercase tracking-wide">
                        {g.nome}
                      </span>
                    </td>
                    <td
                      className="border-b border-r"
                      colSpan={days.length}
                      style={{ backgroundColor: hexToSoftBg(g.cor, 0.18) }}
                    />
                  </tr>

                  {/* Person rows */}
                  {g.pessoas.map((p) => (
                    <tr key={`${g.key}|${p.id}`} className="group">
                      <td
                        className="sticky left-0 z-10 border-b border-r bg-card px-4 py-1.5 group-hover:bg-muted"
                        style={{ width: 220, minWidth: 220 }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                            {p.nome.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold leading-tight">
                              {p.nome}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {p.funcao?.nome ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      {days.map((d) => {
                        const iso = ISO(d);
                        const cell = cellMap.get(`${p.id}|${iso}`);
                        return (
                          <td
                            key={iso}
                            className={cn(
                              "border-b border-r p-1 align-middle",
                              isWeekend(d) && "bg-muted/30",
                            )}
                            style={{ width: colWidth, minWidth: colWidth, height: 44 }}
                          >
                            <CellPicker
                              iso={iso}
                              cell={cell}
                              programas={programas}
                              onPick={(programaId, status) =>
                                setCell.mutate({
                                  pessoaId: p.id,
                                  data: iso,
                                  programaId,
                                  status,
                                })
                              }
                              onPickRange={(programaId, status, startISO, endISO) =>
                                setRange.mutate({
                                  pessoaId: p.id,
                                  startISO,
                                  endISO,
                                  programaId,
                                  status,
                                })
                              }
                              onClear={() =>
                                clearCell.mutate({ pessoaId: p.id, data: iso })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Coverage rows per program in this conteudo */}
                  {g.programas.map((pr) => (
                    <CoberturaRow
                      key={`cov|${g.key}|${pr.id}`}
                      programa={pr}
                      days={days}
                      colWidth={colWidth}
                      necessidadeByDow={(dow) =>
                        necessidadeByProgramaDia.get(`${pr.id}|${dow}`) ?? 0
                      }
                      alocadosByIso={(iso) =>
                        alocadosPorProgramaDia.get(`${pr.id}|${iso}`) ?? 0
                      }
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <Legenda conteudos={conteudos} />
    </div>
  );
}

// =============== Cell picker ===============

function CellPicker({
  iso,
  cell,
  programas,
  onPickRange,
  onClear,
}: {
  iso: string;
  cell: EscalaCompleta | undefined;
  programas: ProgramaComConteudo[];
  onPick: (programaId: string | null, status: string) => void;
  onPickRange: (
    programaId: string | null,
    status: string,
    startISO: string,
    endISO: string,
  ) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [conteudoId, setConteudoId] = useState<string>(ALL);
  const [programaId, setProgramaId] = useState<string>(
    cell?.programa_id ?? "",
  );
  const [status, setStatus] = useState<string>(cell?.status ?? "Trabalhando");
  const [startISO, setStartISO] = useState(iso);
  const [dias, setDias] = useState<number>(1);

  const conteudos = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }>();
    for (const p of programas) {
      if (p.conteudo) map.set(p.conteudo.id, { id: p.conteudo.id, nome: p.conteudo.nome });
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [programas]);

  const programasFiltrados = useMemo(
    () =>
      conteudoId === ALL
        ? programas
        : programas.filter((p) => p.conteudo?.id === conteudoId),
    [programas, conteudoId],
  );

  const isEspecial = status !== "Trabalhando";

  function reset() {
    setConteudoId(
      cell?.programa?.conteudo?.id ?? ALL,
    );
    setProgramaId(cell?.programa_id ?? "");
    setStatus(cell?.status ?? "Trabalhando");
    setStartISO(iso);
    setDias(1);
  }

  function endFromDias() {
    const d = new Date(startISO + "T00:00:00");
    d.setDate(d.getDate() + Math.max(dias, 1) - 1);
    return ISO(d);
  }

  const trigger = cell ? <CellChip escala={cell} /> : <EmptyCellButton />;

  return (
    <>
      <button
        type="button"
        className="block w-full"
        onClick={(e) => {
          e.stopPropagation();
          reset();
          setOpen(true);
        }}
      >
        {trigger}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Alocação</DialogTitle>
            <DialogDescription>
              Defina conteúdo, produto, período e situação da alocação.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Situação
              </label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Trabalhando">Trabalhando</SelectItem>
                  {SITUACOES_ESPECIAIS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conteúdo
              </label>
              <Select
                value={conteudoId}
                onValueChange={(v) => {
                  setConteudoId(v);
                  setProgramaId("");
                }}
                disabled={isEspecial}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os conteúdos</SelectItem>
                  {conteudos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Produto
              </label>
              <Select
                value={programaId}
                onValueChange={setProgramaId}
                disabled={isEspecial}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {programasFiltrados.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id}>
                      {pr.nome}
                      {pr.sigla ? ` (${pr.sigla})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEspecial && (
                <p className="text-[11px] text-muted-foreground">
                  Situações especiais não exigem produto.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Data de início
              </label>
              <Input
                type="date"
                value={startISO}
                onChange={(e) => setStartISO(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quantidade de dias
              </label>
              <Input
                type="number"
                min={1}
                value={dias}
                onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))}
              />
              <p className="text-[11px] text-muted-foreground">
                Término em {endFromDias().split("-").reverse().join("/")}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {cell ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" /> Limpar célula
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!isEspecial && !programaId) {
                    toast.error("Selecione um produto.");
                    return;
                  }
                  onPickRange(
                    isEspecial ? null : programaId,
                    status,
                    startISO,
                    endFromDias(),
                  );
                  setOpen(false);
                }}
              >
                Confirmar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmptyCellButton() {
  return (
    <div className="flex h-full min-h-[36px] w-full items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:bg-accent/60 hover:text-accent-foreground">
      <span className="text-base leading-none">+</span>
    </div>
  );
}

function CellChip({ escala }: { escala: EscalaCompleta }) {
  if (escala.programa_id && escala.programa) {
    const cor = escala.programa.cor;
    const sigla = escala.programa.sigla || escala.programa.nome.slice(0, 3).toUpperCase();
    return (
      <div
        className="flex h-9 w-full items-center justify-center rounded-md border text-[11px] font-bold"
        style={{
          backgroundColor: hexToSoftBg(cor, 0.2),
          borderColor: hexToSoftBg(cor, 0.5),
          color: cor,
        }}
        title={escala.programa.nome}
      >
        {sigla}
      </div>
    );
  }
  const sit = SITUACOES_ESPECIAIS.find((s) => s.key === escala.status);
  const cor = sit?.cor ?? "#94a3b8";
  return (
    <div
      className="flex h-9 w-full items-center justify-center rounded-md border text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: hexToSoftBg(cor, 0.18),
        borderColor: hexToSoftBg(cor, 0.4),
        color: cor,
      }}
      title={escala.status}
    >
      {escala.status}
    </div>
  );
}

// =============== Cobertura row ===============

function CoberturaRow({
  programa,
  days,
  colWidth,
  necessidadeByDow,
  alocadosByIso,
}: {
  programa: ProgramaComConteudo;
  days: Date[];
  colWidth: number;
  necessidadeByDow: (dow: number) => number;
  alocadosByIso: (iso: string) => number;
}) {
  const totals = days.reduce(
    (acc, d) => {
      const need = necessidadeByDow(d.getDay());
      const alloc = alocadosByIso(ISO(d));
      acc.need += need;
      acc.alloc += alloc;
      return acc;
    },
    { need: 0, alloc: 0 },
  );
  const diff = totals.alloc - totals.need;

  return (
    <tr>
      <td
        className="sticky left-0 z-10 border-b border-r bg-card px-4 py-1.5"
        style={{ width: 220, minWidth: 220 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: programa.cor }}
          />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{programa.nome}</div>
            <div className="text-[10px] text-muted-foreground">
              Alocados {totals.alloc} · Necessidade {totals.need} ·{" "}
              <span
                className={cn(
                  "font-semibold",
                  diff < 0 && "text-destructive",
                  diff > 0 && "text-emerald-600",
                )}
              >
                {diff > 0 ? "+" : ""}
                {diff}
              </span>
            </div>
          </div>
        </div>
      </td>
      {days.map((d) => {
        const need = necessidadeByDow(d.getDay());
        const alloc = alocadosByIso(ISO(d));
        const deficit = alloc < need;
        const excess = alloc > need;
        return (
          <td
            key={ISO(d)}
            className={cn(
              "border-b border-r p-1 text-center",
              isWeekend(d) && "bg-muted/30",
            )}
            style={{ width: colWidth, minWidth: colWidth }}
          >
            <div
              className={cn(
                "mx-auto inline-flex min-w-[40px] items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold",
                deficit && "bg-destructive text-destructive-foreground",
                excess && "bg-emerald-600 text-white",
                !deficit && !excess && "bg-muted text-muted-foreground",
              )}
              title={`Necessidade ${need} · Alocados ${alloc}`}
            >
              {alloc}/{need}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

// =============== Legenda ===============

function Legenda({ conteudos }: { conteudos: { id: string; nome: string; cor: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-card/60 px-4 py-2 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">
        Legenda
      </span>
      {conteudos.map((c) => (
        <span key={c.id} className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: c.cor }}
          />
          {c.nome}
        </span>
      ))}
      <span className="mx-2 h-3 w-px bg-border" />
      {SITUACOES_ESPECIAIS.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: s.cor }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// =============== Filter select ===============

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px] text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder} (todos)</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
