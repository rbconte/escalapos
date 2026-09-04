import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { supabase } from "@/integrations/supabase/client";
import { ilhasQuery, pessoasQuery, programasQuery, todasFeriasQuery } from "@/lib/queries";
import {
  conflitosOperacionais,
  desmaterializarSituacaoFeriado,
  invalidateOperacional,
  materializarSituacaoFeriado,
  type ConflitoOperacional,
} from "@/lib/sync";
import { PROGRAMA_CORES, contrastText, hexToSoftBg } from "@/lib/domain";
import {
  addDays,
  br,
  calcularAlertas,
  ESCOPOS,
  feriadoEscalasQuery,
  feriadosConfigQuery,
  finsDeSemana,
  grupoMembrosQuery,
  gruposPlantaoQuery,
  iso,
  montarFeriados,
  SITUACOES_FERIADO,
  TIPOS_GRUPO,
  type Alerta,
  type Feriado,
  type FeriadoEscala,
  type GrupoPlantao,
} from "@/lib/feriados";

export const Route = createFileRoute("/feriados-plantoes")({
  head: () => ({
    meta: [
      { title: "Grupos de Feriados e Plantões — Escala Operacional" },
      {
        name: "description",
        content:
          "Escala de feriados nacionais e de São Paulo, divisão dos grupos de plantão de fim de semana e alertas de conflito com férias.",
      },
      {
        property: "og:title",
        content: "Grupos de Feriados e Plantões — Escala Operacional",
      },
      {
        property: "og:description",
        content:
          "Organize plantões de feriados e fins de semana com alertas automáticos de conflito de férias.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gruposPlantaoQuery()),
      context.queryClient.ensureQueryData(grupoMembrosQuery()),
      context.queryClient.ensureQueryData(feriadosConfigQuery()),
      context.queryClient.ensureQueryData(feriadoEscalasQuery()),
      context.queryClient.ensureQueryData(pessoasQuery()),
      context.queryClient.ensureQueryData(todasFeriasQuery()),
    ]);
  },
  component: FeriadosPlantoesPage,
});

const CORES = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#ca8a04",
  ...PROGRAMA_CORES,
];

