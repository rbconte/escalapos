import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { EmptyRow } from "@/routes/funcoes";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { invalidateOperacional, limparProjecoesDeEscalas } from "@/lib/sync";

import { funcoesQuery, pessoasQuery } from "@/lib/queries";
import { JORNADAS, STATUS_PESSOA, type PessoaComFuncao } from "@/lib/domain";

export const Route = createFileRoute("/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — Escala Operacional" },
      { name: "description", content: "Cadastro de colaboradores da equipe." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(pessoasQuery());
    context.queryClient.ensureQueryData(funcoesQuery());
  },
  component: PessoasPage,
});

const NONE = "__none__";
const ANY = "__any__";

type FormState = {
  nome: string;
  matricula: string;
  funcaoId: string;
  position: string;
  data_contratacao: string;
  telefone: string;
  email_corporativo: string;
  email_pessoal: string;
  contato_emergencia: string;
  endereco: string;
  jornada_padrao: string;
  status: string;
  vacation_status: string;
  vacation_control_start: string;
  pending_vacation_days: string;
  overdue_vacation_days: string;
  vacation_setup_notes: string;
};

const NONE_VAC = "__none_vac__";

const EMPTY_FORM: FormState = {
  nome: "",
  matricula: "",
  funcaoId: NONE,
  position: "",
  data_contratacao: "",
  telefone: "",
  email_corporativo: "",
  email_pessoal: "",
  contato_emergencia: "",
  endereco: "",
  jornada_padrao: "8h",
  status: "Ativo",
  vacation_status: NONE_VAC,
  vacation_control_start: "",
  pending_vacation_days: "0",
  overdue_vacation_days: "0",
  vacation_setup_notes: "",
};

