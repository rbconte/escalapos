import { createFileRoute } from "@tanstack/react-router";
import { type DragEvent, Fragment, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  invalidateOperacional,
  limparProjecoesDeEscalas,
  sincronizarEscalas,
  type EscalaSync,
} from "@/lib/sync";

import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { CalendarHeader } from "@/components/calendar-header";
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
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  EscalaModal,
  type EscalaModalState,
} from "@/components/escala/escala-modal";
import {
  conteudosQuery,
  escalasQuery,
  funcoesQuery,
  ilhasQuery,
  ocorrenciasQuery,
  pessoasQuery,
  programasQuery,
} from "@/lib/queries";
import { corSituacao, useSituacoes } from "@/lib/use-situacoes";
import {
  MODALIDADES,
  STATUS_META,
  contrastText,
  hexToSoftBg,
  type EscalaCompleta,
  type PessoaComFuncao,
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
import { ExportEscalaModal } from "@/components/escala/export-modal";
import {
  notificarResumoOcorrencias,
  reprocessarOcorrencias,
} from "@/lib/validacoes";
import {
  OcorrenciasButton,
  OcorrenciasPanel,
} from "@/components/escala/ocorrencias-panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Escala Operacional — Gestão de Equipes" },
      {
        name: "description",
        content:
          "Visualize e planeje a ocupação da equipe em uma timeline contínua, com filtros e modos diário, semanal e mensal.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(pessoasQuery());
    context.queryClient.ensureQueryData(programasQuery());
    context.queryClient.ensureQueryData(ilhasQuery());
    context.queryClient.ensureQueryData(funcoesQuery());
    context.queryClient.ensureQueryData(conteudosQuery());
    context.queryClient.ensureQueryData(ocorrenciasQuery());
  },
  component: EscalaPage,
});

const ALL = "__all__";
const SEM_CONTEUDO = "__sem_conteudo__";
const SEM_PROGRAMA = "__sem_programa__";

