import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { EmptyRow } from "@/routes/funcoes";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { conteudosQuery, programaNecessidadesQuery, programasQuery } from "@/lib/queries";
import {
  PROGRAMA_CORES,
  contrastText,
  type ProgramaComConteudo,
} from "@/lib/domain";

const DIAS_SEMANA = [
  { idx: 1, label: "Segunda" },
  { idx: 2, label: "Terça" },
  { idx: 3, label: "Quarta" },
  { idx: 4, label: "Quinta" },
  { idx: 5, label: "Sexta" },
  { idx: 6, label: "Sábado" },
  { idx: 0, label: "Domingo" },
] as const;


const NONE = "__none__";

export const Route = createFileRoute("/programas")({
  head: () => ({
    meta: [
      { title: "Programas — Escala Operacional" },
      { name: "description", content: "Cadastro de programas e projetos com cores." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(programasQuery());
    context.queryClient.ensureQueryData(conteudosQuery());
    context.queryClient.ensureQueryData(programaNecessidadesQuery());
  },
  component: ProgramasPage,
});

function ProgramasPage() {
  const { data: programas } = useSuspenseQuery(programasQuery());
  const { data: conteudos } = useSuspenseQuery(conteudosQuery());
  const { data: necessidades } = useSuspenseQuery(programaNecessidadesQuery());

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProgramaComConteudo | null>(null);
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [cor, setCor] = useState(PROGRAMA_CORES[0]);
  const [conteudoId, setConteudoId] = useState(NONE);
  const [toDelete, setToDelete] = useState<ProgramaComConteudo | null>(null);
  const [necessidade, setNecessidade] = useState<Record<number, number>>({
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0,
  });


  const filtered = useMemo(
    () =>
      programas.filter(
        (p) =>
          p.nome.toLowerCase().includes(search.toLowerCase()) ||
          (p.sigla ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [programas, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome do programa.");
      const payload = {
        nome: nome.trim(),
        sigla: sigla.trim() || null,
        cor,
        tipo_conteudo_id: conteudoId === NONE ? null : conteudoId,
      };
      if (editing) {
        const { error } = await supabase.from("programas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("programas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programas"] });
      qc.invalidateQueries({ queryKey: ["escalas"] });
      setOpen(false);
      toast.success(editing ? "Programa atualizado." : "Programa criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("programas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programas"] });
      qc.invalidateQueries({ queryKey: ["escalas"] });
      setToDelete(null);
      toast.success("Programa excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setNome("");
    setSigla("");
    setCor(PROGRAMA_CORES[Math.floor(Math.random() * PROGRAMA_CORES.length)]);
    setConteudoId(NONE);
    setOpen(true);
  }
  function openEdit(p: ProgramaComConteudo) {
    setEditing(p);
    setNome(p.nome);
    setSigla(p.sigla ?? "");
    setCor(p.cor);
    setConteudoId(p.tipo_conteudo_id ?? NONE);
    setOpen(true);
  }


  return (
    <PageShell
      title="Programas"
      description="Programas e projetos com cor de identificação na escala."
      icon={<Tv className="h-5 w-5" />}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo programa
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar programas..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border bg-card shadow-soft">
            <EmptyRow text="Nenhum programa cadastrado." />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-card"
              >
                <span
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: p.cor }}
                />
                <div className="flex items-start justify-between pl-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold"
                      style={{ backgroundColor: p.cor, color: contrastText(p.cor) }}
                    >
                      {(p.sigla || p.nome).slice(0, 3).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-display font-semibold leading-tight">{p.nome}</p>
                      {p.conteudo ? (
                        <span
                          className="mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            color: p.conteudo.cor,
                            borderColor: p.conteudo.cor,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: p.conteudo.cor }}
                          />
                          {p.conteudo.nome}
                        </span>
                      ) : p.sigla ? (
                        <p className="text-xs text-muted-foreground">{p.sigla}</p>
                      ) : null}
                    </div>

                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar programa" : "Novo programa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                autoFocus
                placeholder="Ex.: Jornal Nacional"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sigla">Sigla</Label>
              <Input
                id="sigla"
                value={sigla}
                placeholder="Ex.: JN"
                maxLength={8}
                onChange={(e) => setSigla(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo (área editorial)</Label>
              <Select value={conteudoId} onValueChange={setConteudoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um conteúdo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem conteúdo</SelectItem>
                  {conteudos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PROGRAMA_CORES.map((c) => (
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
            <AlertDialogTitle>Excluir programa?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.nome}" será removido. As escalas vinculadas ficarão sem programa.
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
