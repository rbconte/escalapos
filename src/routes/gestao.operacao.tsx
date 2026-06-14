import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionCard } from "@/components/gestao/kpi-card";
import { useGestao } from "@/lib/gestao/use-gestao";
import {
  alocacaoPorIlha,
  alocacaoPorPrograma,
  escalasPorData,
  horasPorPessoa,
} from "@/lib/gestao/metricas";

export const Route = createFileRoute("/gestao/operacao")({
  component: Operacao,
});

function Operacao() {
  const g = useGestao();
  const programas = alocacaoPorPrograma(g.escalas);
  const ilhas = alocacaoPorIlha(g.escalas, g.periodo.from, g.periodo.to);
  const serie = escalasPorData(g.escalas, g.periodo.from, g.periodo.to);
  const horas = horasPorPessoa(g.escalas);
  const ranking = g.pessoasFiltradas
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      horas: horas.get(p.id)?.horas ?? 0,
      escalas: horas.get(p.id)?.escalas ?? 0,
    }))
    .sort((a, b) => b.horas - a.horas);

  const semAlocacao = ranking.filter((r) => r.horas === 0);
  const top = ranking.filter((r) => r.horas > 0).slice(0, 8);
  const menos = ranking.filter((r) => r.horas > 0).slice(-5).reverse();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Alocação por programa" description="Horas trabalhadas no período">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={programas.slice(0, 10)} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={110}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="horas" radius={[0, 6, 6, 0]}>
                  {programas.slice(0, 10).map((p) => (
                    <Cell key={p.id} fill={p.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Ocupação por ilha" description="Horas utilizadas no período">
          <div className="space-y-2">
            {ilhas.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>
            )}
            {ilhas.map((i) => (
              <div key={i.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{i.nome}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {i.horas.toFixed(0)}h · {(i.ocupacao * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, i.ocupacao * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Distribuição de escalas" description="Escalas registradas por dia">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey="escalas"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Mais alocados">
          <RankingList items={top} />
        </SectionCard>
        <SectionCard title="Menos alocados">
          <RankingList items={menos} />
        </SectionCard>
        <SectionCard title={`Sem alocação (${semAlocacao.length})`}>
          {semAlocacao.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Todo mundo está alocado.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {semAlocacao.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>{r.nome}</span>
                  <span className="text-xs text-muted-foreground">—</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function RankingList({
  items,
}: {
  items: { id: string; nome: string; horas: number; escalas: number }[];
}) {
  if (items.length === 0)
    return <p className="py-4 text-sm text-muted-foreground">Sem dados no período.</p>;
  const max = Math.max(...items.map((i) => i.horas), 1);
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{r.nome}</span>
            <span className="tabular-nums text-muted-foreground">{r.horas.toFixed(0)}h</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${(r.horas / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
