import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO } from "date-fns";
import { Check, ChevronsUpDown, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  notificarResumoOcorrencias,
  reprocessarOcorrencias,
} from "@/lib/validacoes";
import {
  MODALIDADES,
  STATUS_ESCALA,
  type EscalaCompleta,
  type Ilha,
  type PessoaComFuncao,
  type Programa,
} from "@/lib/domain";

const NONE = "__none__";

export type EscalaModalState =
  | { mode: "create"; pessoaId: string; data: string; programaId?: string }
  | { mode: "edit"; escala: EscalaCompleta }
  | null;

const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function EscalaModal({
  state,
  onClose,
  pessoas,
  programas,
  ilhas,
}: {
  state: EscalaModalState;
  onClose: () => void;
  pessoas: PessoaComFuncao[];
  programas: Programa[];
  ilhas: Ilha[];
}) {
  const qc = useQueryClient();
  const [pessoaId, setPessoaId] = useState("");
  const [pessoaIds, setPessoaIds] = useState<string[]>([]);
  const [copiarPara, setCopiarPara] = useState<string[]>([]);
  const [programaId, setProgramaId] = useState(NONE);
  const [ilhaId, setIlhaId] = useState(NONE);
  const [dataInicio, setDataInicio] = useState("");
  const [quantidadeDias, setQuantidadeDias] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [horaInicio, setHoraInicio] = useState("14:00");
  const [horaFim, setHoraFim] = useState("23:00");
  const [modalidade, setModalidade] = useState<string>("TV");
  const [status, setStatus] = useState<string>("Trabalhando");
  const [incluirFinaisDeSemana, setIncluirFinaisDeSemana] = useState(true);

  const isEdit = state?.mode === "edit";

  useEffect(() => {
    if (!state) return;
    if (state.mode === "create") {
      setPessoaId(state.pessoaId);
      setPessoaIds(state.pessoaId ? [state.pessoaId] : []);
      setCopiarPara([]);
      setDataInicio(state.data);
      setQuantidadeDias("");
      setDataFim("");
      setProgramaId(state.programaId ?? NONE);
      setIlhaId(NONE);
      setHoraInicio("14:00");
      setHoraFim("23:00");
      setModalidade("TV");
      setStatus("Trabalhando");
      setIncluirFinaisDeSemana(true);
    } else {
      const e = state.escala;
      setPessoaId(e.pessoa_id);
      setPessoaIds([e.pessoa_id]);
      setCopiarPara([]);
      setDataInicio(e.data);
      setQuantidadeDias("");
      setDataFim("");
      setProgramaId(e.programa_id ?? NONE);
      setIlhaId(e.ilha_id ?? NONE);
      setHoraInicio(e.hora_inicio?.slice(0, 5) ?? "");
      setHoraFim(e.hora_fim?.slice(0, 5) ?? "");
      setModalidade(e.modalidade);
      setStatus(e.status);
      setIncluirFinaisDeSemana(true);
    }
  }, [state]);

  const trabalhando = status === "Trabalhando";

  function togglePessoa(id: string) {
    setPessoaIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleCopiarPara(id: string) {
    setCopiarPara((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  // ---- Period auto-calculation handlers (create mode) ----
  function handleInicioChange(v: string) {
    setDataInicio(v);
    if (!isISODate(v)) return;
    const inicio = parseISO(v);
    if (quantidadeDias && Number(quantidadeDias) > 0) {
      setDataFim(format(addDays(inicio, Number(quantidadeDias) - 1), "yyyy-MM-dd"));
    } else if (isISODate(dataFim)) {
      const d = differenceInCalendarDays(parseISO(dataFim), inicio) + 1;
      setQuantidadeDias(d > 0 ? String(d) : "");
    }
  }

  function handleDiasChange(v: string) {
    setQuantidadeDias(v);
    const n = Number(v);
    if (isISODate(dataInicio) && n > 0) {
      setDataFim(format(addDays(parseISO(dataInicio), n - 1), "yyyy-MM-dd"));
    } else if (!v) {
      setDataFim("");
    }
  }

  function handleFimChange(v: string) {
    setDataFim(v);
    if (isISODate(dataInicio) && isISODate(v)) {
      const d = differenceInCalendarDays(parseISO(v), parseISO(dataInicio)) + 1;
      setQuantidadeDias(d > 0 ? String(d) : "");
    }
  }

  /** Resolve and validate the date list for the allocation period. */
  function resolveDatas(): string[] {
    if (!isISODate(dataInicio)) throw new Error("Informe a data de início.");
    const inicio = parseISO(dataInicio);

    let fim = inicio;
    const hasDias = quantidadeDias !== "" && Number(quantidadeDias) > 0;
    const hasFim = isISODate(dataFim);

    if (hasDias && hasFim) {
      const esperado = format(addDays(inicio, Number(quantidadeDias) - 1), "yyyy-MM-dd");
      if (esperado !== dataFim) {
        throw new Error(
          "Divergência: a data de fim não corresponde à quantidade de dias informada.",
        );
      }
      fim = parseISO(dataFim);
    } else if (hasDias) {
      fim = addDays(inicio, Number(quantidadeDias) - 1);
    } else if (hasFim) {
      fim = parseISO(dataFim);
    }

    const total = differenceInCalendarDays(fim, inicio);
    if (total < 0) throw new Error("A data de fim deve ser igual ou posterior à data de início.");

    const todas = Array.from({ length: total + 1 }, (_, i) =>
      format(addDays(inicio, i), "yyyy-MM-dd"),
    );

    const filtradas = incluirFinaisDeSemana
      ? todas
      : todas.filter((d) => !isWeekend(parseISO(d)));

    if (filtradas.length === 0) {
      throw new Error("O período selecionado contém apenas finais de semana.");
    }

    return filtradas;
  }

  const save = useMutation({
    mutationFn: async () => {
      const alvos = isEdit
        ? Array.from(new Set([pessoaId, ...copiarPara]))
        : Array.from(new Set(pessoaIds));
      if (alvos.length === 0 || alvos.some((p) => !p))
        throw new Error("Selecione ao menos um colaborador.");

      const baseSemPessoa = {
        programa_id: trabalhando && programaId !== NONE ? programaId : null,
        ilha_id: trabalhando && ilhaId !== NONE ? ilhaId : null,
        hora_inicio: trabalhando && horaInicio ? horaInicio : null,
        hora_fim: trabalhando && horaFim ? horaFim : null,
        modalidade,
        status,
      };

      const datas = resolveDatas();

      if (isEdit && state?.mode === "edit") {
        // Remove the original record so changing the start date doesn't orphan it.
        const { error: origError } = await supabase
          .from("escalas")
          .delete()
          .eq("id", state.escala.id);
        if (origError) throw origError;
      }

      const novoPrograma = baseSemPessoa.programa_id;
      for (const pid of alvos) {
        // Substitui apenas a alocação do MESMO programa neste período, para que
        // o replanejamento de um programa fique limpo. Alocações de OUTROS
        // programas no mesmo período são mantidas — assim a pessoa pode estar
        // em projetos diferentes ao mesmo tempo, gerando alerta de conflito.
        let del = supabase
          .from("escalas")
          .delete()
          .eq("pessoa_id", pid)
          .in("data", datas);
        del = novoPrograma === null ? del.is("programa_id", null) : del.eq("programa_id", novoPrograma);
        const { error: delError } = await del;
        if (delError) throw delError;

        const rows = datas.map((data) => ({ ...baseSemPessoa, pessoa_id: pid, data }));
        const { error } = await supabase.from("escalas").insert(rows);
        if (error) throw error;
      }

      // Reprocessa validações operacionais (histórico completo dos envolvidos).
      const ocorrencias = await reprocessarOcorrencias(alvos);

      return { pessoas: alvos.length, dias: datas.length, ocorrencias, alvos };
    },
    onSuccess: ({ pessoas: nPessoas, dias, ocorrencias, alvos }) => {
      qc.invalidateQueries({ queryKey: ["escalas"] });
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
      onClose();
      const nomePorPessoa = new Map(pessoas.map((p) => [p.id, p.nome]));
      const ocorrenciasAlvo = ocorrencias.filter((o) => alvos.includes(o.pessoa_id));
      if (ocorrenciasAlvo.length > 0) {
        notificarResumoOcorrencias(ocorrenciasAlvo, nomePorPessoa);
        return;
      }
      if (nPessoas > 1) {
        toast.success(`Alocação aplicada a ${nPessoas} colaboradores (${dias} dia${dias > 1 ? "s" : ""} cada).`);
      } else if (dias > 1) {
        toast.success(`Período salvo: ${dias} dias preenchidos.`);
      } else {
        toast.success("Escala salva.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (state?.mode !== "edit") return;
      const pessoaIdRemovida = state.escala.pessoa_id;
      const { error } = await supabase.from("escalas").delete().eq("id", state.escala.id);
      if (error) throw error;
      await reprocessarOcorrencias([pessoaIdRemovida]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalas"] });
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
      onClose();
      toast.success("Escala removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar alocação" : "Nova alocação por período"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-1">
          <div className="col-span-2 space-y-2">
            <Label>{isEdit ? "Colaborador" : "Colaboradores"}</Label>
            {isEdit ? (
              <Select value={pessoaId} onValueChange={setPessoaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {pessoaIds.length === 0
                          ? "Selecione um ou mais colaboradores"
                          : pessoaIds.length === 1
                            ? pessoas.find((p) => p.id === pessoaIds[0])?.nome ?? "1 selecionado"
                            : `${pessoaIds.length} colaboradores selecionados`}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Buscar colaborador..." />
                      <CommandList>
                        <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                        <CommandGroup>
                          {pessoas.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.nome}
                              onSelect={() => togglePessoa(p.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  pessoaIds.includes(p.id) ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {p.nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {pessoaIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pessoaIds.map((id) => {
                      const p = pessoas.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                        >
                          {p.nome}
                          <button
                            type="button"
                            onClick={() => togglePessoa(id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Remover ${p.nome}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {isEdit && (
            <div className="col-span-2 space-y-2">
              <Label>Copiar alocação também para</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {copiarPara.length === 0
                        ? "Selecione outros colaboradores"
                        : copiarPara.length === 1
                          ? pessoas.find((p) => p.id === copiarPara[0])?.nome ?? "1 selecionado"
                          : `${copiarPara.length} colaboradores selecionados`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Buscar colaborador..." />
                    <CommandList>
                      <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                      <CommandGroup>
                        {pessoas
                          .filter((p) => p.id !== pessoaId)
                          .map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.nome}
                              onSelect={() => toggleCopiarPara(p.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  copiarPara.includes(p.id) ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {p.nome}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {copiarPara.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {copiarPara.map((id) => {
                    const p = pessoas.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                      >
                        {p.nome}
                        <button
                          type="button"
                          onClick={() => toggleCopiarPara(id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Remover ${p.nome}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A alocação (incluindo o período informado abaixo) será aplicada
                também a estes colaboradores.
              </p>
            </div>
          )}

          <>
            <div className="space-y-2">
              <Label htmlFor="dataInicio">
                Data de início <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dataInicio"
                type="date"
                value={dataInicio}
                onChange={(e) => handleInicioChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dias">Quantidade de dias</Label>
              <Input
                id="dias"
                type="number"
                min={1}
                placeholder="Opcional"
                value={quantidadeDias}
                onChange={(e) => handleDiasChange(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="dataFim">Data de fim</Label>
              <Input
                id="dataFim"
                type="date"
                value={dataFim}
                min={dataInicio || undefined}
                onChange={(e) => handleFimChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? "Deixe vazios para alterar apenas este dia, ou informe quantidade de dias / data de fim para aplicar a alteração a todo o período."
                  : "Preencha quantidade de dias ou data de fim. Deixe ambos vazios para alocar apenas o dia de início."}
              </p>
            </div>
            <div className="col-span-2 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Checkbox
                id="fds"
                checked={incluirFinaisDeSemana}
                onCheckedChange={(v) => setIncluirFinaisDeSemana(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="fds" className="cursor-pointer">
                  Considerar finais de semana
                </Label>
                <p className="text-xs text-muted-foreground">
                  {incluirFinaisDeSemana
                    ? "Dias corridos: aloca sábados e domingos do período."
                    : "Apenas dias úteis: aloca somente de segunda a sexta."}
                </p>
              </div>
            </div>
          </>


          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ESCALA.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modalidade</Label>
            <Select value={modalidade} onValueChange={setModalidade} disabled={!trabalhando}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "TV" ? "Presencial (TV)" : m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {trabalhando && (
            <>
              <div className="space-y-2">
                <Label>Programa</Label>
                <Select value={programaId} onValueChange={setProgramaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {programas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: p.cor }}
                          />
                          {p.nome}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ilha</Label>
                <Select value={ilhaId} onValueChange={setIlhaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {ilhas.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hi">Hora início</Label>
                <Input
                  id="hi"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hf">Hora fim</Label>
                <Input
                  id="hf"
                  type="time"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {isEdit ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
