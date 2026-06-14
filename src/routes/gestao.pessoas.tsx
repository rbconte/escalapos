import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/gestao/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useGestao } from "@/lib/gestao/use-gestao";
import {
  diasDeFolgaPorPessoa,
  pessoasEmFerias,
  pessoasEmLicenca,
} from "@/lib/gestao/metricas";

export const Route = createFileRoute("/gestao/pessoas")({
  component: GestaoPessoas,
});

const TIPOS_OCORRENCIA = [
  "Falta",
  "Atraso",
  "Advertência",
  "Elogio",
  "Observação",
  "Outros",
];

function GestaoPessoas() {
  const g = useGestao();
  const qc = useQueryClient();
  const hojeISO = format(new Date(), "yyyy-MM-dd");

  const folgasPorPessoa = diasDeFolgaPorPessoa(g.escalas);
  const feriasHoje = pessoasEmFerias(g.ferias, hojeISO);
  const licencaHoje = pessoasEmLicenca(g.licencas, hojeISO);

  const linhas = useMemo(() => {
    return g.pessoasFiltradas.map((p) => {
      const ocorrencias = g.ocorrencias.filter((o) => o.pessoa_id === p.id);
      return {
        pessoa: p,
        folgas: folgasPorPessoa.get(p.id) ?? 0,
        emFerias: feriasHoje.has(p.id),
        emLicenca: licencaHoje.has(p.id),
        ocorrencias: ocorrencias.length,
        abertas: ocorrencias.filter((o) => o.status === "Aberta").length,
      };
    });
  }, [g.pessoasFiltradas, g.ocorrencias, folgasPorPessoa, feriasHoje, licencaHoje]);

  // ---- Modal de Ocorrência ----
  const [open, setOpen] = useState(false);
  const [pessoaId, setPessoaId] = useState<string>("");
  const [data, setData] = useState(hojeISO);
  const [tipo, setTipo] = useState(TIPOS_OCORRENCIA[0]);
  const [descricao, setDescricao] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      if (!pessoaId) throw new Error("Selecione um colaborador.");
      if (!descricao.trim()) throw new Error("Descreva a ocorrência.");
      const { error } = await supabase.from("ocorrencias").insert({
        pessoa_id: pessoaId,
        data,
        tipo,
        descricao: descricao.trim(),
        status: "Aberta",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
      toast.success("Ocorrência registrada.");
      setOpen(false);
      setDescricao("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("ocorrencias").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ocorrencias"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ocorrencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
      toast.success("Ocorrência removida.");
    },
  });

  function abrirNovo(id?: string) {
    setPessoaId(id ?? g.pessoasFiltradas[0]?.id ?? "");
    setData(hojeISO);
    setTipo(TIPOS_OCORRENCIA[0]);
    setDescricao("");
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Colaboradores"
        description="Folgas no período, status e ocorrências por pessoa"
        actions={
          <Button size="sm" onClick={() => abrirNovo()}>
            <Plus className="h-4 w-4" /> Ocorrência
          </Button>
        }
      >
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Colaborador</th>
                <th className="px-3 py-2 text-left font-medium">Função</th>
                <th className="px-3 py-2 text-right font-medium">Folgas</th>
                <th className="px-3 py-2 text-center font-medium">Status hoje</th>
                <th className="px-3 py-2 text-right font-medium">Ocorrências</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum colaborador encontrado.
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={l.pessoa.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{l.pessoa.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {l.pessoa.funcao?.nome ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.folgas}</td>
                  <td className="px-3 py-2 text-center">
                    {l.emFerias ? (
                      <Badge className="bg-chart-5/15 text-chart-5 hover:bg-chart-5/15">
                        Férias
                      </Badge>
                    ) : l.emLicenca ? (
                      <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                        Licença
                      </Badge>
                    ) : l.pessoa.status === "Ativo" ? (
                      <Badge variant="secondary">Ativo</Badge>
                    ) : (
                      <Badge variant="outline">{l.pessoa.status}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span>{l.ocorrencias}</span>
                    {l.abertas > 0 && (
                      <Badge className="ml-2 bg-destructive/15 text-destructive hover:bg-destructive/15">
                        {l.abertas} aberta{l.abertas > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => abrirNovo(l.pessoa.id)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Ocorrências"
        description="Histórico de eventos registrados"
      >
        {g.ocorrencias.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma ocorrência registrada ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {g.ocorrencias.slice(0, 25).map((o) => (
              <li key={o.id} className="flex items-start gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.pessoa?.nome ?? "—"}</span>
                    <Badge variant="outline" className="text-xs">
                      {o.tipo}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(o.data), "dd 'de' MMM yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{o.descricao}</p>
                </div>
                <Select
                  value={o.status}
                  onValueChange={(v) => mudarStatus.mutate({ id: o.id, status: v })}
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aberta">Aberta</SelectItem>
                    <SelectItem value="Resolvida">Resolvida</SelectItem>
                    <SelectItem value="Arquivada">Arquivada</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => remover.mutate(o.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova ocorrência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Colaborador</Label>
              <Select value={pessoaId} onValueChange={setPessoaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {g.pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_OCORRENCIA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que aconteceu..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
