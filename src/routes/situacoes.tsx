import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CircleDot, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { situacoesQuery, type Situacao } from "@/lib/queries";
import { PROGRAMA_CORES, contrastText, hexToSoftBg } from "@/lib/domain";

const CORES_STATUS = [
  "#16a34a",
  "#0ea5e9",
  "#ef4444",
  "#f59e0b",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#94a3b8",
  "#64748b",
  "#475569",
  ...PROGRAMA_CORES,
];

export const Route = createFileRoute("/situacoes")({
  head: () => ({
    meta: [
      { title: "Situações — Escala Operacional" },
      {
        name: "description",
        content:
          "Cadastro dos status de escala (férias, folgas, licenças, treinamento) com cor de identificação.",
      },
      { property: "og:title", content: "Situações — Escala Operacional" },
      {
        property: "og:description",
        content: "Gerencie os status de escala e suas cores de identificação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(situacoesQuery()),
  component: SituacoesPage,
});

function SituacoesPage() {
  const { data: situacoes } = useSuspenseQuery(situacoesQuery());
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Situacao | null>(null);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES_STATUS[0]);
  const [ordem, setOrdem] = useState("0");
  const [ativo, setAtivo] = useState(true);
  const [especial, setEspecial] = useState(true);
  const [toDelete, setToDelete] = useState<Situacao | null>(null);

  const filtered = useMemo(
    () =>
      situacoes.filter((s) =>
        s.nome.toLowerCase().includes(search.toLowerCase()),
      ),
    [situacoes, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome da situação.");
      const payload = {
        nome: nome.trim(),
        cor,
        ordem: Number(ordem) || 0,
        ativo,
        especial,
      };
      if (editing) {
        const { error } = await supabase
          .from("situacoes")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("situacoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["situacoes"] });
      setOpen(false);
      toast.success(editing ? "Situação atualizada." : "Situação criada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("situacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["situacoes"] });
      setToDelete(null);
      toast.success("Situação excluída.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setNome("");
    setCor(CORES_STATUS[Math.floor(Math.random() * CORES_STATUS.length)]);
    setOrdem(String(situacoes.length));
    setAtivo(true);
    setEspecial(true);
    setOpen(true);
  }

  function openEdit(s: Situacao) {
    setEditing(s);
    setNome(s.nome);
    setCor(s.cor);
    setOrdem(String(s.ordem));
    setAtivo(s.ativo);
    setEspecial(s.especial);
    setOpen(true);
  }

  return (
    <PageShell
      title="Situações"
      description="Status usados na escala e no planejamento (férias, folgas, licenças) com cor de identificação."
      icon={<CircleDot className="h-5 w-5" />}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Nova situação
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar situações..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border bg-card shadow-soft">
            <EmptyRow text="Nenhuma situação cadastrada." />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="group relative overflow-hidden rounded-xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-card"
              >
                <span
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: s.cor }}
                />
                <div className="flex items-start justify-between pl-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold"
                      style={{ backgroundColor: s.cor, color: contrastText(s.cor) }}
                    >
                      {s.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-display font-semibold leading-tight">
                        {s.nome}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span
                          className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: hexToSoftBg(s.cor, 0.15),
                            borderColor: hexToSoftBg(s.cor, 0.4),
                            color: s.cor,
                          }}
                        >
                          {s.especial ? "Situação especial" : "Operacional"}
                        </span>
                        {!s.ativo && (
                          <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Inativa
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setToDelete(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar situação" : "Nova situação"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                autoFocus
                value={nome}
                placeholder="Ex.: Folga Compensatória"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap items-center gap-2">
                {CORES_STATUS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCor(c)}
                    className={`h-8 w-8 rounded-lg transition-transform hover:scale-110 ${cor === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem de exibição</Label>
                <Input
                  id="ordem"
                  type="number"
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value)}
                />
              </div>
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs">Situação especial</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Sem programa vinculado
                    </p>
                  </div>
                  <Switch checked={especial} onCheckedChange={setEspecial} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Ativa</Label>
                  <Switch checked={ativo} onCheckedChange={setAtivo} />
                </div>
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
            <AlertDialogTitle>Excluir situação?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.nome}" deixará de aparecer nas listas de status. Os
              lançamentos já feitos com esse status permanecem inalterados.
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
