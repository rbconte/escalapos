import { createFileRoute } from "@tanstack/react-router";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { format } from "date-fns";

import { SectionCard } from "@/components/gestao/kpi-card";
import { useGestao } from "@/lib/gestao/use-gestao";
import { horasDeEscala, pessoasEmFerias, pessoasEmLicenca } from "@/lib/gestao/metricas";

export const Route = createFileRoute("/gestao/conteudos")({
  component: Conteudos,
});

function Conteudos() {
  const g = useGestao();
  const hojeISO = format(new Date(), "yyyy-MM-dd");
  const feriasIds = pessoasEmFerias(g.ferias, hojeISO);
  const licencasIds = pessoasEmLicenca(g.licencas, hojeISO);

  const linhas = g.conteudos.map((c) => {
    const programasC = g.programas.filter(
      (p) => p.tipo_conteudo_id === c.id || p.conteudo?.id === c.id,
    );
    const progIds = new Set(programasC.map((p) => p.id));
    const escalasC = g.escalas.filter((e) => e.programa_id && progIds.has(e.programa_id));
    const pessoasIds = new Set(escalasC.map((e) => e.pessoa_id));
    const horas = escalasC
      .filter((e) => e.status === "Trabalhando")
      .reduce((acc, e) => acc + horasDeEscala(e), 0);
    const pessoasC = g.pessoas.filter(
      (p) => p.tipo_conteudo_id === c.id || pessoasIds.has(p.id),
    );
    const ocorr = g.ocorrencias.filter((o) =>
      pessoasC.some((p) => p.id === o.pessoa_id),
    ).length;
    const ferias = pessoasC.filter((p) => feriasIds.has(p.id)).length;
    const licen = pessoasC.filter((p) => licencasIds.has(p.id)).length;
    return {
      id: c.id,
      nome: c.nome,
      cor: c.cor,
      programas: programasC.length,
      pessoas: pessoasC.length,
      escalas: escalasC.length,
      horas: Math.round(horas * 10) / 10,
      ocorrencias: ocorr,
      ferias,
      licencas: licen,
    };
  });

  const pieData = linhas.filter((l) => l.pessoas > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {linhas.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border bg-card p-4 shadow-soft"
            style={{ borderTopColor: c.cor, borderTopWidth: 3 }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: c.cor }}
              />
              <h3 className="font-display text-sm font-semibold">{c.nome}</h3>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Programas" value={c.programas} />
              <Metric label="Pessoas" value={c.pessoas} />
              <Metric label="Escalas" value={c.escalas} />
              <Metric label="Horas" value={`${c.horas}h`} />
              <Metric label="Ocorrências" value={c.ocorrencias} />
              <Metric label="Férias" value={c.ferias} />
              <Metric label="Licenças" value={c.licencas} />
            </dl>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Distribuição de equipe" description="Colaboradores por conteúdo">
          <div className="h-72">
            {pieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem dados.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="pessoas"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    strokeWidth={2}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.id} fill={d.cor} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Horas por conteúdo" description="Comparativo no período">
          <div className="space-y-2">
            {(() => {
              const max = Math.max(...linhas.map((l) => l.horas), 1);
              return linhas
                .filter((l) => l.horas > 0)
                .sort((a, b) => b.horas - a.horas)
                .map((l) => (
                  <div key={l.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{l.nome}</span>
                      <span className="tabular-nums text-muted-foreground">{l.horas}h</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full"
                        style={{ width: `${(l.horas / max) * 100}%`, backgroundColor: l.cor }}
                      />
                    </div>
                  </div>
                ));
            })()}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-display text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}