function EscalaPage() {
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: programas } = useSuspenseQuery(programasQuery());
  const { data: ilhas } = useSuspenseQuery(ilhasQuery());
  const { data: funcoes } = useSuspenseQuery(funcoesQuery());
  const { data: conteudos } = useSuspenseQuery(conteudosQuery());
  const situacoes = useSituacoes();

  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("Semanal");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [modal, setModal] = useState<EscalaModalState>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<{ start: Date; end: Date } | null>(null);

  // Drag & drop: copy an existing allocation onto another person / day.
  const [dragEscala, setDragEscala] = useState<EscalaCompleta | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const [painelOpen, setPainelOpen] = useState(false);
  const { data: ocorrencias = [] } = useQuery(ocorrenciasQuery());

  const copy = useMutation({
    mutationFn: async (args: {
      escala: EscalaCompleta;
      pessoaId: string;
      data: string;
    }) => {
      const { escala, pessoaId, data } = args;
      await limparProjecoesDeEscalas((q) => q.eq("pessoa_id", pessoaId).eq("data", data));
      const { error: delError } = await supabase
        .from("escalas")
        .delete()
        .eq("pessoa_id", pessoaId)
        .eq("data", data);
      if (delError) throw delError;
      const { data: inseridas, error } = await supabase
        .from("escalas")
        .insert({
          pessoa_id: pessoaId,
          data,
          programa_id: escala.programa_id,
          ilha_id: escala.ilha_id,
          hora_inicio: escala.hora_inicio,
          hora_fim: escala.hora_fim,
          modalidade: escala.modalidade,
          status: escala.status,
        })
        .select(
          "id, demanda_id, pessoa_id, programa_id, ilha_id, data, hora_inicio, hora_fim, status",
        );
      if (error) throw error;
      await sincronizarEscalas(
        (inseridas ?? []) as EscalaSync[],
        new Map(programas.map((p) => [p.id, p.nome] as const)),
      );
      const novas = await reprocessarOcorrencias([pessoaId]);
      return { pessoaId, novas };
    },
    onSuccess: ({ pessoaId, novas }) => {
      invalidateOperacional(qc);

      const doAlvo = novas.filter((o) => o.pessoa_id === pessoaId);
      if (doAlvo.length > 0) {
        notificarResumoOcorrencias(
          doAlvo,
          new Map(pessoas.map((p) => [p.id, p.nome])),
        );
      } else {
        toast.success("Alocação copiada.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleDrop(pessoaId: string, data: string) {
    const escala = dragEscala;
    setDragOverKey(null);
    setDragEscala(null);
    if (!escala) return;
    if (escala.pessoa_id === pessoaId && escala.data === data) return;
    copy.mutate({ escala, pessoaId, data });
  }

  const [search, setSearch] = useState("");
  const [fFuncao, setFFuncao] = useState(ALL);
  const [fConteudo, setFConteudo] = useState(ALL);
  const [fPrograma, setFPrograma] = useState(ALL);
  const [fIlha, setFIlha] = useState(ALL);
  const [fModalidade, setFModalidade] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  const { start, end } = rangeForView(anchor, view);
  const days = useMemo(() => daysInRange(start, end), [start, end]);

  const { data: escalas = [] } = useQuery(escalasQuery(ISO(start), ISO(end)));

  // Escalas for the export modal (may cover a wider range than the visible view).
  const exportFrom = exportRange ? ISO(exportRange.start) : ISO(start);
  const exportTo = exportRange ? ISO(exportRange.end) : ISO(end);
  const { data: exportEscalas = [] } = useQuery({
    ...escalasQuery(exportFrom, exportTo),
    enabled: exportOpen,
  });

  const pessoaById = useMemo(
    () => new Map(pessoas.map((p) => [p.id, p])),
    [pessoas],
  );

  /** Resolve the (visible) content key for an allocation. */
  const conteudoKeyOf = useMemo(() => {
    const ativoById = new Map(conteudos.map((c) => [c.id, c.ativo]));
    return (e: EscalaCompleta): string => {
      const c = e.programa?.conteudo;
      if (c?.id && ativoById.get(c.id)) return c.id;
      return SEM_CONTEUDO;
    };
  }, [conteudos]);

  /** Shared row-level filter (everything except the day/cell). */
  const passaFiltros = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (e: EscalaCompleta): boolean => {
      if (fPrograma !== ALL && e.programa_id !== fPrograma) return false;
      if (fIlha !== ALL && e.ilha_id !== fIlha) return false;
      if (fModalidade !== ALL && e.modalidade !== fModalidade) return false;
      if (fStatus !== ALL && e.status !== fStatus) return false;
      if (fConteudo !== ALL && conteudoKeyOf(e) !== fConteudo) return false;
      const pessoa = pessoaById.get(e.pessoa_id);
      if (fFuncao !== ALL && pessoa?.funcao_id !== fFuncao) return false;
      if (q) {
        const matchPessoa = (pessoa?.nome ?? "").toLowerCase().includes(q);
        const matchPrograma = (e.programa?.nome ?? "").toLowerCase().includes(q);
        const matchIlha = (e.ilha?.nome ?? "").toLowerCase().includes(q);
        if (!matchPessoa && !matchPrograma && !matchIlha) return false;
      }
      return true;
    };
  }, [
    search,
    fPrograma,
    fIlha,
    fModalidade,
    fStatus,
    fConteudo,
    fFuncao,
    conteudoKeyOf,
    pessoaById,
  ]);

  // index escalas by pessoa + date (used by Excel export)
  const byCell = useMemo(() => {
    const map = new Map<string, EscalaCompleta[]>();
    for (const e of escalas) {
      if (!passaFiltros(e)) continue;
      const key = `${e.pessoa_id}|${e.data}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [escalas, passaFiltros]);

  const filteredPessoas = useMemo(
    () =>
      pessoas.filter((p) =>
        Array.from(byCell.keys()).some((k) => k.startsWith(`${p.id}|`)),
      ),
    [pessoas, byCell],
  );

  // Grouped structure: Conteúdo → Programa → Colaboradores
  const grupos = useMemo(() => {
    type Cell = Map<string, EscalaCompleta[]>;
    interface PG {
      programaId: string | null;
      nome: string;
      cor: string;
      pessoas: Map<string, Cell>;
    }
    interface CG {
      key: string;
      nome: string;
      cor: string;
      ordem: number;
      programas: Map<string, PG>;
    }
    const conteudoInfo = new Map(
      conteudos.map((c) => [c.id, { nome: c.nome, cor: c.cor, ordem: c.ordem }]),
    );
    const cmap = new Map<string, CG>();

    function ensureCG(cKey: string): CG {
      let cg = cmap.get(cKey);
      if (!cg) {
        const info = cKey !== SEM_CONTEUDO ? conteudoInfo.get(cKey) : undefined;
        cg = {
          key: cKey,
          nome: info?.nome ?? "Outras Alocações",
          cor: info?.cor ?? "#94a3b8",
          ordem: info?.ordem ?? 99999,
          programas: new Map(),
        };
        cmap.set(cKey, cg);
      }
      return cg;
    }

    function ensurePG(cg: CG, e: EscalaCompleta): PG {
      const pKey = e.programa_id ?? SEM_PROGRAMA;
      let pg = cg.programas.get(pKey);
      if (!pg) {
        pg = e.programa
          ? {
              programaId: e.programa_id,
              nome: e.programa.nome,
              cor: e.programa.cor,
              pessoas: new Map(),
            }
          : {
              programaId: null,
              nome: "Folgas e ausências",
              cor: "#94a3b8",
              pessoas: new Map(),
            };
        cg.programas.set(pKey, pg);
      }
      return pg;
    }

    function pushCell(pg: PG, e: EscalaCompleta) {
      let cell = pg.pessoas.get(e.pessoa_id);
      if (!cell) {
        cell = new Map();
        pg.pessoas.set(e.pessoa_id, cell);
      }
      const arr = cell.get(e.data) ?? [];
      arr.push(e);
      cell.set(e.data, arr);
    }

    // Status (sem programa) — exibidos em "Outras Alocações" e também
    // duplicados na linha do último programa em que a pessoa esteve.
    const statusEscalas: EscalaCompleta[] = [];
    const ultimoProgPorPessoa = new Map<
      string,
      { data: string; escala: EscalaCompleta }
    >();

    for (const e of escalas) {
      if (!passaFiltros(e)) continue;
      const pessoa = pessoaById.get(e.pessoa_id);
      if (!pessoa) continue;

      const cKey = conteudoKeyOf(e);
      const cg = ensureCG(cKey);
      const pg = ensurePG(cg, e);
      pushCell(pg, e);

      if (e.programa_id && e.programa) {
        const prev = ultimoProgPorPessoa.get(e.pessoa_id);
        if (!prev || e.data >= prev.data) {
          ultimoProgPorPessoa.set(e.pessoa_id, { data: e.data, escala: e });
        }
      } else {
        statusEscalas.push(e);
      }
    }

    for (const e of statusEscalas) {
      const ref = ultimoProgPorPessoa.get(e.pessoa_id);
      if (!ref) continue;
      const refE = ref.escala;
      const cKey = conteudoKeyOf(refE);
      const cg = ensureCG(cKey);
      const pg = ensurePG(cg, refE);
      pushCell(pg, e);
    }

    const ordemPessoa = (id: string): [number, string] => {
      const p = pessoaById.get(id);
      return p ? [p.ordem, p.nome] : [99999, ""];
    };

    return Array.from(cmap.values())
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
      .map((cg) => ({
        key: cg.key,
        nome: cg.nome,
        cor: cg.cor,
        programas: Array.from(cg.programas.values())
          .sort((a, b) => {
            if (a.programaId === null) return 1;
            if (b.programaId === null) return -1;
            return a.nome.localeCompare(b.nome);
          })
          .map((pg) => ({
            programaId: pg.programaId,
            nome: pg.nome,
            cor: pg.cor,
            pessoas: Array.from(pg.pessoas.entries())
              .sort(([a], [b]) => {
                const [oa, na] = ordemPessoa(a);
                const [ob, nb] = ordemPessoa(b);
                return oa - ob || na.localeCompare(nb);
              })
              .map(([pessoaId, byDate]) => ({
                pessoa: pessoaById.get(pessoaId)!,
                byDate,
              })),
          })),
      }));
  }, [escalas, conteudos, pessoaById, conteudoKeyOf, passaFiltros]);

  // Open occurrences indexed for row/cell indicators.
  const ocorrenciasAbertas = useMemo(
    () => ocorrencias.filter((o) => o.status === "Aberta"),
    [ocorrencias],
  );
  const ocorrPorPessoa = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ocorrenciasAbertas) {
      m.set(o.pessoa_id, (m.get(o.pessoa_id) ?? 0) + 1);
    }
    return m;
  }, [ocorrenciasAbertas]);
  const ocorrPorCelula = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ocorrenciasAbertas) {
      const k = `${o.pessoa_id}|${o.data}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [ocorrenciasAbertas]);

  const hasActiveFilters =
    fFuncao !== ALL ||
    fConteudo !== ALL ||
    fPrograma !== ALL ||
    fIlha !== ALL ||
    fModalidade !== ALL ||
    fStatus !== ALL ||
    !!search;

  function clearFilters() {
    setFFuncao(ALL);
    setFConteudo(ALL);
    setFPrograma(ALL);
    setFIlha(ALL);
    setFModalidade(ALL);
    setFStatus(ALL);
    setSearch("");
  }

  const colWidth = view === "Diário" ? 360 : view === "Semanal" ? 200 : 132;

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Toolbar */}
      <CalendarHeader
          title="Escala Operacional"
          rangeLabel={rangeLabel(anchor, view)}
          icon={<CalendarRange className="h-5 w-5" />}
          prefix={<SidebarTrigger className="hidden md:flex" />}
          actions={
            <>
              {/* View switcher */}
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

              {/* Navigation */}
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
                      locale={undefined}
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

              <Button variant="outline" onClick={() => setExportOpen(true)}>
                <Download className="h-4 w-4" /> Exportar
              </Button>

              <OcorrenciasButton
                count={ocorrenciasAbertas.length}
                onClick={() => setPainelOpen(true)}
              />

              <Button onClick={() => setModal({ mode: "create", pessoaId: "", data: ISO(anchor) })}>
                <Plus className="h-4 w-4" /> Nova alocação
              </Button>
            </>
          }
        />

        <div className="border-b bg-card/50 px-4 py-3 sm:px-6">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador, programa, ilha..."
              className="h-9 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <FilterSelect value={fFuncao} onChange={setFFuncao} placeholder="Função"
            options={funcoes.map((f) => ({ value: f.id, label: f.nome }))} />
          <FilterSelect value={fConteudo} onChange={setFConteudo} placeholder="Conteúdo"
            options={conteudos.map((c) => ({ value: c.id, label: c.nome }))} />
          <FilterSelect value={fPrograma} onChange={setFPrograma} placeholder="Programa"
            options={programas.map((p) => ({ value: p.id, label: p.nome }))} />
          <FilterSelect value={fIlha} onChange={setFIlha} placeholder="Ilha"
            options={ilhas.map((i) => ({ value: i.id, label: i.nome }))} />
          <FilterSelect value={fModalidade} onChange={setFModalidade} placeholder="Modalidade"
            options={MODALIDADES.map((m) => ({ value: m, label: m }))} />
          <FilterSelect value={fStatus} onChange={setFStatus} placeholder="Status"
            options={situacoes.map((s) => ({ value: s.nome, label: s.nome }))} />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
          {!hasActiveFilters && (
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
            Nenhuma alocação encontrada no período. Crie uma nova alocação ou ajuste
            os filtros.
          </div>
        ) : (
          <table className="border-separate border-spacing-0" style={{ width: "max-content" }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 border-b border-r bg-card px-4 py-2.5 text-left"
                  style={{ width: 240, minWidth: 240 }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Conteúdo / Programa / Colaborador
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
                    <div className="font-display text-base font-semibold leading-tight">
                      {dayNum(d)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {monthShort(d)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((cg) => (
                <Fragment key={cg.key}>
                  {/* Content header band */}
                  <tr>
                    <td
                      className="sticky left-0 z-10 border-b border-r px-4 py-2"
                      style={{
                        width: 240,
                        minWidth: 240,
                        backgroundColor: cg.cor,
                        color: contrastText(cg.cor),
                      }}
                    >
                      <span className="font-display text-sm font-bold uppercase tracking-wide">
                        {cg.nome}
                      </span>
                    </td>
                    <td
                      className="border-b border-r"
                      colSpan={days.length}
                      style={{ backgroundColor: hexToSoftBg(cg.cor, 0.18) }}
                    />
                  </tr>

                  {cg.programas.map((pg) => (
                    <Fragment key={`${cg.key}|${pg.programaId ?? SEM_PROGRAMA}`}>
                      {/* Program sub-header */}
                      <tr>
                        <td
                          className="sticky left-0 z-10 border-b border-r bg-muted px-4 py-1.5"
                          style={{ width: 240, minWidth: 240 }}
                        >
                          <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: pg.cor }}
                            />
                            <span className="truncate">{pg.nome}</span>
                          </span>
                        </td>
                        <td className="border-b border-r bg-muted/20" colSpan={days.length} />
                      </tr>

                      {pg.pessoas.map(({ pessoa: p, byDate }) => (
                        <tr key={`${cg.key}|${pg.programaId ?? SEM_PROGRAMA}|${p.id}`} className="group">
                          <td
                            className="sticky left-0 z-10 border-b border-r bg-card px-4 py-2 pl-8 group-hover:bg-muted"
                            style={{ width: 240, minWidth: 240 }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {p.nome.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold leading-tight">
                                    {p.nome}
                                  </span>
                                  {(ocorrPorPessoa.get(p.id) ?? 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setPainelOpen(true)}
                                      title={`${ocorrPorPessoa.get(p.id)} ocorrência(s) operacional(is)`}
                                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning"
                                    >
                                      <AlertTriangle className="h-3 w-3" />
                                      {ocorrPorPessoa.get(p.id)}
                                    </button>
                                  )}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {p.funcao?.nome ?? "—"}
                                </div>
                              </div>
                            </div>
                          </td>
                          {days.map((d) => {
                            const iso = ISO(d);
                            const key = `${p.id}|${iso}`;
                            const cell = byDate.get(iso) ?? [];
                            const temOcorrencia = (ocorrPorCelula.get(key) ?? 0) > 0;
                            const isDropTarget =
                              !!dragEscala &&
                              !(dragEscala.pessoa_id === p.id && dragEscala.data === iso);
                            const cellKey = `${pg.programaId ?? SEM_PROGRAMA}|${key}`;
                            return (
                              <td
                                key={cellKey}
                                className={cn(
                                  "relative border-b border-r p-1 align-top transition-colors",
                                  isWeekend(d) && "bg-muted/30",
                                  temOcorrencia && "ring-1 ring-inset ring-warning/50",
                                  dragOverKey === cellKey && "bg-accent/70 ring-2 ring-inset ring-primary",
                                )}
                                style={{ width: colWidth, minWidth: colWidth, height: 64 }}
                                onDragOver={(ev) => {
                                  if (!isDropTarget) return;
                                  ev.preventDefault();
                                  ev.dataTransfer.dropEffect = "copy";
                                  if (dragOverKey !== cellKey) setDragOverKey(cellKey);
                                }}
                                onDragLeave={() => {
                                  if (dragOverKey === cellKey) setDragOverKey(null);
                                }}
                                onDrop={(ev) => {
                                  ev.preventDefault();
                                  handleDrop(p.id, iso);
                                }}
                              >
                                {temOcorrencia && (
                                  <button
                                    type="button"
                                    onClick={() => setPainelOpen(true)}
                                    title="Inconformidade operacional neste dia"
                                    className="absolute right-1 top-1 z-10 text-warning"
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5 fill-warning/20" />
                                  </button>
                                )}
                                {cell.length === 0 ? (
                                  <button
                                    onClick={() =>
                                      setModal({
                                        mode: "create",
                                        pessoaId: p.id,
                                        data: iso,
                                        programaId: pg.programaId ?? undefined,
                                      })
                                    }
                                    className="flex h-full min-h-[56px] w-full items-center justify-center rounded-md text-muted-foreground/0 transition-colors hover:bg-accent/60 hover:text-accent-foreground"
                                    aria-label="Adicionar alocação"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {cell.map((e) => (
                                      <CellChip
                                        key={e.id}
                                        escala={e}
                                        onClick={() => setModal({ mode: "edit", escala: e })}
                                        onDragStart={() => setDragEscala(e)}
                                        onDragEnd={() => {
                                          setDragEscala(null);
                                          setDragOverKey(null);
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EscalaModal
        state={modal}
        onClose={() => setModal(null)}
        pessoas={pessoas}
        programas={programas}
        ilhas={ilhas}
      />

      <OcorrenciasPanel
        open={painelOpen}
        onOpenChange={setPainelOpen}
        ocorrencias={ocorrencias}
      />

      <ExportEscalaModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        inicio={start}
        fim={end}
        pessoas={pessoas}
        programas={programas}
        ilhas={ilhas}
        conteudos={conteudos}
        escalas={exportEscalas}
        initialFilters={{
          conteudos: fConteudo !== ALL ? [fConteudo] : [],
          programas: fPrograma !== ALL ? [fPrograma] : [],
          ilhas: fIlha !== ALL ? [fIlha] : [],
          pessoas: [],
        }}
        onRangeChange={(a, b) => setExportRange({ start: a, end: b })}
      />
    </div>
  );
}

function CellChip({
  escala,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  escala: EscalaCompleta;
  onClick: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const trabalhando = escala.status === "Trabalhando";
  const cor = escala.programa?.cor ?? "#64748b";
  const situacoes = useSituacoes();
  const meta = STATUS_META[escala.status];
  const corStatus = corSituacao(situacoes, escala.status);

  const dragProps = {
    draggable: true,
    onDragStart: (ev: DragEvent) => {
      ev.dataTransfer.effectAllowed = "copy";
      ev.dataTransfer.setData("text/plain", escala.id);
      onDragStart?.();
    },
    onDragEnd: () => onDragEnd?.(),
  };

  if (!trabalhando) {
    return (
      <button
        {...dragProps}
        onClick={onClick}
        title="Arraste para copiar para outro colaborador"
        className={cn(
          "w-full cursor-grab rounded-md border px-2 py-1.5 text-left text-xs transition-transform hover:scale-[1.02] active:cursor-grabbing",
          meta?.chip,
        )}
        style={
          meta
            ? undefined
            : {
                backgroundColor: hexToSoftBg(corStatus, 0.16),
                borderColor: hexToSoftBg(corStatus, 0.4),
                color: corStatus,
              }
        }
      >
        <span className="flex items-center gap-1.5 font-semibold">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", meta?.dot)}
            style={meta ? undefined : { backgroundColor: corStatus }}
          />
          {escala.status}
        </span>
      </button>
    );
  }

  return (
    <button
      {...dragProps}
      onClick={onClick}
      title="Arraste para copiar para outro colaborador"
      className="w-full cursor-grab overflow-hidden rounded-md border px-2 py-1.5 text-left transition-transform hover:scale-[1.02] active:cursor-grabbing"
      style={{
        backgroundColor: hexToSoftBg(cor, 0.16),
        borderColor: hexToSoftBg(cor, 0.4),
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        <span className="truncate text-xs font-semibold leading-tight text-foreground">
          {escala.programa?.nome ?? "Sem programa"}
        </span>
      </div>
      {(escala.hora_inicio || escala.ilha) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          {escala.hora_inicio && (
            <span>
              {escala.hora_inicio.slice(0, 5)}
              {escala.hora_fim ? `–${escala.hora_fim.slice(0, 5)}` : ""}
            </span>
          )}
          {escala.ilha && <span>· {escala.ilha.nome}</span>}
        </div>
      )}
      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {escala.modalidade === "TV" ? "Presencial" : "Home Office"}
      </div>
    </button>
  );
}

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
      <SelectTrigger className="h-9 w-auto min-w-[120px] gap-1">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: Todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
