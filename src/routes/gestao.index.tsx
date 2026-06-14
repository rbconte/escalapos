import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarCheck,
  CalendarX,
  Plane,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSuspenseQuery } from "@tanstack/react-query";

import { KpiCard, SectionCard } from "@/components/gestao/kpi-card";
import { useGestao } from "@/lib/gestao/use-gestao";
import { escalasQuery } from "@/lib/queries";
import { periodoAnterior } from "@/lib/gestao/filtros";
import {
  calcularOcupacao,
  contarStatus,
  escalasPorData,
  filtrarEscalas,
  pessoasAtivas,
  pessoasEmFerias,
  pessoasEmLicenca,
} from "@/lib/gestao/metricas";

export const Route = createFileRoute("/gestao/")({
  component: VisaoGeral,
});

function VisaoGeral() {
  const g = useGestao();
  const hojeISO = format(new Date(), "yyyy-MM-dd");

  const ativos = pessoasAtivas(g.pessoasFiltradas).length;
  const alocadosHoje = contarStatus(g.escalas, hojeISO, "Trabalhando");
  const folgaHoje =
    contarStatus(g.escalas, hojeISO, "Folga") +
    contarStatus(g.escalas, hojeISO, "Folga Semanal") +
    contarStatus(g.escalas, hojeISO, "Folga Domingo") +
    contarStatus(g.escalas, hojeISO, "Folga Aniversário");
  const feriasHoje = pessoasEmFerias(g.ferias, hojeISO).size;
  const licencaHoje = pessoasEmLicenca(g.licencas, hojeISO).size;
  const ocorrenciasAbertas = g.ocorrencias.filter((o) => o.status === "Aberta").length;

  const ocupacao = calcularOcupacao(g.escalas, g.pessoasFiltradas, g.periodo.from, g.periodo.to);

  const prev = periodoAnterior(g.periodo.from, g.periodo.to);
  const { data: escalasPrev } = useSuspenseQuery(escalasQuery(prev.from, prev.to));
  const escalasPrevFiltradas = filtrarEscalas(escalasPrev, g.search);
  const ocupacaoPrev = calcularOcupacao(
    escalasPrevFiltradas,
    g.pessoasFiltradas,
    prev.from,
    prev.to,
  );

  const trendOcupacao = (ocupacao.taxa - ocupacaoPrev.taxa) * 100;

  const serie = escalasPorData(g.escalas, g.periodo.from, g.periodo.to);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          label="Colaboradores ativos"
          value={ativos}
          icon={<Users className="h-4 w-4" />}
          tone="primary"
        />
        <KpiCard
          label="Alocados hoje"
          value={alocadosHoje}
          hint={`${ativos > 0 ? Math.round((alocadosHoje / ativos) * 100) : 0}% da equipe`}
          icon={<CalendarCheck className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Em folga hoje"
          value={folgaHoje}
          icon={<CalendarX className="h-4 w-4" />}
        />
        <KpiCard
          label="Em férias"
          value={feriasHoje}
          icon={<Plane className="h-4 w-4" />}
          tone="info"
        />
        <KpiCard
          label="Em licença"
          value={licencaHoje}
          icon={<Stethoscope className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Ocorrências abertas"
          value={ocorrenciasAbertas}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone={ocorrenciasAbertas > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Taxa de ocupação"
          value={`${(ocupacao.taxa * 100).toFixed(1)}%`}
          hint={`${ocupacao.horasAlocadas.toFixed(0)}h / ${ocupacao.horasDisponiveis.toFixed(0)}h`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="primary"
          trend={{ delta: trendOcupacao }}
        />
        <KpiCard
          label="Horas alocadas"
          value={`${ocupacao.horasAlocadas.toFixed(0)}h`}
          hint={g.periodo.label}
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <SectionCard
        title="Ocupação diária"
        description="Horas alocadas por dia no período selecionado"
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradHoras" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="horas"
                stroke="var(--color-primary)"
                fill="url(#gradHoras)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}
