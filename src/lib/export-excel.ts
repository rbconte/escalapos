import XLSX from "xlsx-js-style";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { contrastText, hexToSoftBg } from "./domain";
import type {
  EscalaCompleta,
  PessoaComFuncao,
  TipoConteudo,
} from "./domain";
import {
  buildGrupos,
  cellText,
  dayHeaderText,
  daysBetween,
  periodoLabel,
  type ExportConfig,
} from "./export-shared";

type CellStyle = NonNullable<XLSX.CellObject["s"]>;

const HEADER_STYLE: CellStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "1F2937" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder("CBD5E1"),
};
const TITLE_STYLE: CellStyle = {
  font: { bold: true, sz: 14, color: { rgb: "0F172A" } },
  alignment: { horizontal: "left", vertical: "center" },
};
const TEXT_STYLE: CellStyle = {
  font: { sz: 10, color: { rgb: "0F172A" } },
  alignment: { vertical: "center", wrapText: true },
  border: thinBorder("E2E8F0"),
};

function thinBorder(rgb: string) {
  const side = { style: "thin", color: { rgb } } as const;
  return { top: side, bottom: side, left: side, right: side };
}

function rgbFromHex(hex: string): string {
  return hex.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6);
}

function softRgb(hex: string, alpha = 0.18): string {
  // Approximate alpha blend over white.
  const c = hex.replace("#", "");
  if (c.length !== 6) return "F8FAFC";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const mix = (v: number) => Math.round(v * alpha + 255 * (1 - alpha));
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function ref(row: number, col: number) {
  return XLSX.utils.encode_cell({ r: row, c: col });
}

export function exportEscalaExcel(args: {
  cfg: ExportConfig;
  escalas: EscalaCompleta[];
  pessoas: PessoaComFuncao[];
  conteudos: TipoConteudo[];
  fileName: string;
}) {
  const { cfg, escalas, pessoas, conteudos, fileName } = args;
  const wb = XLSX.utils.book_new();

  if (cfg.tipo === "filtrada") {
    writeFlatSheet(wb, args);
  } else {
    writeGridSheet(wb, args);
  }

  XLSX.writeFile(wb, fileName);
}

function writeGridSheet(
  wb: XLSX.WorkBook,
  args: {
    cfg: ExportConfig;
    escalas: EscalaCompleta[];
    pessoas: PessoaComFuncao[];
    conteudos: TipoConteudo[];
  },
) {
  const { cfg, escalas, pessoas, conteudos } = args;
  const { grupos } = buildGrupos(escalas, pessoas, conteudos, cfg.filtros);
  const days = daysBetween(cfg.inicio, cfg.fim);
  const colCount = 2 + days.length;

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let row = 0;

  // Title
  setCell(ws, row, 0, `${cfg.nomeRelatorio} — ${periodoLabel(cfg.inicio, cfg.fim)}`, TITLE_STYLE);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: colCount - 1 } });
  row += 1;

  if (cfg.pdf.exibirCabecalho) {
    setCell(
      ws,
      row,
      0,
      `${cfg.empresa} · Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}${
        cfg.pdf.responsavel ? ` · ${cfg.pdf.responsavel}` : ""
      }`,
      {
        font: { sz: 9, color: { rgb: "64748B" } },
        alignment: { horizontal: "left" },
      },
    );
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: colCount - 1 } });
    row += 1;
  }
  row += 1; // blank

  // Header row
  setCell(ws, row, 0, "Colaborador", HEADER_STYLE);
  setCell(ws, row, 1, "Função", HEADER_STYLE);
  days.forEach((d, i) => setCell(ws, row, 2 + i, dayHeaderText(d), HEADER_STYLE));
  const headerRow = row;
  row += 1;

  for (const cg of grupos) {
    // Content band
    setCell(ws, row, 0, cg.nome.toUpperCase(), {
      font: { bold: true, sz: 11, color: { rgb: rgbFromHex(contrastText(cg.cor)) } },
      fill: { fgColor: { rgb: rgbFromHex(cg.cor) } },
      alignment: { vertical: "center" },
    });
    for (let c = 1; c < colCount; c++) {
      setCell(ws, row, c, "", {
        fill: { fgColor: { rgb: softRgb(cg.cor, 0.22) } },
      });
    }
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: colCount - 1 } });
    row += 1;

    for (const pg of cg.programas) {
      // Program sub-band
      setCell(ws, row, 0, `  ${pg.nome}`, {
        font: { bold: true, sz: 10, color: { rgb: "0F172A" } },
        fill: { fgColor: { rgb: "F1F5F9" } },
        alignment: { vertical: "center" },
      });
      for (let c = 1; c < colCount; c++) {
        setCell(ws, row, c, "", { fill: { fgColor: { rgb: "F8FAFC" } } });
      }
      merges.push({ s: { r: row, c: 1 }, e: { r: row, c: colCount - 1 } });
      row += 1;

      for (const { pessoa, byDate } of pg.pessoas) {
        setCell(ws, row, 0, pessoa.nome, TEXT_STYLE);
        setCell(ws, row, 1, pessoa.funcao?.nome ?? "—", TEXT_STYLE);
        days.forEach((d, i) => {
          const iso = format(d, "yyyy-MM-dd");
          const es = byDate.get(iso) ?? [];
          const text = cellText(es);
          const trabalhando = es.some((e) => e.status === "Trabalhando");
          const fillHex = trabalhando ? softRgb(pg.cor, 0.18) : undefined;
          setCell(ws, row, 2 + i, text, {
            ...TEXT_STYLE,
            font: { sz: 9, color: { rgb: "0F172A" } },
            fill: fillHex ? { fgColor: { rgb: fillHex } } : undefined,
          });
        });
        row += 1;
      }
    }
  }

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(row - 1, headerRow), c: colCount - 1 },
  });
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 28 },
    { wch: 18 },
    ...days.map(() => ({ wch: 22 })),
  ];
  ws["!freeze"] = { xSplit: 2, ySplit: headerRow + 1 } as never;
  ws["!rows"] = [];
  for (let i = 0; i <= headerRow; i++) ws["!rows"][i] = { hpt: 22 };
  ws["!rows"][headerRow] = { hpt: 30 };

  XLSX.utils.book_append_sheet(wb, ws, "Escala");
}

