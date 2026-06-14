# Exportação avançada da Escala Operacional

Substituir o botão atual "Exportar Excel" (que baixa imediatamente) por um modal **Exportar Escala** que permite configurar formato, período, filtros e layout antes de gerar o arquivo.

## 1. UI — Modal "Exportar Escala"

Novo componente `src/components/escala/export-modal.tsx` aberto pelo botão "Exportar" em `src/routes/index.tsx`.

Seções do modal (Dialog do shadcn, scroll interno):

1. **Formato** — Tabs/RadioGroup: `Excel (.xlsx)` | `PDF (.pdf)`.
2. **Período** — dois date pickers (Data inicial / Data final). Pré-preenchidos com o intervalo da view atual (`rangeForView(anchor, view)`).
3. **Tipo de exportação** — RadioGroup:
   - `Escala Completa` — replica o layout visual (agrupado por Conteúdo → Programa, todos os colaboradores do grupo, colunas = dias).
   - `Escala Filtrada` — lista plana apenas dos registros que passam nos filtros.
4. **Filtros** (multi-select com opção "Todos"):
   - Conteúdo (lista fixa: Jornalismo, Esporte, Entretenimento, Magazines, Promoções, Documentários, Outros — derivada de `conteudos` ativos + "Outros").
   - Programa (de `programas`).
   - Colaborador (de `pessoas`).
   - Ilha (de `ilhas`).
   Cada filtro usa um Popover com checkboxes + botão "Todos".
5. **Opções PDF** (visíveis só quando formato = PDF):
   - Orientação: `Retrato` | `Paisagem` (default Paisagem).
   - Tamanho: `A4` | `A3` (default A3).
   - Switch **Exibir cabeçalho** (default ligado) com campos auto-preenchidos: empresa, nome do relatório, data de geração, período, usuário responsável (input de texto editável).
6. **Resumo** — bloco final com contagem: "X colaboradores · Y alocações · Z dias". Botões: `Cancelar` / `Exportar`.

Pré-seleção: os filtros do modal começam com os filtros atualmente aplicados na tela.

## 2. Geração Excel — `src/lib/export-excel.ts` (refatorar)

Usar `xlsx-js-style` (fork de `xlsx` com suporte a estilos de célula — `xlsx` puro não preserva cores) para escrever cores/agrupamentos. Adicionar como dependência.

Estrutura do arquivo (modo Escala Completa):
- Linha 1: título mesclado (nome do relatório + período).
- Linha 2: cabeçalho — `Colaborador`, `Função`, depois 1 coluna por dia (`EEE dd/MM`).
- Para cada **Conteúdo**: linha mesclada com cor de fundo = `conteudo.cor`.
  - Para cada **Programa**: linha mesclada com cor suave = `hexToSoftBg(programa.cor)`.
    - Linhas dos colaboradores com células contendo `cellText()` e fundo = cor do programa.
- Painel congelado nas 2 primeiras colunas + 2 primeiras linhas (`!freeze`).
- Larguras automáticas (cálculo simples baseado no maior texto).
- Modo Escala Filtrada: tabela plana (Data, Colaborador, Função, Conteúdo, Programa, Ilha, Início, Fim, Modalidade, Status).

## 3. Geração PDF — novo `src/lib/export-pdf.ts`

Para fidelidade visual, renderizar o DOM da escala filtrada com **html2canvas-pro** + **jspdf**:
1. Construir, off-screen, um componente `<EscalaPrintable>` (em `src/components/escala/escala-printable.tsx`) que renderiza a grade exatamente como na tela, mas com:
   - largura fixa adequada ao papel (A3 paisagem ≈ 1587px @96dpi, A4 retrato ≈ 794px, etc.),
   - cabeçalho opcional no topo,
   - sem interações (botões/dropdowns).
2. Montar via `createRoot` em um nó escondido (`position:fixed; left:-99999px`), aguardar fontes (`document.fonts.ready`).
3. `html2canvas-pro` (suporta `oklch` do Tailwind v4) → `canvas.toDataURL('image/png')`.
4. Dividir a imagem em páginas no `jsPDF` respeitando orientação/tamanho, com margem que **evita cortes de linha**: medir a altura de cada bloco de programa (data-attrs no DOM) e quebrar entre blocos; repetir o cabeçalho de colunas no topo de cada página.
5. Salvar com o nome gerado.

Modo Escala Filtrada no PDF: renderiza tabela simples (sem grade) — mesma técnica.

## 4. Nome do arquivo

Helper `buildFileName({ formato, conteudos, periodo })`:
- Sem filtro de conteúdo: `Escala_Operacional_<MesAno>.xlsx`
- 1 conteúdo: `Escala_Operacional_<Conteudo>_<MesAno>.pdf`
- Período arbitrário: `Escala_Operacional_<Conteudo>_<dd-MM-yyyy>_<dd-MM-yyyy>.pdf`

## 5. Integração

Em `src/routes/index.tsx`:
- Estado `exportOpen`.
- Botão "Exportar" abre o modal (não exporta direto).
- Modal recebe `pessoas`, `programas`, `ilhas`, `conteudos`, `escalas` (do range escolhido — recarregadas via `useQuery(escalasQuery(inicio, fim))` dentro do modal quando o período muda), filtros iniciais e a função de geração.

## Detalhes técnicos

- Dependências novas: `xlsx-js-style`, `jspdf`, `html2canvas-pro`.
- Reaproveitar `cellText`, `hexToSoftBg`, `contrastText` de `lib/domain.ts` / export-excel.
- Tudo client-side; nenhum server function novo.
- Multi-select reutiliza `Popover` + `Checkbox` existentes (sem nova lib).
- Acessibilidade: labels nos campos, foco inicial no primeiro select, `Esc` fecha.

## Fora do escopo

- Persistir presets de exportação.
- Autenticação para popular "usuário responsável" automaticamente (campo continua editável manual).
- Agendamento de exportações.
