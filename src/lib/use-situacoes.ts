import { useQuery } from "@tanstack/react-query";
import { situacoesQuery, type Situacao } from "@/lib/queries";
import { SITUACOES_ESPECIAIS, STATUS_ESCALA } from "@/lib/domain";

/** Fallback used before the DB list loads (keeps UI stable on first paint). */
const FALLBACK: Situacao[] = STATUS_ESCALA.map((nome, i) => ({
  id: nome,
  nome,
  cor:
    SITUACOES_ESPECIAIS.find((s) => s.key === nome)?.cor ??
    (nome === "Trabalhando" ? "#16a34a" : "#94a3b8"),
  ordem: i,
  especial: nome !== "Trabalhando",
  ativo: true,
  created_at: "",
  updated_at: "",
}));

/** All active statuses, ordered. Falls back to built-in defaults while loading. */
export function useSituacoes(): Situacao[] {
  const { data } = useQuery(situacoesQuery());
  const list = data && data.length ? data : FALLBACK;
  return list.filter((s) => s.ativo);
}

/** Only "special" statuses (vacation, day off, leave...) — no program attached. */
export function useSituacoesEspeciais(): Situacao[] {
  return useSituacoes().filter((s) => s.especial);
}

/** Color for a status name, with a neutral fallback. */
export function corSituacao(list: Situacao[], nome: string): string {
  return list.find((s) => s.nome === nome)?.cor ?? "#94a3b8";
}