function FeriadosPlantoesPage() {
  const qc = useQueryClient();
  const [ano, setAno] = useState(() => new Date().getFullYear());

  const { data: grupos } = useSuspenseQuery(gruposPlantaoQuery());
  const { data: membros } = useSuspenseQuery(grupoMembrosQuery());
  const { data: configs } = useSuspenseQuery(feriadosConfigQuery());
  const { data: escalas } = useSuspenseQuery(feriadoEscalasQuery());
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: ferias } = useSuspenseQuery(todasFeriasQuery());

  const nomePessoa = (id: string) =>
    pessoas.find((p) => p.id === id)?.nome ?? "—";

  const feriados = useMemo(() => montarFeriados(ano, configs), [ano, configs]);

  const alertas = useMemo(
    () =>
      calcularAlertas({
        grupos,
        membros,
        feriados,
        escalas,
        ferias: ferias.map((f) => ({
          id: f.id,
          pessoa_id: f.pessoa_id,
          data_inicio: f.data_inicio,
          data_fim: f.data_fim,
          status: f.status,
        })),
        nomePessoa,
      }),
    [grupos, membros, feriados, escalas, ferias, pessoas],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["grupos_plantao"] });
    qc.invalidateQueries({ queryKey: ["grupo_plantao_membros"] });
    qc.invalidateQueries({ queryKey: ["feriados_config"] });
    qc.invalidateQueries({ queryKey: ["feriado_escalas"] });
  };

  /* ----------------------------- feriado dialog ---------------------------- */
  const [fOpen, setFOpen] = useState(false);
  const [fEdit, setFEdit] = useState<Feriado | null>(null);
  const [fNome, setFNome] = useState("");
  const [fData, setFData] = useState("");
  const [fEscopo, setFEscopo] = useState<string>("Personalizado");
  const [fIni, setFIni] = useState("");
  const [fFim, setFFim] = useState("");
  const [fObs, setFObs] = useState("");
  const [fAtivo, setFAtivo] = useState(true);

  function openFeriado(f: Feriado | null) {
    setFEdit(f);
    setFNome(f?.nome ?? "");
    setFData(f?.data ?? `${ano}-01-01`);
    setFEscopo(f?.escopo ?? "Personalizado");
    setFIni(f?.plantaoInicio ?? f?.data ?? `${ano}-01-01`);
    setFFim(f?.plantaoFim ?? f?.data ?? `${ano}-01-01`);
    setFObs(f?.config?.observacao ?? "");
    setFAtivo(f?.ativo ?? true);
    setFOpen(true);
  }

  const salvarFeriado = useMutation({
    mutationFn: async () => {
      if (!fNome.trim()) throw new Error("Informe o nome do feriado.");
      if (!fData) throw new Error("Informe a data do feriado.");
      if (fFim < fIni) throw new Error("A data final do plantão é anterior à inicial.");
      const payload = {
        data: fData,
        nome: fNome.trim(),
        escopo: fEscopo,
        plantao_inicio: fIni || fData,
        plantao_fim: fFim || fData,
        observacao: fObs.trim() || null,
        ativo: fAtivo,
        customizado: fEdit ? fEdit.customizado : true,
      };
      const { error } = await supabase
        .from("feriados_config")
        .upsert(payload, { onConflict: "data" });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setFOpen(false);
      toast.success("Feriado atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetFeriado = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feriados_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Personalização removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ----------------------------- escala dialog ----------------------------- */
  const [eOpen, setEOpen] = useState(false);
  const [eFeriado, setEFeriado] = useState<Feriado | null>(null);
  const [eData, setEData] = useState("");
  const [ePessoas, setEPessoas] = useState<string[]>([]);
  const [eGrupo, setEGrupo] = useState<string>("none");
  const [eSituacao, setESituacao] = useState<string>("Trabalha");
  const [eIni, setEIni] = useState("");
  const [eFim, setEFim] = useState("");

  const membrosDoGrupo = (grupoId: string) =>
    membros.filter((m) => m.grupo_id === grupoId).map((m) => m.pessoa_id);

  /** Ao escolher um grupo, já traz automaticamente os colaboradores dele. */
  function escolherGrupo(id: string) {
    setEGrupo(id);
    setEPessoas(id === "none" ? [] : membrosDoGrupo(id));
  }

  function togglePessoa(id: string, on: boolean) {
    setEPessoas((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  function openEscala(f: Feriado) {
    setEFeriado(f);
    setEData(f.plantaoInicio);
    setEPessoas([]);
    setEGrupo("none");
    setESituacao("Trabalha");
    setEIni("");
    setEFim("");
    setEOpen(true);
  }

  const salvarEscala = useMutation({
    mutationFn: async () => {
      if (ePessoas.length === 0)
        throw new Error("Selecione um grupo ou ao menos um colaborador.");
      const { error } = await supabase.from("feriado_escalas").upsert(
        ePessoas.map((pessoa_id) => ({
          data: eData,
          pessoa_id,
          grupo_id: eGrupo === "none" ? null : eGrupo,
          situacao: eSituacao,
          hora_inicio: eIni || null,
          hora_fim: eFim || null,
        })),
        { onConflict: "data,pessoa_id" },
      );
      if (error) throw error;
      // Folga no feriado reflete na Escala Operacional e no Planejamento Macro.
      if (eSituacao === "Folga") {
        await materializarSituacaoFeriado(ePessoas, [eData], "Folga");
      } else {
        await desmaterializarSituacaoFeriado(ePessoas, [eData], "Folga");
      }
    },
    onSuccess: () => {
      invalidate();
      invalidateOperacional(qc);
      setEOpen(false);
      toast.success(
        ePessoas.length > 1
          ? `${ePessoas.length} colaboradores escalados.`
          : "Escala de feriado registrada.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerEscala = useMutation({
    mutationFn: async (registro: FeriadoEscala) => {
      const { error } = await supabase
        .from("feriado_escalas")
        .delete()
        .eq("id", registro.id);
      if (error) throw error;
      if (registro.situacao === "Folga") {
        await desmaterializarSituacaoFeriado([registro.pessoa_id], [registro.data], "Folga");
      }
    },
    onSuccess: () => {
      invalidate();
      invalidateOperacional(qc);
      toast.success("Registro removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  /* ------------------------------ grupo dialog ----------------------------- */
  const [gOpen, setGOpen] = useState(false);
  const [gEdit, setGEdit] = useState<GrupoPlantao | null>(null);
  const [gNome, setGNome] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gCor, setGCor] = useState(CORES[0]);
  const [gTipo, setGTipo] = useState<string>("Plantão");
  const [gOrdem, setGOrdem] = useState("0");
  const [gAtivo, setGAtivo] = useState(true);
  const [gMembros, setGMembros] = useState<string[]>([]);

  function openGrupo(g: GrupoPlantao | null) {
    setGEdit(g);
    setGNome(g?.nome ?? "");
    setGDesc(g?.descricao ?? "");
    setGCor(g?.cor ?? CORES[0]);
    setGTipo(g?.tipo ?? "Plantão");
    setGOrdem(String(g?.ordem ?? grupos.length));
    setGAtivo(g?.ativo ?? true);
    setGMembros(
      g ? membros.filter((m) => m.grupo_id === g.id).map((m) => m.pessoa_id) : [],
    );
    setGOpen(true);
  }

  const salvarGrupo = useMutation({
    mutationFn: async () => {
      if (!gNome.trim()) throw new Error("Informe o nome do grupo.");
      const payload = {
        nome: gNome.trim(),
        descricao: gDesc.trim() || null,
        cor: gCor,
        tipo: gTipo,
        ordem: Number(gOrdem) || 0,
        ativo: gAtivo,
      };
      let grupoId = gEdit?.id;
      if (gEdit) {
        const { error } = await supabase
          .from("grupos_plantao")
          .update(payload)
          .eq("id", gEdit.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("grupos_plantao")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        grupoId = data.id;
      }
      if (!grupoId) return;
      const atuais = membros
        .filter((m) => m.grupo_id === grupoId)
        .map((m) => m.pessoa_id);
      const add = gMembros.filter((p) => !atuais.includes(p));
      const del = atuais.filter((p) => !gMembros.includes(p));
      if (add.length) {
        const { error } = await supabase
          .from("grupo_plantao_membros")
          .insert(add.map((pessoa_id) => ({ grupo_id: grupoId!, pessoa_id })));
        if (error) throw error;
      }
      if (del.length) {
        const { error } = await supabase
          .from("grupo_plantao_membros")
          .delete()
          .eq("grupo_id", grupoId)
          .in("pessoa_id", del);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      setGOpen(false);
      toast.success(gEdit ? "Grupo atualizado." : "Grupo criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirGrupo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grupos_plantao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Grupo excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* --------------------------- fins de semana ------------------------------ */
  const gruposPlantao = grupos.filter(
    (g) => g.ativo && (g.tipo === "Plantão" || g.tipo === "Ambos"),
  );
  const hoje = iso(new Date());
  const escalaFds = useMemo(() => {
    if (!gruposPlantao.length) return [];
    const fds = finsDeSemana(ano);
    return fds.map((w, i) => {
      const grupo = gruposPlantao[i % gruposPlantao.length];
      const ids = membros.filter((m) => m.grupo_id === grupo.id).map((m) => m.pessoa_id);
      const emFerias = ferias
        .filter(
          (f) =>
            f.status !== "Cancelada" &&
            ids.includes(f.pessoa_id) &&
            f.data_inicio <= w.fim &&
            w.inicio <= f.data_fim,
        )
        .map((f) => nomePessoa(f.pessoa_id));
      return { ...w, grupo, total: ids.length, emFerias: [...new Set(emFerias)] };
    });
  }, [ano, grupos, membros, ferias, pessoas]);

  const proximosFds = escalaFds.filter((w) => w.fim >= hoje).slice(0, 12);

  const escalasDoFeriado = (f: Feriado): FeriadoEscala[] =>
    escalas
      .filter((e) => e.data >= f.plantaoInicio && e.data <= f.plantaoFim)
      .sort((a, b) => a.data.localeCompare(b.data));

  return (
    <PageShell
      title="Grupos de Feriados e Plantões"
      description="Escala de feriados, divisão dos grupos de plantão e alertas de conflito com férias"
      icon={<CalendarClock className="h-4.5 w-4.5" />}
      actions={
        <div className="flex items-center gap-2">
          {alertas.length > 0 && (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" />
              {alertas.length} alerta{alertas.length > 1 ? "s" : ""}
            </Badge>
          )}
          <div className="flex items-center gap-1 rounded-md border bg-card px-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno((a) => a - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-sm font-semibold">{ano}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno((a) => a + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => openGrupo(null)}>
            <Plus className="mr-1 h-4 w-4" /> Novo grupo
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="feriados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feriados">Feriados</TabsTrigger>
          <TabsTrigger value="grupos">Grupos de plantão</TabsTrigger>
          <TabsTrigger value="fds">Fins de semana</TabsTrigger>
          <TabsTrigger value="alertas">
            Alertas {alertas.length > 0 && `(${alertas.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ FERIADOS ----------------------------- */}
        <TabsContent value="feriados" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => openFeriado(null)}>
              <Plus className="mr-1 h-4 w-4" /> Feriado personalizado
            </Button>
          </div>
          <div className="space-y-3">
            {feriados.map((f) => {
              const lista = escalasDoFeriado(f);
              return (
                <Card key={f.data} className={f.ativo ? "" : "opacity-55"}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{f.nome}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {br(f.data)} · {f.escopo}
                        {f.customizado && " · personalizado"}
                      </p>
                      <p className="mt-1 text-xs">
                        <span className="text-muted-foreground">Plantão: </span>
                        <span className="font-medium">
                          {br(f.plantaoInicio)} → {br(f.plantaoFim)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEscala(f)}>
                        <Users className="mr-1 h-3.5 w-3.5" /> Escalar
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFeriado(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {f.config && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => resetFeriado.mutate(f.config!.id)}
                          title={f.customizado ? "Excluir feriado" : "Restaurar padrão"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  {lista.length > 0 && (
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Colaborador</TableHead>
                            <TableHead>Grupo</TableHead>
                            <TableHead>Situação</TableHead>
                            <TableHead>Horário</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lista.map((e) => {
                            const g = grupos.find((x) => x.id === e.grupo_id);
                            return (
                              <TableRow key={e.id}>
                                <TableCell className="text-xs">{br(e.data)}</TableCell>
                                <TableCell className="text-sm font-medium">
                                  {nomePessoa(e.pessoa_id)}
                                </TableCell>
                                <TableCell>
                                  {g ? (
                                    <Badge
                                      variant="outline"
                                      style={{
                                        backgroundColor: hexToSoftBg(g.cor),
                                        borderColor: g.cor,
                                        color: g.cor,
                                      }}
                                    >
                                      {g.nome}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">{e.situacao}</TableCell>
                                <TableCell className="text-xs">
                                  {e.hora_inicio ? `${e.hora_inicio.slice(0, 5)}–${(e.hora_fim ?? "").slice(0, 5)}` : "—"}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => removerEscala.mutate(e)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ------------------------------- GRUPOS ------------------------------ */}
        <TabsContent value="grupos" className="space-y-3">
          {grupos.length === 0 && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum grupo cadastrado. Crie o primeiro grupo de plantão.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map((g) => {
              const ids = membros.filter((m) => m.grupo_id === g.id).map((m) => m.pessoa_id);
              return (
                <Card key={g.id} className={g.ativo ? "" : "opacity-60"}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: g.cor }}
                        />
                        {g.nome}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {g.tipo} · {ids.length} pessoa{ids.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openGrupo(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => excluirGrupo.mutate(g.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {g.descricao && (
                      <p className="text-xs text-muted-foreground">{g.descricao}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {ids.map((id) => (
                        <span
                          key={id}
                          className="rounded-full border px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: hexToSoftBg(g.cor),
                            borderColor: g.cor,
                            color: contrastText(g.cor) === "#ffffff" ? g.cor : g.cor,
                          }}
                        >
                          {nomePessoa(id)}
                        </span>
                      ))}
                      {ids.length === 0 && (
                        <span className="text-xs text-muted-foreground">Sem membros</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* --------------------------- FINS DE SEMANA -------------------------- */}
        <TabsContent value="fds">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Divisão dos plantões de fim de semana — {ano}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Rodízio automático entre os grupos ativos de plantão, em ordem.
              </p>
            </CardHeader>
            <CardContent>
              {gruposPlantao.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Crie grupos do tipo "Plantão" para gerar o rodízio.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fim de semana</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proximosFds.map((w) => (
                      <TableRow key={w.inicio}>
                        <TableCell className="text-sm">
                          {br(w.inicio)} – {br(w.fim)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            style={{
                              backgroundColor: hexToSoftBg(w.grupo.cor),
                              borderColor: w.grupo.cor,
                              color: w.grupo.cor,
                            }}
                          >
                            {w.grupo.nome}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {w.total} pessoa{w.total === 1 ? "" : "s"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {w.emFerias.length ? (
                            <span className="text-destructive">
                              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                              Férias: {w.emFerias.join(", ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">OK</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ ALERTAS ------------------------------ */}
        <TabsContent value="alertas" className="space-y-2">
          {alertas.length === 0 && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum conflito identificado entre grupos, plantões e férias.
            </p>
          )}
          {alertas.map((a: Alerta) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                a.severidade === "alta"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-warning/40 bg-warning/10"
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  a.severidade === "alta" ? "text-destructive" : "text-warning"
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="text-xs text-muted-foreground">{a.detalhe}</p>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* ---------------------------- Dialog feriado --------------------------- */}
      <Dialog open={fOpen} onOpenChange={setFOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{fEdit ? "Editar feriado" : "Novo feriado personalizado"}</DialogTitle>
            <DialogDescription>
              Ajuste o período do plantão quando a escala customizada começar antes ou
              terminar depois do feriado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Nome</Label>
              <Input value={fNome} onChange={(e) => setFNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Data do feriado</Label>
                <Input
                  type="date"
                  value={fData}
                  disabled={!!fEdit && !fEdit.customizado}
                  onChange={(e) => {
                    setFData(e.target.value);
                    if (!fIni) setFIni(e.target.value);
                    if (!fFim) setFFim(e.target.value);
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Escopo</Label>
                <Select value={fEscopo} onValueChange={setFEscopo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESCOPOS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Início do plantão</Label>
                <Input type="date" value={fIni} onChange={(e) => setFIni(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Fim do plantão</Label>
                <Input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setFIni(addDays(fData, -1)); setFFim(fData); }}>
                Véspera + feriado
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setFIni(fData); setFFim(addDays(fData, 1)); }}>
                Feriado + dia seguinte
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label>Observação</Label>
              <Textarea rows={2} value={fObs} onChange={(e) => setFObs(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={fAtivo} onCheckedChange={setFAtivo} id="f-ativo" />
              <Label htmlFor="f-ativo">Feriado ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvarFeriado.mutate()} disabled={salvarFeriado.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------- Dialog escala ---------------------------- */}
      <Dialog open={eOpen} onOpenChange={setEOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Escalar no feriado</DialogTitle>
            <DialogDescription>
              {eFeriado
                ? `${eFeriado.nome} · plantão de ${br(eFeriado.plantaoInicio)} a ${br(eFeriado.plantaoFim)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={eData}
                  min={eFeriado?.plantaoInicio}
                  max={eFeriado?.plantaoFim}
                  onChange={(e) => setEData(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Situação</Label>
                <Select value={eSituacao} onValueChange={setESituacao}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SITUACOES_FERIADO.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Grupo</Label>
              <Select value={eGrupo} onValueChange={escolherGrupo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome} ({membrosDoGrupo(g.id).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ao escolher um grupo, os colaboradores dele já vêm marcados automaticamente.
              </p>
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Colaboradores</Label>
                <span className="text-xs text-muted-foreground">
                  {ePessoas.length} selecionado(s)
                </span>
              </div>
              <div className="max-h-44 space-y-1 overflow-auto rounded-md border p-2 scroll-thin">
                {pessoas.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={ePessoas.includes(p.id)}
                      onCheckedChange={(v) => togglePessoa(p.id, v === true)}
                    />
                    <span className="truncate">{p.nome}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Ajuste manualmente incluindo ou retirando pessoas antes de salvar.
              </p>
            </div>
            {eSituacao === "Folga" && (
              <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                A folga será lançada também na Escala Operacional e no Planejamento Macro.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Hora início</Label>
                <Input type="time" value={eIni} onChange={(e) => setEIni(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Hora fim</Label>
                <Input type="time" value={eFim} onChange={(e) => setEFim(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvarEscala.mutate()} disabled={salvarEscala.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------- Dialog grupo ---------------------------- */}
      <Dialog open={gOpen} onOpenChange={setGOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{gEdit ? "Editar grupo" : "Novo grupo"}</DialogTitle>
            <DialogDescription>
              Defina a equipe que cobre plantões de feriados e fins de semana.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Nome</Label>
                <Input value={gNome} onChange={(e) => setGNome(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={gTipo} onValueChange={setGTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_GRUPO.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Input value={gDesc} onChange={(e) => setGDesc(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5">
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setGCor(c)}
                    className={`h-6 w-6 rounded-full border-2 ${gCor === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Membros</Label>
              <div className="max-h-52 space-y-1 overflow-auto rounded-md border p-2 scroll-thin">
                {pessoas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={gMembros.includes(p.id)}
                      onCheckedChange={(v) =>
                        setGMembros((prev) =>
                          v ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                        )
                      }
                    />
                    {p.nome}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Ordem no rodízio</Label>
                <Input value={gOrdem} onChange={(e) => setGOrdem(e.target.value)} />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch checked={gAtivo} onCheckedChange={setGAtivo} id="g-ativo" />
                <Label htmlFor="g-ativo">Ativo</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvarGrupo.mutate()} disabled={salvarGrupo.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
