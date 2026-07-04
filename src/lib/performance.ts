import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PerformanceType = "performance" | "incidente" | "reconhecimento";

export const RECOGNITION_TAGS = [
  "Desempenho excepcional",
  "Ideia inovadora",
  "Ajudou o time",
  "Superou expectativas",
  "Iniciativa",
  "Colaboração",
] as const;

export type PerformanceRecord = {
  id: string;
  pessoa_id: string;
  data: string;
  tipo: PerformanceType;
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
      return (data ?? []) as unknown as PerformanceRecordComPessoa[];
    },
  });

export type PillarKey = "nota_artistico" | "nota_tecnico" | "nota_comportamento";

export const PILLARS: { key: PillarKey; label: string; color: string }[] = [
  { key: "nota_artistico", label: "Artístico", color: "#a855f7" },
  { key: "nota_tecnico", label: "Técnico", color: "#0ea5e9" },
  { key: "nota_comportamento", label: "Comportamento", color: "#16a34a" },
];

/** Média por pilar considerando apenas registros que possuem a nota. */
export function averageByPillar(records: PerformanceRecord[]) {
  const acc: Record<PillarKey, { sum: number; count: number }> = {
    nota_artistico: { sum: 0, count: 0 },
    nota_tecnico: { sum: 0, count: 0 },
    nota_comportamento: { sum: 0, count: 0 },
  };
  for (const r of records) {
    for (const p of PILLARS) {
      const v = r[p.key];
      if (typeof v === "number") {
        acc[p.key].sum += v;
        acc[p.key].count += 1;
      }
    }
  }
  return PILLARS.map((p) => ({
    key: p.key,
    label: p.label,
    color: p.color,
    avg: acc[p.key].count ? acc[p.key].sum / acc[p.key].count : null,
    count: acc[p.key].count,
  }));
}

/** Classifica registro em positivo/neutro/negativo pela média dos pilares. */
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
