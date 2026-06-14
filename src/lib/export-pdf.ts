import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";

import { contrastText } from "./domain";
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

function softHex(hex: string, alpha: number): [number, number, number] {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const mix = (v: number) => Math.round(v * alpha + 255 * (1 - alpha));
  return [mix(r), mix(g), mix(b)];
}
function hexRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

export function exportEscalaPdf(args: {
  cfg: ExportConfig;
  escalas: EscalaCompleta[];
  pessoas: PessoaComFuncao[];
  conteudos: TipoConteudo[];
  fileName: string;
}) {
  const { cfg, escalas, pessoas, conteudos, fileName } = args;
  const doc = new jsPDF({
    orientation: cfg.pdf.orientacao === "paisagem" ? "landscape" : "portrait",
    unit: "pt",
    format: cfg.pdf.tamanho === "a3" ? "a3" : "a4",
  });

  if (cfg.tipo === "filtrada") {
    drawFlat(doc, args);
  } else {
    drawGrid(doc, args);
  }

  doc.save(fileName);
  void conteudos;
  void escalas;
  void pessoas;
}

function drawHeader(doc: jsPDF, cfg: ExportConfig, pageW: number, margin: number): number {
  let y = margin;
  if (cfg.pdf.exibirCabecalho) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(cfg.nomeRelatorio, margin, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const meta = [
      cfg.empresa,
      `Período: ${periodoLabel(cfg.inicio, cfg.fim)}`,
      `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      cfg.pdf.responsavel ? `Responsável: ${cfg.pdf.responsavel}` : "",
    ].filter(Boolean);
    doc.text(meta.join("  ·  "), margin, y + 30);
    y += 44;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`${cfg.nomeRelatorio} — ${periodoLabel(cfg.inicio, cfg.fim)}`, margin, y + 12);
    y += 22;
  }
  void pageW;
  return y;
}

function drawGrid(
  doc: jsPDF,
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

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;

  const nameColW = Math.min(150, usableW * 0.22);
  const funcColW = Math.min(90, usableW * 0.12);
  const dayColW = Math.max(48, (usableW - nameColW - funcColW) / days.length);
  const rowH = 22;
  const headerH = 26;
  const bandH = 20;

  let y = drawHeader(doc, cfg, pageW, margin);

  const drawColHeader = (yStart: number) => {
    doc.setFillColor(31, 41, 55);
    doc.rect(margin, yStart, usableW, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Colaborador", margin + 4, yStart + 16);
    doc.text("Função", margin + nameColW + 4, yStart + 16);
    let x = margin + nameColW + funcColW;
    for (const d of days) {
      doc.text(dayHeaderText(d), x + dayColW / 2, yStart + 16, { align: "center" });
      x += dayColW;
    }
    return yStart + headerH;
  };

  y = drawColHeader(y);

  const ensure = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = drawHeader(doc, cfg, pageW, margin);
      y = drawColHeader(y);
    }
  };

  for (const cg of grupos) {
    // estimate group height for keep-together best-effort
    const groupHeight =
      bandH +
      cg.programas.reduce(
        (acc, pg) => acc + bandH + pg.pessoas.length * rowH,
        0,
      );
    if (groupHeight < pageH - margin * 2 - 80) ensure(groupHeight);

    // Content band
    ensure(bandH);
    const [cr, cg2, cb] = hexRgb(cg.cor);
    doc.setFillColor(cr, cg2, cb);
    doc.rect(margin, y, nameColW, bandH, "F");
    const [sr, sg, sb] = softHex(cg.cor, 0.22);
    doc.setFillColor(sr, sg, sb);
    doc.rect(margin + nameColW, y, usableW - nameColW, bandH, "F");
    const ct = contrastText(cg.cor);
    const [tr, tg, tb] = hexRgb(ct);
    doc.setTextColor(tr, tg, tb);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(cg.nome.toUpperCase(), margin + 6, y + 14);
    y += bandH;

    for (const pg of cg.programas) {
      ensure(bandH + rowH);
      // Program band
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, usableW, bandH, "F");
      // colored dot
      const [pr, pgc, pb] = hexRgb(pg.cor);
      doc.setFillColor(pr, pgc, pb);
      doc.circle(margin + 8, y + bandH / 2, 3, "F");
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(pg.nome, margin + 16, y + 14);
      y += bandH;

      for (const { pessoa, byDate } of pg.pessoas) {
        ensure(rowH);
        // Row background
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        // Name
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(
          truncate(doc, pessoa.nome, nameColW - 8),
          margin + 4,
          y + 13,
        );
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          truncate(doc, pessoa.funcao?.nome ?? "—", funcColW - 6),
          margin + nameColW + 4,
          y + 13,
        );

        let x = margin + nameColW + funcColW;
        for (const d of days) {
          const iso = format(d, "yyyy-MM-dd");
          const es = byDate.get(iso) ?? [];
          const trabalhando = es.some((e) => e.status === "Trabalhando");
          if (es.length) {
            const [br, bg, bb] = trabalhando
              ? softHex(pg.cor, 0.22)
              : [248, 250, 252];
            doc.setFillColor(br, bg, bb);
            doc.rect(x + 1, y + 2, dayColW - 2, rowH - 4, "F");
          }
          // border
          doc.setDrawColor(226, 232, 240);
          doc.rect(x, y, dayColW, rowH, "S");
          if (es.length) {
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            const text = cellText(es);
            const lines = doc.splitTextToSize(text, dayColW - 4);
            doc.text(lines.slice(0, 2), x + 3, y + 9);
          }
          x += dayColW;
        }
        // left columns border
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, nameColW, rowH, "S");
        doc.rect(margin + nameColW, y, funcColW, rowH, "S");
        y += rowH;
      }
    }
  }
}

function drawFlat(
  doc: jsPDF,
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
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;
  const cols = [
    { k: "data", label: "Data", w: 0.08 },
    { k: "pessoa", label: "Colaborador", w: 0.16 },
    { k: "funcao", label: "Função", w: 0.11 },
    { k: "conteudo", label: "Conteúdo", w: 0.11 },
    { k: "programa", label: "Programa", w: 0.16 },
    { k: "ilha", label: "Ilha", w: 0.1 },
    { k: "horario", label: "Horário", w: 0.1 },
    { k: "modalidade", label: "Modalidade", w: 0.09 },
    { k: "status", label: "Status", w: 0.09 },
  ];
  const widths = cols.map((c) => c.w * usableW);
  const rowH = 18;
  let y = drawHeader(doc, cfg, pageW, margin);

  const drawHead = (yStart: number) => {
    doc.setFillColor(31, 41, 55);
    doc.rect(margin, yStart, usableW, rowH + 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = margin;
    cols.forEach((c, i) => {
      doc.text(c.label, x + 4, yStart + 14);
      x += widths[i];
    });
    return yStart + rowH + 4;
  };
  y = drawHead(y);

  const ensure = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = drawHeader(doc, cfg, pageW, margin);
      y = drawHead(y);
    }
  };

  const rows = filteredEscalas
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((e) => {
      const p = pessoaById.get(e.pessoa_id);
      const horario = e.hora_inicio
        ? `${e.hora_inicio.slice(0, 5)}${e.hora_fim ? `–${e.hora_fim.slice(0, 5)}` : ""}`
        : "";
      return [
        format(parseISO(e.data), "dd/MM/yyyy"),
        p?.nome ?? "—",
        p?.funcao?.nome ?? "—",
        e.programa?.conteudo?.nome ?? "—",
        e.programa?.nome ?? "—",
        e.ilha?.nome ?? "—",
        horario,
        e.modalidade === "TV" ? "Presencial" : "Home Office",
        e.status,
      ];
    });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  for (const r of rows) {
    ensure(rowH);
    doc.setDrawColor(226, 232, 240);
    let x = margin;
    r.forEach((val, i) => {
      doc.rect(x, y, widths[i], rowH, "S");
      doc.text(truncate(doc, String(val), widths[i] - 6), x + 3, y + 12);
      x += widths[i];
    });
    y += rowH;
  }
}

function truncate(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(text.slice(0, mid) + "…") <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}
