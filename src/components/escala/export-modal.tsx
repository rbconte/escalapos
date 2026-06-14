import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type {
  EscalaCompleta,
  Ilha,
  PessoaComFuncao,
  ProgramaComConteudo,
  TipoConteudo,
} from "@/lib/domain";
import {
  buildFileName,
  buildGrupos,
  periodoLabel,
  type ExportConfig,
  type ExportFilters,
  type Formato,
  type OrientacaoPDF,
  type TamanhoPDF,
  type TipoExportacao,
} from "@/lib/export-shared";
import { exportEscalaExcel } from "@/lib/export-excel";
import { exportEscalaPdf } from "@/lib/export-pdf";

export interface ExportModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  inicio: Date;
  fim: Date;
  pessoas: PessoaComFuncao[];
  programas: ProgramaComConteudo[];
  ilhas: Ilha[];
  conteudos: TipoConteudo[];
  escalas: EscalaCompleta[];
  initialFilters?: Partial<ExportFilters>;
  /** Called when the user changes the period — parent may refetch escalas. */
  onRangeChange?: (inicio: Date, fim: Date) => void;
}

const EMPRESA_PADRAO = "Escala Operacional";

export function ExportEscalaModal(props: ExportModalProps) {
  const {
    open,
    onOpenChange,
    pessoas,
    programas,
    ilhas,
    conteudos,
    escalas,
    initialFilters,
    onRangeChange,
  } = props;

  const [formato, setFormato] = useState<Formato>("xlsx");
  const [tipo, setTipo] = useState<TipoExportacao>("completa");
  const [inicio, setInicio] = useState<Date>(props.inicio);
  const [fim, setFim] = useState<Date>(props.fim);

  const [filtros, setFiltros] = useState<ExportFilters>({
    conteudos: initialFilters?.conteudos ?? [],
    programas: initialFilters?.programas ?? [],
    pessoas: initialFilters?.pessoas ?? [],
    ilhas: initialFilters?.ilhas ?? [],
  });

  const [orientacao, setOrientacao] = useState<OrientacaoPDF>("paisagem");
  const [tamanho, setTamanho] = useState<TamanhoPDF>("a3");
  const [exibirCabecalho, setExibirCabecalho] = useState(true);
  const [responsavel, setResponsavel] = useState("");
  const [empresa, setEmpresa] = useState(EMPRESA_PADRAO);
  const [nomeRelatorio, setNomeRelatorio] = useState("Escala Operacional");
  const [exporting, setExporting] = useState(false);

  const inicioIso = format(inicio, "yyyy-MM-dd");
  const fimIso = format(fim, "yyyy-MM-dd");

  const cfg: ExportConfig = useMemo(
    () => ({
      formato,
      tipo,
      inicio: inicioIso,
      fim: fimIso,
      filtros,
      pdf: {
        orientacao,
        tamanho,
        exibirCabecalho,
        responsavel,
      },
      empresa,
      nomeRelatorio,
    }),
    [
      formato,
      tipo,
      inicioIso,
      fimIso,
      filtros,
      orientacao,
      tamanho,
      exibirCabecalho,
      responsavel,
      empresa,
      nomeRelatorio,
    ],
  );

  const escalasNoPeriodo = useMemo(
    () => escalas.filter((e) => e.data >= inicioIso && e.data <= fimIso),
    [escalas, inicioIso, fimIso],
  );

  const resumo = useMemo(() => {
    const { grupos, filteredEscalas } = buildGrupos(
      escalasNoPeriodo,
      pessoas,
      conteudos,
      filtros,
    );
    const colaboradores = new Set<string>();
    for (const cg of grupos) {
      for (const pg of cg.programas) {
        for (const r of pg.pessoas) colaboradores.add(r.pessoa.id);
      }
    }
    const dias = Math.max(
      1,
      Math.round(
        (fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );
    return {
      pessoas: colaboradores.size,
      alocacoes: filteredEscalas.length,
      dias,
    };
  }, [escalasNoPeriodo, pessoas, conteudos, filtros, inicio, fim]);

  const conteudosMap = useMemo(
    () => new Map(conteudos.map((c) => [c.id, c])),
    [conteudos],
  );
  const fileName = buildFileName(cfg, conteudosMap);

  async function handleExport() {
    if (fim < inicio) {
      toast.error("Data final deve ser maior ou igual à inicial.");
      return;
    }
    setExporting(true);
    try {
      const args = {
        cfg,
        escalas: escalasNoPeriodo,
        pessoas,
        conteudos,
        fileName,
      };
      if (formato === "xlsx") exportEscalaExcel(args);
      else exportEscalaPdf(args);
      toast.success("Exportação concluída.");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function setRange(novoInicio: Date, novoFim: Date) {
    setInicio(novoInicio);
    setFim(novoFim);
    onRangeChange?.(novoInicio, novoFim);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exportar Escala</DialogTitle>
          <DialogDescription>
            Configure o conteúdo da exportação antes de gerar o arquivo.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-6 pb-1">
            {/* Formato */}
            <Section title="Formato">
              <RadioGroup
                value={formato}
                onValueChange={(v) => setFormato(v as Formato)}
                className="flex gap-4"
              >
                <RadioCard value="xlsx" id="fmt-xlsx" label="Excel (.xlsx)" />
                <RadioCard value="pdf" id="fmt-pdf" label="PDF (.pdf)" />
              </RadioGroup>
            </Section>

            {/* Período */}
            <Section title="Período">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateField
                  label="Data inicial"
                  value={inicio}
                  onChange={(d) => setRange(d, fim < d ? d : fim)}
                />
                <DateField
                  label="Data final"
                  value={fim}
                  onChange={(d) => setRange(inicio > d ? d : inicio, d)}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Considerando {periodoLabel(inicioIso, fimIso)}.
              </p>
            </Section>

            {/* Tipo de exportação */}
            <Section title="Tipo de exportação">
              <RadioGroup
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoExportacao)}
                className="grid gap-2 sm:grid-cols-2"
              >
                <RadioCard
                  value="completa"
                  id="tipo-completa"
                  label="Escala Completa"
                  description="Layout visual igual à tela, agrupado por Conteúdo → Programa."
                />
                <RadioCard
                  value="filtrada"
                  id="tipo-filtrada"
                  label="Escala Filtrada"
                  description="Lista plana apenas dos registros do filtro."
                />
              </RadioGroup>
            </Section>

            {/* Filtros */}
            <Section title="Filtros">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MultiSelect
                  label="Conteúdo"
                  options={conteudos.map((c) => ({ value: c.id, label: c.nome }))}
                  value={filtros.conteudos}
                  onChange={(v) => setFiltros((f) => ({ ...f, conteudos: v }))}
                  allLabel="Todos"
                />
                <MultiSelect
                  label="Programa"
                  options={programas.map((p) => ({ value: p.id, label: p.nome }))}
                  value={filtros.programas}
                  onChange={(v) => setFiltros((f) => ({ ...f, programas: v }))}
                  allLabel="Todos"
                />
                <MultiSelect
                  label="Colaborador"
                  options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
                  value={filtros.pessoas}
                  onChange={(v) => setFiltros((f) => ({ ...f, pessoas: v }))}
                  allLabel="Todos"
                />
                <MultiSelect
                  label="Ilha"
                  options={ilhas.map((i) => ({ value: i.id, label: i.nome }))}
                  value={filtros.ilhas}
                  onChange={(v) => setFiltros((f) => ({ ...f, ilhas: v }))}
                  allLabel="Todas"
                />
              </div>
            </Section>

            {/* PDF options */}
            {formato === "pdf" && (
              <Section title="Configurações do PDF">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-xs">Orientação</Label>
                    <RadioGroup
                      value={orientacao}
                      onValueChange={(v) => setOrientacao(v as OrientacaoPDF)}
                      className="flex gap-3"
                    >
                      <RadioCard value="paisagem" id="o-p" label="Paisagem" />
                      <RadioCard value="retrato" id="o-r" label="Retrato" />
                    </RadioGroup>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Tamanho do papel</Label>
                    <RadioGroup
                      value={tamanho}
                      onValueChange={(v) => setTamanho(v as TamanhoPDF)}
                      className="flex gap-3"
                    >
                      <RadioCard value="a3" id="t-a3" label="A3" />
                      <RadioCard value="a4" id="t-a4" label="A4" />
                    </RadioGroup>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label className="text-sm">Exibir cabeçalho</Label>
                    <p className="text-xs text-muted-foreground">
                      Mostra empresa, período, data de geração e responsável.
                    </p>
                  </div>
                  <Switch checked={exibirCabecalho} onCheckedChange={setExibirCabecalho} />
                </div>
                {exibirCabecalho && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-xs">Empresa</Label>
                      <Input
                        value={empresa}
                        onChange={(e) => setEmpresa(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Nome do relatório</Label>
                      <Input
                        value={nomeRelatorio}
                        onChange={(e) => setNomeRelatorio(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5 block text-xs">Responsável</Label>
                      <Input
                        value={responsavel}
                        onChange={(e) => setResponsavel(e.target.value)}
                        placeholder="Nome de quem está exportando"
                      />
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Resumo */}
            <Section title="Resumo">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Colaboradores" value={resumo.pessoas} />
                <Stat label="Alocações" value={resumo.alocacoes} />
                <Stat label="Dias" value={resumo.dias} />
              </div>
              <p className="mt-3 break-all text-xs text-muted-foreground">
                Arquivo: <span className="font-mono">{fileName}</span>
              </p>
            </Section>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={exporting || resumo.alocacoes === 0}>
            {exporting ? "Gerando..." : "Exportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function RadioCard({
  value,
  id,
  label,
  description,
}: {
  value: string;
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60"
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 font-normal"
          >
            <CalendarIcon className="h-4 w-4" />
            {format(value, "dd/MM/yyyy", { locale: ptBR })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => d && onChange(d)}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  allLabel: string;
}) {
  const todos = value.length === 0;
  const summary = todos
    ? allLabel
    : value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? "1 selecionado"
      : `${value.length} selecionados`;

  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between gap-2 font-normal"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                todos && "font-semibold",
              )}
              onClick={() => onChange([])}
            >
              <Checkbox checked={todos} />
              {allLabel}
            </button>
          </div>
          <ScrollArea className="max-h-60">
            <div className="p-1">
              {options.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  Nenhuma opção disponível.
                </div>
              )}
              {options.map((o) => {
                const checked = value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => toggle(o.value)}
                  >
                    <Checkbox checked={checked} />
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// re-export for parseISO consumers
export { parseISO };
