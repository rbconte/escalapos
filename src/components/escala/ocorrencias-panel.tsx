import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { OcorrenciaComPessoa } from "@/lib/queries";

function formatarData(dataISO: string) {
  return format(parseISO(dataISO), "dd/MM/yyyy (EEE)", { locale: ptBR });
}

export function OcorrenciasPanel({
  open,
  onOpenChange,
  ocorrencias,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ocorrencias: OcorrenciaComPessoa[];
}) {
  const qc = useQueryClient();

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("ocorrencias")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abertas = ocorrencias.filter((o) => o.status === "Aberta");
  const resolvidas = ocorrencias.filter((o) => o.status === "Resolvida");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Validações operacionais
          </SheetTitle>
          <SheetDescription>
            Alertas trabalhistas e operacionais detectados automaticamente. Não
            bloqueiam as escalas — apenas sinalizam.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 scroll-thin">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Em aberto
              <Badge variant="destructive">{abertas.length}</Badge>
            </h3>
            {abertas.length === 0 ? (
              <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Nenhuma inconformidade em aberto.
              </p>
            ) : (
              <div className="space-y-2">
                {abertas.map((o) => (
                  <OcorrenciaCard
                    key={o.id}
                    ocorrencia={o}
                    onResolve={() =>
                      setStatus.mutate({ id: o.id, status: "Resolvida" })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {resolvidas.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                Resolvidas
                <Badge variant="secondary">{resolvidas.length}</Badge>
              </h3>
              <div className="space-y-2">
                {resolvidas.map((o) => (
                  <OcorrenciaCard
                    key={o.id}
                    ocorrencia={o}
                    resolved
                    onReopen={() =>
                      setStatus.mutate({ id: o.id, status: "Aberta" })
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OcorrenciaCard({
  ocorrencia,
  resolved,
  onResolve,
  onReopen,
}: {
  ocorrencia: OcorrenciaComPessoa;
  resolved?: boolean;
  onResolve?: () => void;
  onReopen?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        resolved ? "opacity-70" : "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {ocorrencia.pessoa?.nome ?? "Colaborador"}
          </div>
          <div className="text-xs font-medium text-warning-foreground">
            {ocorrencia.tipo}
          </div>
        </div>
        {resolved ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onReopen}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reabrir
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onResolve}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
          </Button>
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {ocorrencia.descricao}
      </p>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Data</dt>
        <dd className="font-medium">{formatarData(ocorrencia.data)}</dd>
        {ocorrencia.valor_encontrado && (
          <>
            <dt className="text-muted-foreground">Encontrado</dt>
            <dd className="font-medium text-destructive">
              {ocorrencia.valor_encontrado}
            </dd>
          </>
        )}
        {ocorrencia.valor_exigido && (
          <>
            <dt className="text-muted-foreground">Exigido</dt>
            <dd className="font-medium">{ocorrencia.valor_exigido}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Botão da toolbar que abre o painel, com badge da contagem em aberto. */
export function OcorrenciasButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" className="relative gap-2" onClick={onClick}>
      <AlertTriangle
        className={cn("h-4 w-4", count > 0 && "text-warning")}
      />
      Validações
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count}
        </span>
      )}
    </Button>
  );
}

