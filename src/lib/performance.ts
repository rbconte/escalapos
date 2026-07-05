import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PerformanceType = "performance" | "incidente" | "reconhecimento";
export type PerformanceImpact = "baixo" | "medio" | "alto";

export const RECOGNITION_TAGS = [
  "Desempenho excepcional",
  "Ideia inovadora",
  "Ajudou o time",
  "Superou expectativas",
  "Iniciativa",
  "Colaboração",
] as const;

export const IMPACT_WEIGHT: Record<PerformanceImpact, number> = {
  baixo: 1,
  medio: 1.5,
  alto: 2,
};

export const IMPACT_META: Record<PerformanceImpact, { label: string; chip: string }> = {
  baixo: { label: "Baixo (1x)", chip: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  medio: { label: "Médio (1.5x)", chip: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  alto: { label: "Alto (2x)", chip: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

export type PerformanceRecord = {
  id: string;
  pessoa_id: string;
  data: string;
  tipo: PerformanceType;
  impact: PerformanceImpact;
  nota_artistico: number | null;
  nota_tecnico: number | null;
  nota_comportamento: number | null;
  recognition_tag: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
};

export type PerformanceRecordComPessoa = PerformanceRecord & {
  pessoa: { id: string; nome: string } | null;
};

export const performanceRecordsQuery = () =>
  queryOptions({
    queryKey: ["performance_records"],
    queryFn: async (): Promise<PerformanceRecordComPessoa[]> => {
      const { data, error } = await supabase
        .from("performance_records" as never)
        .select("*, pessoa:pessoas(id, nome)")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...(r as unknown as PerformanceRecordComPessoa),
        impact: (r.impact as PerformanceImpact) ?? "medio",
      })) as PerformanceRecordComPessoa[];
    },
  });

export type PillarKey = "nota_artistico" | "nota_tecnico" | "nota_comportamento";

export const PILLARS: { key: PillarKey; label: string; color: string }[] = [
  { key: "nota_artistico", label: "Artístico", color: "#a855f7" },
  { key: "nota_tecnico", label: "Técnico", color: "#0ea5e9" },
  { key: "nota_comportamento", label: "Comportamento", color: "#16a34a" },
];

/** Média ponderada por impacto. Ignora pilares sem nota. */
export function averageByPillar(records: PerformanceRecord[]) {
  const acc: Record<PillarKey, { sum: number; weight: number; count: number }> = {
    nota_artistico: { sum: 0, weight: 0, count: 0 },
    nota_tecnico: { sum: 0, weight: 0, count: 0 },
    nota_comportamento: { sum: 0, weight: 0, count: 0 },
  };
  for (const r of records) {
    const w = IMPACT_WEIGHT[r.impact ?? "medio"];
    for (const p of PILLARS) {
      const v = r[p.key];
      if (typeof v === "number") {
        acc[p.key].sum += v * w;
        acc[p.key].weight += w;
        acc[p.key].count += 1;
      }
    }
  }
  return PILLARS.map((p) => ({
    key: p.key,
    label: p.label,
    color: p.color,
    avg: acc[p.key].weight ? acc[p.key].sum / acc[p.key].weight : null,
    count: acc[p.key].count,
  }));
}

export function sentimentOf(r: PerformanceRecord): "positivo" | "neutro" | "negativo" {
  if (r.tipo === "reconhecimento") return "positivo";
  if (r.tipo === "incidente") return "negativo";
  const vals = PILLARS.map((p) => r[p.key]).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return "neutro";
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 7) return "positivo";
  if (avg <= 4) return "negativo";
  return "neutro";
}

