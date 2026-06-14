import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Briefcase, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { funcoesQuery } from "@/lib/queries";
import type { Funcao } from "@/lib/domain";

export const Route = createFileRoute("/funcoes")({
  head: () => ({
    meta: [
      { title: "Funções — Escala Operacional" },
      { name: "description", content: "Cadastro de funções da equipe." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(funcoesQuery()),
  component: FuncoesPage,
});

function FuncoesPage() {
  const { data: funcoes } = useSuspenseQuery(funcoesQuery());
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Funcao | null>(null);
  const [nome, setNome] = useState("");
  const [toDelete, setToDelete] = useState<Funcao | null>(null);

  const filtered = useMemo(
    () =>
      funcoes.filter((f) =>
        f.nome.toLowerCase().includes(search.toLowerCase()),
      ),
    [funcoes, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome da função.");
      if (editing) {
        const { error } = await supabase
          .from("funcoes")
          .update({ nome: nome.trim() })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("funcoes").insert({ nome: nome.trim() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funcoes"] });
      setOpen(false);
      toast.success(editing ? "Função atualizada." : "Função criada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funcoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funcoes"] });
      qc.invalidateQueries({ queryKey: ["pessoas"] });
      setToDelete(null);
      toast.success("Função excluída.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setNome("");
    setOpen(true);
  }
  function openEdit(f: Funcao) {
    setEditing(f);
    setNome(f.nome);
    setOpen(true);
  }

  return (
    <PageShell
      title="Funções"
      description="Defina as funções exercidas pela equipe."
      icon={<Briefcase className="h-5 w-5" />}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Nova função
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar funções..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {filtered.length === 0 ? (
            <EmptyRow text="Nenhuma função cadastrada." />
          ) : (
            filtered.map((f, i) => (
              <div
                key={f.id}
                className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t" : ""}`}
              >
                <span className="font-medium">{f.nome}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(f)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setToDelete(f)}
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
            <DialogTitle>{editing ? "Editar função" : "Nova função"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="nome">Nome da função</Label>
            <Input
              id="nome"
              value={nome}
              autoFocus
              placeholder="Ex.: Editor, Finalizador, Operador"
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save.mutate()}
            />
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
            <AlertDialogTitle>Excluir função?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.nome}" será removida permanentemente.
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

export function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}
