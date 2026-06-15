import type { Tables } from "@/integrations/supabase/types";

export type Funcao = Tables<"funcoes">;
export type Programa = Tables<"programas">;
export type Ilha = Tables<"ilhas">;
export type Pessoa = Tables<"pessoas">;
export type Escala = Tables<"escalas">;
export type TipoConteudo = Tables<"tipos_conteudo">;

export type PessoaComFuncao = Pessoa & { funcao: Funcao | null };

export type ProgramaComConteudo = Programa & { conteudo: TipoConteudo | null };

export type EscalaCompleta = Escala & {
  programa: ProgramaComConteudo | null;
  ilha: Ilha | null;
};

export const MODALIDADES = ["TV", "Home Office"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

export const STATUS_ESCALA = [
  "Trabalhando",
  "Folga",
  "Folga Aniversário",
  "Folga Domingo",
  "Folga Semanal",
  "Licença",
  "Férias",
  "Treinamento",
  "Banco de Horas",
  "Afastamento",
  "Outros",
] as const;
export type StatusEscala = (typeof STATUS_ESCALA)[number];

/** Status especiais (sem programa) usados no Planejamento Macro. */
export const SITUACOES_ESPECIAIS = [
  { key: "Folga", label: "Folga", cor: "#94a3b8" },
  { key: "Férias", label: "Férias", cor: "#0ea5e9" },
  { key: "Licença", label: "Licença", cor: "#ef4444" },
  { key: "Treinamento", label: "Treinamento", cor: "#a855f7" },
  { key: "Banco de Horas", label: "Banco de Horas", cor: "#f59e0b" },
  { key: "Afastamento", label: "Afastamento", cor: "#64748b" },
  { key: "Outros", label: "Outros", cor: "#475569" },
] as const;


export const STATUS_PESSOA = ["Ativo", "Inativo", "Férias"] as const;

export const PROGRAMA_CORES = [
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#ea580c",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#ca8a04",
  "#4f46e5",
  "#059669",
];

export type ViewMode = "Diário" | "Semanal" | "Mensal";

export const STATUS_META: Record<
  string,
  { label: string; dot: string; chip: string }
> = {
  Trabalhando: {
    label: "Trabalhando",
    dot: "bg-success",
    chip: "bg-success/10 text-success border-success/20",
  },
  Folga: {
    label: "Folga",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
  },
  "Folga Aniversário": {
    label: "Folga Aniversário",
    dot: "bg-pink-500",
    chip: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  },
  "Folga Domingo": {
    label: "Folga Domingo",
    dot: "bg-orange-500",
    chip: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  },
  Licença: {
    label: "Licença",
    dot: "bg-red-500",
    chip: "bg-red-500/10 text-red-600 border-red-500/20",
  },
  Férias: {
    label: "Férias",
    dot: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  },
  "Folga Semanal": {
    label: "Folga Semanal",
    dot: "bg-warning",
    chip: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  Treinamento: {
    label: "Treinamento",
    dot: "bg-purple-500",
    chip: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  "Banco de Horas": {
    label: "Banco de Horas",
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  Afastamento: {
    label: "Afastamento",
    dot: "bg-slate-500",
    chip: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  },
  Outros: {
    label: "Outros",
    dot: "bg-slate-600",
    chip: "bg-slate-600/10 text-slate-700 border-slate-600/20",
  },
};


/** Returns a readable text color (#fff or dark) for a given hex background. */
export function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a2e" : "#ffffff";
}

export function hexToSoftBg(hex: string, alpha = 0.14): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "transparent";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
