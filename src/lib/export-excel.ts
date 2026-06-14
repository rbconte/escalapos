import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { ISO } from "./dates";
import type { EscalaCompleta, PessoaComFuncao, ViewMode } from "./domain";

/** Builds a readable text for a single allocation cell. */
function cellText(escalas: EscalaCompleta[]): string {
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
      partes.push(e.modalidade === "TV" ? "Presencial" : "Home Office");
      return partes.join(" · ");
    })
    .join(" | ");
}

export function exportEscalaToExcel({
  pessoas,
  days,
  byCell,
  view,
  anchor,
}: {
  pessoas: PessoaComFuncao[];
  days: Date[];
  byCell: Map<string, EscalaCompleta[]>;
  view: ViewMode;
  anchor: Date;
}) {
  const header = [
    "Colaborador",
    "Função",
    ...days.map((d) => format(d, "EEE dd/MM/yyyy", { locale: ptBR })),
  ];

  const rows = pessoas.map((p) => [
    p.nome,
    p.funcao?.nome ?? "—",
    ...days.map((d) => cellText(byCell.get(`${p.id}|${ISO(d)}`) ?? [])),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Column widths
  ws["!cols"] = [
    { wch: 26 },
    { wch: 18 },
    ...days.map(() => ({ wch: 22 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Escala");

  const nome = `escala-${view.toLowerCase()}-${ISO(anchor)}.xlsx`;
  XLSX.writeFile(wb, nome);
}