export const TIPO_META: Record<PerformanceType, { label: string; chip: string }> = {
  performance: {
    label: "Performance",
    chip: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  },
  incidente: {
    label: "Incidente",
    chip: "bg-red-500/10 text-red-600 border-red-500/20",
  },
  reconhecimento: {
    label: "Reconhecimento",
    chip: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
};

/* -------------------- Confidence -------------------- */

export type ConfidenceLevel = "baixa" | "media" | "alta";

export function confidenceOf(count: number): {
  level: ConfidenceLevel;
  label: string;
  chip: string;
} {
  if (count >= 8) return { level: "alta", label: "Alta confiança", chip: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
  if (count >= 3) return { level: "media", label: "Média confiança", chip: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  return { level: "baixa", label: "Baixa confiança", chip: "bg-slate-500/10 text-slate-500 border-slate-500/20" };
}

/* -------------------- Trend direction (event-based) -------------------- */

export type TrendDir = "improving" | "stable" | "declining" | "insufficient";

/** Score médio ponderado do registro (somente pilares presentes). */
export function recordScore(r: PerformanceRecord): number | null {
  const vals = PILLARS.map((p) => r[p.key]).filter((v): v is number => typeof v === "number");
  if (!vals.length) {
    if (r.tipo === "reconhecimento") return 8;
    if (r.tipo === "incidente") return 3;
    return null;
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Divide os eventos com nota em metades (mais antigos vs mais recentes) e compara médias. */
export function trendDirection(records: PerformanceRecord[]): {
  dir: TrendDir;
  recent: number | null;
  previous: number | null;
  delta: number | null;
} {
  const scored = records
    .map((r) => ({ score: recordScore(r), data: r.data }))
    .filter((r): r is { score: number; data: string } => r.score !== null)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (scored.length < 4) {
    return { dir: "insufficient", recent: null, previous: null, delta: null };
  }
  const half = Math.floor(scored.length / 2);
  const prev = scored.slice(0, half);
  const rec = scored.slice(-half);
  const avg = (xs: { score: number }[]) => xs.reduce((a, b) => a + b.score, 0) / xs.length;
  const previous = avg(prev);
  const recent = avg(rec);
  const delta = recent - previous;
  let dir: TrendDir = "stable";
  if (delta >= 0.5) dir = "improving";
  else if (delta <= -0.5) dir = "declining";
  return { dir, recent, previous, delta };
}

export const TREND_META: Record<
  TrendDir,
  { label: string; chip: string; arrow: string }
> = {
  improving: { label: "Em evolução", chip: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", arrow: "↑" },
  stable: { label: "Estável", chip: "bg-blue-500/10 text-blue-600 border-blue-500/20", arrow: "→" },
  declining: { label: "Em queda", chip: "bg-red-500/10 text-red-600 border-red-500/20", arrow: "↓" },
  insufficient: { label: "Dados insuficientes", chip: "bg-slate-500/10 text-slate-500 border-slate-500/20", arrow: "•" },
};

/* -------------------- Smart alerts & insights -------------------- */

export interface SmartAlert {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  description: string;
  pessoaId?: string;
}

export interface PersonInsight {
  pessoaId: string;
  nome: string;
  records: PerformanceRecordComPessoa[];
  count: number;
  weightedAvg: number | null;
  trend: ReturnType<typeof trendDirection>;
  positives: number;
  negatives: number;
  recognitions: number;
  lastDate: string | null;
  daysSinceLast: number | null;
}

export function buildInsights(
  records: PerformanceRecordComPessoa[],
  pessoas: { id: string; nome: string }[],
): PersonInsight[] {
  const today = Date.now();
  return pessoas.map((p) => {
    const rs = records.filter((r) => r.pessoa_id === p.id);
    const scored = rs.map(recordScore).filter((v): v is number => v !== null);
    const weightedAvg = scored.length
      ? scored.reduce((a, b) => a + b, 0) / scored.length
      : null;
    let pos = 0,
      neg = 0,
      rec = 0;
    for (const r of rs) {
      const s = sentimentOf(r);
      if (s === "positivo") pos++;
      else if (s === "negativo") neg++;
      if (r.tipo === "reconhecimento") rec++;
    }
    const lastDate = rs[0]?.data ?? null;
    const daysSinceLast = lastDate
      ? Math.floor((today - new Date(lastDate).getTime()) / 86400_000)
      : null;
    return {
      pessoaId: p.id,
      nome: p.nome,
      records: rs,
      count: rs.length,
      weightedAvg,
      trend: trendDirection(rs),
      positives: pos,
      negatives: neg,
      recognitions: rec,
      lastDate,
      daysSinceLast,
    };
  });
}

export function buildSmartAlerts(insights: PersonInsight[]): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  for (const i of insights) {
    // Declining trend
    if (i.trend.dir === "declining" && i.count >= 4) {
      alerts.push({
        id: `decl-${i.pessoaId}`,
        severity: "warn",
        title: `${i.nome} — desempenho em queda`,
        description: `Média recente ${i.trend.recent?.toFixed(1)} vs. anterior ${i.trend.previous?.toFixed(1)}.`,
        pessoaId: i.pessoaId,
      });
    }
    // Consecutive negatives
    const lastThree = i.records.slice(0, 3);
    if (lastThree.length === 3 && lastThree.every((r) => sentimentOf(r) === "negativo")) {
      alerts.push({
        id: `neg3-${i.pessoaId}`,
        severity: "critical",
        title: `${i.nome} — 3 eventos negativos seguidos`,
        description: `Vale uma conversa 1:1 para entender o contexto.`,
        pessoaId: i.pessoaId,
      });
    }
    // Positive streak
    if (lastThree.length === 3 && lastThree.every((r) => sentimentOf(r) === "positivo")) {
      alerts.push({
        id: `pos3-${i.pessoaId}`,
        severity: "info",
        title: `${i.nome} — sequência positiva`,
        description: `3 eventos positivos consecutivos. Considere reconhecer publicamente.`,
        pessoaId: i.pessoaId,
      });
    }
    // No recent records
    if (i.daysSinceLast !== null && i.daysSinceLast >= 45 && i.count > 0) {
      alerts.push({
        id: `stale-${i.pessoaId}`,
        severity: "warn",
        title: `${i.nome} — sem registros há ${i.daysSinceLast} dias`,
        description: `Registre uma observação recente para manter a leitura precisa.`,
        pessoaId: i.pessoaId,
      });
    }
    if (i.count === 0) {
      alerts.push({
        id: `none-${i.pessoaId}`,
        severity: "info",
        title: `${i.nome} — nenhum registro ainda`,
        description: `Comece a acompanhar o desempenho registrando um evento.`,
        pessoaId: i.pessoaId,
      });
    }
  }
  return alerts.sort((a, b) => {
    const rank = { critical: 0, warn: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity];
  });
}

/* -------------------- Team health -------------------- */

export function teamHealth(insights: PersonInsight[]) {
  const withData = insights.filter((i) => i.weightedAvg !== null);
  const avg = withData.length
    ? withData.reduce((a, b) => a + (b.weightedAvg ?? 0), 0) / withData.length
    : null;
  const improving = insights.filter((i) => i.trend.dir === "improving").length;
  const declining = insights.filter((i) => i.trend.dir === "declining").length;
  const stable = insights.filter((i) => i.trend.dir === "stable").length;
  let status: "saudavel" | "atencao" | "critico" = "saudavel";
  if (avg !== null && (avg < 5 || declining > improving + stable)) status = "critico";
  else if (declining > improving) status = "atencao";
  return { avg, improving, declining, stable, status };
}