function PessoasPage() {
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: funcoes } = useSuspenseQuery(funcoesQuery());
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filtroFuncao, setFiltroFuncao] = useState<string>(ANY);
  const [filtroStatus, setFiltroStatus] = useState<string>(ANY);
  const [filtroContratDe, setFiltroContratDe] = useState("");
  const [filtroContratAte, setFiltroContratAte] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PessoaComFuncao | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<PessoaComFuncao | null>(null);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return pessoas.filter((p) => {
      const matchSearch =
        !s ||
        p.nome.toLowerCase().includes(s) ||
        (p.matricula ?? "").toLowerCase().includes(s) ||
        (p.position ?? "").toLowerCase().includes(s) ||
        (p.funcao?.nome ?? "").toLowerCase().includes(s);
      const matchFuncao = filtroFuncao === ANY || p.funcao_id === filtroFuncao;
      const matchStatus = filtroStatus === ANY || p.status === filtroStatus;
      const matchDe = !filtroContratDe || (p.data_contratacao ?? "") >= filtroContratDe;
      const matchAte = !filtroContratAte || (p.data_contratacao ?? "9999") <= filtroContratAte;
      return matchSearch && matchFuncao && matchStatus && matchDe && matchAte;
    });
  }, [pessoas, search, filtroFuncao, filtroStatus, filtroContratDe, filtroContratAte]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do colaborador.");
      if (form.vacation_status === "em_dia" && !form.vacation_control_start) {
        throw new Error("Informe a data inicial de controle de férias.");
      }
      if (form.vacation_status === "pendente" && !(parseInt(form.pending_vacation_days, 10) > 0)) {
        throw new Error("Informe a quantidade de dias pendentes.");
      }
      if (form.vacation_status === "vencida" && !(parseInt(form.overdue_vacation_days, 10) > 0)) {
        throw new Error("Informe a quantidade de dias vencidos.");
      }
      const payload = {
        nome: form.nome.trim(),
        matricula: form.matricula.trim() || null,
        funcao_id: form.funcaoId === NONE ? null : form.funcaoId,
        position: form.position.trim() || null,
        data_contratacao: form.data_contratacao || null,
        telefone: form.telefone.trim() || null,
        email_corporativo: form.email_corporativo.trim() || null,
        email_pessoal: form.email_pessoal.trim() || null,
        contato_emergencia: form.contato_emergencia.trim() || null,
        endereco: form.endereco.trim() || null,
        jornada_padrao: form.jornada_padrao || null,
        status: form.status,
        vacation_status: form.vacation_status === NONE_VAC ? null : form.vacation_status,
        vacation_control_start: form.vacation_control_start || null,
        pending_vacation_days:
          form.vacation_status === "pendente" ? parseInt(form.pending_vacation_days || "0", 10) : 0,
        overdue_vacation_days:
          form.vacation_status === "vencida" ? parseInt(form.overdue_vacation_days || "0", 10) : 0,
        vacation_setup_notes: form.vacation_setup_notes.trim() || null,
      } as never;
      if (editing) {
        const { error } = await supabase.from("pessoas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pessoas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateOperacional(qc);
      setOpen(false);
      toast.success(editing ? "Colaborador atualizado." : "Colaborador criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Limpa a demanda derivada antes de excluir o colaborador (sem órfãos).
      await limparProjecoesDeEscalas((q) => q.eq("pessoa_id", id));
      const { error: escErr } = await supabase.from("escalas").delete().eq("pessoa_id", id);
      if (escErr) throw escErr;
      const { error } = await supabase.from("pessoas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateOperacional(qc);
      setToDelete(null);
      toast.success("Colaborador excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }
  function openEdit(p: PessoaComFuncao) {
    setEditing(p);
    const pAny = p as unknown as Record<string, unknown>;
    setForm({
      nome: p.nome,
      matricula: p.matricula ?? "",
      funcaoId: p.funcao_id ?? NONE,
      position: p.position ?? "",
      data_contratacao: p.data_contratacao ?? "",
      telefone: p.telefone ?? "",
      email_corporativo: p.email_corporativo ?? "",
      email_pessoal: p.email_pessoal ?? "",
      contato_emergencia: p.contato_emergencia ?? "",
      endereco: p.endereco ?? "",
      jornada_padrao: p.jornada_padrao ?? "8h",
      status: p.status,
      vacation_status: (pAny.vacation_status as string) ?? NONE_VAC,
      vacation_control_start: (pAny.vacation_control_start as string) ?? "",
      pending_vacation_days: String((pAny.pending_vacation_days as number) ?? 0),
      overdue_vacation_days: String((pAny.overdue_vacation_days as number) ?? 0),
      vacation_setup_notes: (pAny.vacation_setup_notes as string) ?? "",
    });
    setOpen(true);
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <PageShell
      title="Pessoas"
      description="Cadastro de colaboradores: dados pessoais, operacionais e status."
      icon={<Users className="h-5 w-5" />}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo colaborador
        </Button>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="grid gap-3 rounded-xl border bg-card p-3 shadow-soft md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nome, matrícula, cargo ou função..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filtroFuncao} onValueChange={setFiltroFuncao}>
            <SelectTrigger><SelectValue placeholder="Função" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todas as funções</SelectItem>
              {funcoes.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos os status</SelectItem>
              {STATUS_PESSOA.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filtroContratDe}
            onChange={(e) => setFiltroContratDe(e.target.value)}
            aria-label="Contratado de"
          />
          <Input
            type="date"
            value={filtroContratAte}
            onChange={(e) => setFiltroContratAte(e.target.value)}
            aria-label="Contratado até"
          />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {filtered.length === 0 ? (
            <EmptyRow text="Nenhum colaborador encontrado." />
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t" : ""}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {p.nome.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.nome}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[p.matricula, p.position ?? p.funcao?.nome ?? "Sem função"]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                </div>
                <div className="hidden text-xs text-muted-foreground sm:block">
                  {p.jornada_padrao ?? "—"}
                </div>
                {(() => {
                  const vStatus = (p as unknown as { vacation_status?: string }).vacation_status;
                  const needsSetup = p.data_contratacao && !vStatus;
                  if (needsSetup) {
                    return (
                      <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
                        🟠 Configurar férias
                      </Badge>
                    );
                  }
                  if (vStatus === "em_dia")
                    return <Badge className="bg-success/15 text-success hover:bg-success/15">🟢 Em dia</Badge>;
                  if (vStatus === "pendente")
                    return <Badge className="bg-warning/15 text-warning hover:bg-warning/15">🟡 Pendente</Badge>;
                  if (vStatus === "vencida")
                    return <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">🚨 Vencida</Badge>;
                  return null;
                })()}
                <Badge
                  variant={p.status === "Ativo" ? "default" : "secondary"}
                  className={p.status === "Ativo" ? "bg-success/15 text-success hover:bg-success/15" : ""}
                >
                  {p.status}
                </Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setToDelete(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="pessoais" className="pt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pessoais">Dados Pessoais</TabsTrigger>
              <TabsTrigger value="operacionais">Dados Operacionais</TabsTrigger>
              <TabsTrigger value="ferias">Férias</TabsTrigger>
            </TabsList>
            <TabsContent value="pessoais" className="space-y-3 pt-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Nome completo</Label>
                  <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>Matrícula</Label>
                  <Input value={form.matricula} onChange={(e) => set("matricula", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de contratação</Label>
                  <Input type="date" value={form.data_contratacao}
                    onChange={(e) => set("data_contratacao", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Contato de emergência</Label>
                  <Input value={form.contato_emergencia}
                    onChange={(e) => set("contato_emergencia", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail corporativo</Label>
                  <Input type="email" value={form.email_corporativo}
                    onChange={(e) => set("email_corporativo", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail pessoal</Label>
                  <Input type="email" value={form.email_pessoal}
                    onChange={(e) => set("email_pessoal", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Endereço</Label>
                  <Textarea rows={2} value={form.endereco}
                    onChange={(e) => set("endereco", e.target.value)} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="operacionais" className="space-y-3 pt-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Função</Label>
                  <Select value={form.funcaoId} onValueChange={(v) => set("funcaoId", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem função</SelectItem>
                      {funcoes.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cargo (Position)</Label>
                  <Input value={form.position} onChange={(e) => set("position", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Jornada padrão</Label>
                  <Select value={form.jornada_padrao} onValueChange={(v) => set("jornada_padrao", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JORNADAS.map((j) => (
                        <SelectItem key={j} value={j}>{j}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_PESSOA.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="ferias" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Configuração inicial de férias para colaboradores existentes. Registros anteriores
                à data de início do controle serão ignorados.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Status inicial de férias</Label>
                  <Select
                    value={form.vacation_status}
                    onValueChange={(v) => set("vacation_status", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VAC}>Não configurado</SelectItem>
                      <SelectItem value="em_dia">Em dia</SelectItem>
                      <SelectItem value="pendente">Saldo pendente</SelectItem>
                      <SelectItem value="vencida">Férias vencidas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.vacation_status === "em_dia" && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Data de início do controle de férias *</Label>
                    <Input
                      type="date"
                      value={form.vacation_control_start}
                      onChange={(e) => set("vacation_control_start", e.target.value)}
                    />
                  </div>
                )}
                {form.vacation_status === "pendente" && (
                  <>
                    <div className="space-y-2">
                      <Label>Dias pendentes *</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.pending_vacation_days}
                        onChange={(e) => set("pending_vacation_days", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de início do controle</Label>
                      <Input
                        type="date"
                        value={form.vacation_control_start}
                        onChange={(e) => set("vacation_control_start", e.target.value)}
                      />
                    </div>
                  </>
                )}
                {form.vacation_status === "vencida" && (
                  <>
                    <div className="space-y-2">
                      <Label>Dias vencidos *</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.overdue_vacation_days}
                        onChange={(e) => set("overdue_vacation_days", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de início do controle</Label>
                      <Input
                        type="date"
                        value={form.vacation_control_start}
                        onChange={(e) => set("vacation_control_start", e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={form.vacation_setup_notes}
                    onChange={(e) => set("vacation_setup_notes", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.nome}" e todas as escalas vinculadas serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