function writeFlatSheet(
  wb: XLSX.WorkBook,
  args: {
    cfg: ExportConfig;
    escalas: EscalaCompleta[];
    pessoas: PessoaComFuncao[];
    conteudos: TipoConteudo[];
  },
) {
  const { cfg, escalas, pessoas, conteudos } = args;
  const { filteredEscalas } = buildGrupos(escalas, pessoas, conteudos, cfg.filtros);
  const pessoaById = new Map(pessoas.map((p) => [p.id, p]));
  const headers = [
    "Data",
    "Colaborador",
    "Função",
    "Conteúdo",
    "Programa",
    "Ilha",
    "Início",
    "Fim",
    "Modalidade",
    "Status",
  ];
  const data = filteredEscalas
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((e) => {
      const p = pessoaById.get(e.pessoa_id);
      return [
        format(parseISO(e.data), "dd/MM/yyyy"),
        p?.nome ?? "—",
        p?.funcao?.nome ?? "—",
        e.programa?.conteudo?.nome ?? "—",
        e.programa?.nome ?? "—",
        e.ilha?.nome ?? "—",
        e.hora_inicio?.slice(0, 5) ?? "",
        e.hora_fim?.slice(0, 5) ?? "",
        e.modalidade === "TV" ? "Presencial" : "Home Office",
        e.status,
      ];
    });

  const ws: XLSX.WorkSheet = {};
  let row = 0;
  setCell(ws, row, 0, `${cfg.nomeRelatorio} — ${periodoLabel(cfg.inicio, cfg.fim)}`, TITLE_STYLE);
  row += 2;
  headers.forEach((h, c) => setCell(ws, row, c, h, HEADER_STYLE));
  row += 1;
  for (const r of data) {
    r.forEach((v, c) => setCell(ws, row, c, v, TEXT_STYLE));
    row += 1;
  }
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(row - 1, 2), c: headers.length - 1 },
  });
  ws["!cols"] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 3 } as never;
  XLSX.utils.book_append_sheet(wb, ws, "Escala");
}

function setCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string,
  style?: CellStyle,
) {
  const cell: XLSX.CellObject = { v: value, t: "s" };
  if (style) cell.s = style;
  ws[ref(r, c)] = cell;
}

// Backwards-compat shim (old callers).
export { exportEscalaExcel as exportEscalaToExcel };
// Suppress unused import warning for hexToSoftBg if needed.
void hexToSoftBg;
