import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KpiCard, SectionCard } from "@/components/gestao/kpi-card";
import { Badge } from "@/components/ui/badge";
import { useGestao } from "@/lib/gestao/use-gestao";
import {
  calcularOcupacao,
  coberturaPorPrograma,
  escalasPorData,
} from "@/lib/gestao/metricas";
import { AlertTriangle, Calendar, Plane, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/gestao/planejamento")({
  component: Planejamento,
});

function Planejamento() {
  const g = useGestao();
  const ocup = calcularOcupacao(g.escalas, g.pessoasFiltradas, g.periodo.from, g.periodo.to);
  const livres = Math.max(0, ocup.horasDisponiveis - ocup.horasAlocadas);
  const utilizacaoPct = ocup.horasDisponiveis > 0 ? ocup.taxa * 100 : 0;

  const cobertura = coberturaPorPrograma(g.escalas);
  const alto = cobertura.filter((c) => c.risco === "alto");
  const medio = cobertura.filter((c) => c.risco === "medio");
  const baixo = cobertura.filter((c) => c.risco === "baixo");

  const serie = escalasPorData(g.escalas, g.periodo.from, g.periodo.to);

  const hojeISO = format(new Date(), "yyyy-MM-dd");
  const feriasFuturas = g.ferias.filter((f) => f.data_fim >= hojeISO);
  const licencasFuturas = g.licencas.filter((l) => l.data_fim >= hojeISO);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Horas disponíveis"
          value={`${ocup.horasDisponiveis.toFixed(0)}h`}
          tone="primary"
        />
        <KpiCard label="Horas alocadas" value={`${ocup.horasAlocadas.toFixed(0)}h`} tone="success" />
        <KpiCard label="Horas livres" value={`${livres.toFixed(0)}h`} />
        <KpiCard
          label="Utilização"
          value={`${utilizacaoPct.toFixed(1)}%`}
          tone={utilizacaoPct > 90 ? "danger" : utilizacaoPct > 70 ? "warning" : "info"}
        />
      </div>

      <SectionCard
        title="Capacidade diária"
        description="Horas alocadas por dia no período"
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="horas" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard
        title="Mapa de cobertura"
        description="Risco operacional por programa baseado na quantidade de pessoas únicas alocadas"
      >
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
            Alto risco · {alto.length}
          </Badge>
          <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
            Médio risco · {medio.length}
          </Badge>
          <Badge className="bg-success/15 text-success hover:bg-success/15">
            Baixo risco · {baixo.length}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <RiskColumn title="Alto risco" tone="danger" items={alto} icon={<AlertTriangle className="h-4 w-4" />} />
          <RiskColumn title="Médio risco" tone="warning" items={medio} />
          <RiskColumn title="Baixo risco" tone="success" items={baixo} />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Férias futuras" description="Aprovadas e programadas">
          {feriasFuturas.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma férias programada.</p>
          ) : (
            <ul className="divide-y">
              {feriasFuturas.slice(0, 12).map((f) => {
                const pessoa = g.pessoas.find((p) => p.id === f.pessoa_id);
                return (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-5/15 text-chart-5">
                      <Plane className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{pessoa?.nome ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(f.data_inicio), "dd 'de' MMM", { locale: ptBR })} →{" "}
                        {format(parseISO(f.data_fim), "dd 'de' MMM yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <Badge variant="outline">{f.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Ausências programadas" description="Licenças e afastamentos">
          {licencasFuturas.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma licença programada.</p>
          ) : (
            <ul className="divide-y">
              {licencasFuturas.slice(0, 12).map((l) => {
                const pessoa = g.pessoas.find((p) => p.id === l.pessoa_id);
                return (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground">
                      <Stethoscope className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{pessoa?.nome ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.tipo} ·{" "}
                        {format(parseISO(l.data_inicio), "dd MMM", { locale: ptBR })} →{" "}
                        {format(parseISO(l.data_fim), "dd MMM yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function RiskColumn({
  title,
  tone,
  items,
  icon,
}: {
  title: string;
  tone: "danger" | "warning" | "success";
  items: { id: string; nome: string; cor: string; pessoas: number }[];
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : "border-success/30 bg-success/5";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 10).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: c.cor }}
                />
                <span className="truncate">{c.nome}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.pessoas} pessoa{c.pessoas === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
