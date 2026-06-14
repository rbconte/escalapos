import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { ISO } from "./dates";
import type {
  EscalaCompleta,
  PessoaComFuncao,
  ProgramaComConteudo,
  TipoConteudo,
} from "./domain";

export type Formato = "xlsx" | "pdf";
export type TipoExportacao = "completa" | "filtrada";
export type OrientacaoPDF = "retrato" | "paisagem";
export type TamanhoPDF = "a4" | "a3";

export interface ExportFilters {
  conteudos: string[]; // ids; empty = todos
  programas: string[];
  pessoas: string[];
  ilhas: string[];
}

export interface ExportConfig {
  formato: Formato;
  tipo: TipoExportacao;
  inicio: string; // ISO yyyy-MM-dd
  fim: string;
  filtros: ExportFilters;
  pdf: {
    orientacao: OrientacaoPDF;
    tamanho: TamanhoPDF;
    exibirCabecalho: boolean;
    responsavel: string;
  };
  empresa: string;
  nomeRelatorio: string;
}

export const SEM_CONTEUDO = "__sem_conteudo__";
export const SEM_PROGRAMA = "__sem_programa__";

export function passaFiltros(e: EscalaCompleta, f: ExportFilters): boolean {
  if (f.programas.length && (!e.programa_id || !f.programas.includes(e.programa_id))) return false;
  if (f.ilhas.length && (!e.ilha_id || !f.ilhas.includes(e.ilha_id))) return false;
  if (f.pessoas.length && !f.pessoas.includes(e.pessoa_id)) return false;
  if (f.conteudos.length) {
    const cId = e.programa?.conteudo?.id ?? SEM_CONTEUDO;
    if (!f.conteudos.includes(cId)) return false;
  }
  return true;
}

export function daysBetween(inicio: string, fim: string): Date[] {
  const start = parseISO(inicio);
  const end = parseISO(fim);
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function cellText(escalas: EscalaCompleta[]): string {
  if (escalas.length === 0) return "";
  return escalas
    .map((e) => {
      if (e.status !== "Trabalhando") return e.status;
      const partes = [e.programa?.nome ?? "Sem programa"];
      if (e.hora_inicio) {
        partes.push(
          `${e.hora_inicio.slice(0, 5)}${e.hora_fim ? `–${e.hora_fim.slice(0, 5)}` : ""}`,
        );
      }
      if (e.ilha?.nome) partes.push(e.ilha.nome);
      partes.push(e.modalidade === "TV" ? "Presencial" : "HO");
      return partes.join(" · ");
    })
    .join(" | ");
}

export interface Grupo {
  key: string;
  nome: string;
  cor: string;
  ordem: number;
  programas: ProgramaGrupo[];
}
export interface ProgramaGrupo {
  programaId: string | null;
  nome: string;
  cor: string;
  pessoas: { pessoa: PessoaComFuncao; byDate: Map<string, EscalaCompleta[]> }[];
}

export function buildGrupos(
  escalas: EscalaCompleta[],
  pessoas: PessoaComFuncao[],
  conteudos: TipoConteudo[],
  filtros: ExportFilters,
): { grupos: Grupo[]; filteredEscalas: EscalaCompleta[] } {
  const pessoaById = new Map(pessoas.map((p) => [p.id, p]));
  const conteudoInfo = new Map(
    conteudos.map((c) => [c.id, { nome: c.nome, cor: c.cor, ordem: c.ordem }]),
  );
  const cmap = new Map<string, Grupo>();
  const filtered: EscalaCompleta[] = [];

  for (const e of escalas) {
    if (!passaFiltros(e, filtros)) continue;
    filtered.push(e);
    const p = pessoaById.get(e.pessoa_id);
    if (!p) continue;
    const cKey = e.programa?.conteudo?.id ?? SEM_CONTEUDO;
    let cg = cmap.get(cKey);
    if (!cg) {
      const info = cKey !== SEM_CONTEUDO ? conteudoInfo.get(cKey) : undefined;
      cg = {
        key: cKey,
        nome: info?.nome ?? "Sem conteúdo",
        cor: info?.cor ?? "#94a3b8",
        ordem: info?.ordem ?? 99999,
        programas: [],
      };
      cmap.set(cKey, cg);
    }
    const pKey = e.programa_id ?? SEM_PROGRAMA;
    let pg = cg.programas.find((x) => (x.programaId ?? SEM_PROGRAMA) === pKey);
    if (!pg) {
      pg = e.programa
        ? {
            programaId: e.programa_id,
            nome: e.programa.nome,
            cor: e.programa.cor,
            pessoas: [],
          }
        : {
            programaId: null,
            nome: "Folgas e ausências",
            cor: "#94a3b8",
            pessoas: [],
          };
      cg.programas.push(pg);
    }
    let row = pg.pessoas.find((r) => r.pessoa.id === e.pessoa_id);
    if (!row) {
      row = { pessoa: p, byDate: new Map() };
      pg.pessoas.push(row);
    }
    const arr = row.byDate.get(e.data) ?? [];
    arr.push(e);
    row.byDate.set(e.data, arr);
  }

  const grupos = Array.from(cmap.values()).sort(
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
  );
  for (const g of grupos) {
    g.programas.sort((a, b) => {
      if (a.programaId === null) return 1;
      if (b.programaId === null) return -1;
      return a.nome.localeCompare(b.nome);
    });
    for (const pg of g.programas) {
      pg.pessoas.sort((a, b) =>
        a.pessoa.ordem - b.pessoa.ordem || a.pessoa.nome.localeCompare(b.pessoa.nome),
      );
    }
  }
  return { grupos, filteredEscalas: filtered };
}

export function periodoLabel(inicio: string, fim: string): string {
  const s = parseISO(inicio);
  const e = parseISO(fim);
  return `${format(s, "dd/MM/yyyy")} a ${format(e, "dd/MM/yyyy")}`;
}

export function buildFileName(
  cfg: ExportConfig,
  conteudosMap: Map<string, TipoConteudo>,
): string {
  const ext = cfg.formato;
  const base = "Escala_Operacional";
  let parts = [base];
  if (cfg.filtros.conteudos.length === 1) {
    const c = conteudosMap.get(cfg.filtros.conteudos[0]);
    if (c) parts.push(slug(c.nome));
  } else if (cfg.filtros.conteudos.length > 1) {
    parts.push("Selecao");
  }
  const ini = parseISO(cfg.inicio);
  const fim = parseISO(cfg.fim);
  const sameMonth =
    ini.getFullYear() === fim.getFullYear() && ini.getMonth() === fim.getMonth();
  if (sameMonth) {
    parts.push(
      slug(format(ini, "MMMM", { locale: ptBR })) + "_" + format(ini, "yyyy"),
    );
  } else {
    parts.push(`${format(ini, "dd-MM-yyyy")}_${format(fim, "dd-MM-yyyy")}`);
  }
  return parts.join("_") + "." + ext;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function dayHeaderText(d: Date): string {
  return format(d, "EEE dd/MM", { locale: ptBR });
}

export { ISO };
