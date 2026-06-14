import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { EmptyRow } from "@/routes/funcoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { conteudosQuery } from "@/lib/queries";
import { PROGRAMA_CORES, contrastText, type TipoConteudo } from "@/lib/domain";

export const Route = createFileRoute("/conteudos")({
  head: () => ({
    meta: [
      { title: "Conteúdos — Escala Operacional" },
      {
        name: "description",
        content:
          "Cadastro de tipos de conteúdo (áreas editoriais) com cor e ordem de exibição na escala.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(conteudosQuery()),
  component: ConteudosPage,
});

function ConteudosPage() {
  const { data: conteudos } = useSuspenseQuery(conteudosQuery());
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TipoConteudo | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(PROGRAMA_CORES[0]);
  const [ativo, setAtivo] = useState(true);
  const [ordem, setOrdem] = useState("0");
  const [toDelete, setToDelete] = useState<TipoConteudo | null>(null);

  const filtered = useMemo(
    () =>
      conteudos.filter((c) =>
        c.nome.toLowerCase().includes(search.toLowerCase()),
      ),
    [conteudos, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome do conteúdo.");
      const payload = {
        nome: nome.trim(),
        cor,
        ativo,
        ordem: Number(ordem) || 0,
      };
      if (editing) {
        const { error } = await supabase
          .from("tipos_conteudo")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tipos_conteudo").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conteudos"] });
      qc.invalidateQueries({ queryKey: ["programas"] });
      qc.invalidateQueries({ queryKey: ["escalas"] });
      setOpen(false);
      toast.success(editing ? "Conteúdo atualizado." : "Conteúdo criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tipos_conteudo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conteudos"] });
      qc.invalidateQueries({ queryKey: ["programas"] });
      qc.invalidateQueries({ queryKey: ["escalas"] });
      setToDelete(null);
      toast.success("Conteúdo excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setNome("");
    setCor(PROGRAMA_CORES[Math.floor(Math.random() * PROGRAMA_CORES.length)]);
    setAtivo(true);
    setOrdem(String((conteudos.at(-1)?.ordem ?? 0) + 1));
    setOpen(true);
  }
  function openEdit(c: TipoConteudo) {
    setEditing(c);
    setNome(c.nome);
    setCor(c.cor);
    setAtivo(c.ativo);
    setOrdem(String(c.ordem));
    setOpen(true);
  }

  return (
    <PageShell
      title="Conteúdos"
      description="Áreas editoriais que agrupam os programas e organizam a escala."
      icon={<Layers className="h-5 w-5" />}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo conteúdo
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar conteúdos..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {filtered.length === 0 ? (
            <EmptyRow text="Nenhum conteúdo cadastrado." />
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                    style={{ backgroundColor: c.cor, color: contrastText(c.cor) }}
                  >
                    {c.ordem}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium leading-tight">{c.nome}</p>
                    {!c.ativo && (
                      <p className="text-xs text-muted-foreground">Inativo</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setToDelete(c)}
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
            <DialogTitle>{editing ? "Editar conteúdo" : "Novo conteúdo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                autoFocus
                placeholder="Ex.: Jornalismo, Esporte, Entretenimento"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem de exibição</Label>
                <Input
                  id="ordem"
                  type="number"
                  min={0}
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ativo">Ativo</Label>
                <div className="flex h-9 items-center gap-2">
                  <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
                  <span className="text-sm text-muted-foreground">
                    {ativo ? "Visível na escala" : "Oculto na escala"}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PROGRAMA_CORES.map((co) => (
                  <button
                    key={co}
                    type="button"
                    onClick={() => setCor(co)}
                    className={`h-8 w-8 rounded-lg transition-transform hover:scale-110 ${cor === co ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                    style={{ backgroundColor: co }}
                    aria-label={`Cor ${co}`}
                  />
                ))}
                <label className="flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-lg border">
                  <input
                    type="color"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    className="h-12 w-12 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              </div>
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
            <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.nome}" será removido. Os programas vinculados ficarão sem
              conteúdo.
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
