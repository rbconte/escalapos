## Planejamento Macro — Plano de Implementação

Novo módulo gerencial sincronizado com a Escala Operacional, compartilhando a mesma tabela `escalas` (sem duplicação de dados).

### 1. Banco de dados (migração)

**Nova tabela `programa_necessidades`** — quantidade necessária por programa e dia da semana:
- `programa_id` (FK), `dia_semana` (0=Dom … 6=Sáb), `quantidade` (int)
- Unique(programa_id, dia_semana)
- RLS público (mesmo padrão das outras tabelas)

**Status especiais** já existem em `escalas.status` (Folga, Férias, Licença, etc.). Vamos ampliar/normalizar a lista para incluir: Trabalhando, Folga, Férias, Licença, Treinamento, Banco de Horas, Afastamento, Outros. Cada situação tem cor própria (definida em `lib/domain.ts`, não no banco — mantém simplicidade).

### 2. Modelo de dados / sincronização

Sem cadastro paralelo. O Planejamento Macro **lê e escreve diretamente em `escalas`**:

- Célula com **Produto (programa)** → cria/atualiza `escalas` com `pessoa_id`, `data`, `programa_id`, demais campos (`hora_inicio`, `hora_fim`, `ilha_id`, `modalidade`, `observacao`) ficam em branco.
- Célula com **Situação Especial** → cria `escalas` com `status` correspondente e `programa_id = NULL`.
- Apagar célula → remove a linha de `escalas`.

A Escala Operacional já lê de `escalas`, então a sincronização é automática via React Query (invalidação compartilhada de `["escalas"]`).

### 3. Evolução do cadastro de Programas (`/programas`)

Adicionar seção **"Necessidade Operacional"** no modal de criar/editar programa:
- 7 inputs numéricos (Seg→Dom), com defaults 0
- Salvo em `programa_necessidades` no mesmo submit
- Carregado ao editar

### 4. Nova rota `/planejamento`

Arquivo `src/routes/planejamento.tsx` + item no `app-sidebar.tsx` (grupo Operacional, abaixo de "Escala Operacional", ícone `CalendarCheck`).

**Estrutura visual** (reutiliza padrão de grid da Escala):
- Linhas: colaboradores agrupados por Conteúdo → Programa (mesma lógica de `grupos` em `index.tsx`)
- Colunas: dias (Diário/Semanal/Mensal — mesmo toolbar)
- Cada célula mostra **apenas** sigla do programa OU nome da situação especial, com cor de fundo. Sem horário/ilha/modalidade.
- Click em célula vazia → popover com seletor (Programas + Situações)
- Click em célula preenchida → opções "Trocar / Limpar"

**Linha de cobertura** abaixo de cada grupo de Programa:
- "Necessidade: N | Alocados: X" por dia
- Por dia da coluna: badge com contagem. Cores:
  - Alocados < Necessidade → `bg-destructive text-destructive-foreground`
  - Alocados > Necessidade → `bg-success text-success-foreground` (token novo, ou usar verde)
  - Igual → cor padrão (muted)

**Resumo por Produto** (rodapé do grupo): Necessidade total no período, Alocados total, Diferença.

**Filtros** (toolbar): Conteúdo, Produto, Colaborador, Período (mesmo seletor da Escala).

**Legenda** (rodapé/sidebar): swatches por Conteúdo + situações especiais.

### 5. Componentes novos

- `src/routes/planejamento.tsx` — página principal
- `src/components/planejamento/cell-picker.tsx` — popover seletor programa/situação
- `src/components/planejamento/cobertura-row.tsx` — linha de necessidade vs alocado
- `src/components/planejamento/legenda.tsx`

### 6. lib/queries.ts

Nova query `programaNecessidadesQuery()` que retorna `Map<programaId, { [dia_semana]: quantidade }>`.

### 7. lib/domain.ts

Constante `SITUACOES_ESPECIAIS` com `{ key, label, cor }` para Folga, Férias, Licença, Treinamento, Banco de Horas, Afastamento, Outros.

### Fora de escopo (não incluído)
- Drag & drop entre células (a Escala já tem; Macro mantém só click)
- Edição em massa
- Histórico/auditoria
- Cobertura cruzando férias/licenças (cálculo conta apenas alocações em programa)

### Ordem de execução
1. Migração `programa_necessidades`
2. `lib/domain.ts` + `lib/queries.ts`
3. Cadastro de Programas (necessidade)
4. Rota `/planejamento` + componentes
5. Item de menu