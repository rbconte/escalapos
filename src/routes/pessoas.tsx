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
import { funcoesQuery, pessoasQuery } from "@/lib/queries";
import { STATUS_PESSOA, type PessoaComFuncao } from "@/lib/domain";

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

function PessoasPage() {
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { data: funcoes } = useSuspenseQuery(funcoesQuery());
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PessoaComFuncao | null>(null);
  const [nome, setNome] = useState("");
  const [funcaoId, setFuncaoId] = useState<string>(NONE);
  const [status, setStatus] = useState<string>("Ativo");
  const [toDelete, setToDelete] = useState<PessoaComFuncao | null>(null);

  const filtered = useMemo(
    () =>
      pessoas.filter(
        (p) =>
          p.nome.toLowerCase().includes(search.toLowerCase()) ||
          (p.funcao?.nome ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [pessoas, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome do colaborador.");
      const payload = {
        nome: nome.trim(),
        funcao_id: funcaoId === NONE ? null : funcaoId,
        status,
      };
      if (editing) {
        const { error } = await supabase.from("pessoas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pessoas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pessoas"] });
      setOpen(false);
      toast.success(editing ? "Colaborador atualizado." : "Colaborador criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pessoas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pessoas"] });
      qc.invalidateQueries({ queryKey: ["escalas"] });
      setToDelete(null);
      toast.success("Colaborador excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setNome("");
    setFuncaoId(NONE);
    setStatus("Ativo");
    setOpen(true);
  }
  function openEdit(p: PessoaComFuncao) {
    setEditing(p);
    setNome(p.nome);
    setFuncaoId(p.funcao_id ?? NONE);
    setStatus(p.status);
    setOpen(true);
  }

  return (
    <PageShell
      title="Pessoas"
      description="Colaboradores disponíveis para alocação na escala."
      icon={<Users className="h-5 w-5" />}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo colaborador
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome ou função..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {filtered.length === 0 ? (
            <EmptyRow text="Nenhum colaborador cadastrado." />
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
                    {p.funcao?.nome ?? "Sem função"}
                  </p>
                </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                autoFocus
                placeholder="Ex.: Maria Souza"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={funcaoId} onValueChange={setFuncaoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem função</SelectItem>
                  {funcoes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_PESSOA.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
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
