## Módulo de Gestão e Dashboards

Novo módulo **gerencial** (read-only sobre dados existentes) com 5 dashboards, filtros globais e novas entidades para Férias e Licenças. Nada da Escala Operacional atual será alterado.

### 1. Banco de dados (migração)

Novas tabelas em `public`:

- **`ferias`** — `pessoa_id`, `data_inicio`, `data_fim`, `status` (Programada / Aprovada / Em andamento / Concluída / Vencida), `observacao`
- **`licencas`** — `pessoa_id`, `tipo` (Médica / Maternidade / Paternidade / Treinamento / Outros), `data_inicio`, `data_fim`, `observacao`

A tabela `ocorrencias` já existe e será reutilizada (campos compatíveis com o PRD). Adicionamos CRUD básico de Ocorrências na UI de Pessoas (Dashboard 2).

Cada tabela com `created_at`, `updated_at`, RLS aberta (mesmo padrão atual: `Public manage ...`) e GRANTs para `anon`, `authenticated`, `service_role` — mantendo coerência com o resto do schema.

### 2. Rotas e menu

Sidebar ganha grupo **Gestão** com:

```
/gestao              → Visão Geral
/gestao/pessoas      → Pessoas
/gestao/operacao     → Operação
/gestao/conteudos    → Conteúdos
/gestao/planejamento → Planejamento
```

Layout em `src/routes/gestao.tsx` (Outlet + barra de filtros globais). Subrotas em `gestao.index.tsx`, `gestao.pessoas.tsx`, etc.

### 3. Filtros globais

Encode na URL via `validateSearch` no layout `gestao.tsx`:
`periodo` (preset: hoje/semana/mês/customizado + `from`/`to`), `conteudo_id`, `programa_id`, `ilha_id`, `pessoa_id`, `status`.

Hook `useGestaoFiltros()` lê de `Route.useSearch()`; barra de filtros faz `navigate({ search: prev => ... })`. Todos os queries (`escalas`, `ferias`, `licencas`, `ocorrencias`) recebem o range e filtros.

### 4. Dashboards

Cálculos no cliente sobre os dados já carregados (TanStack Query).

- **Visão Geral** — KPIs: ativos, alocados hoje, folga hoje, férias, licenças, ocorrências abertas, **taxa de ocupação** (horas alocadas ÷ horas disponíveis no período) com comparativo vs. período anterior. Gráfico de linha de ocupação diária.
- **Pessoas** — Tabela por colaborador com folgas (mês/acumulado), status de férias, licenças ativas, ocorrências. Painel lateral abre histórico + **CRUD de ocorrências** (criar/resolver/arquivar).
- **Operação** — Barras: alocação por programa, por ilha. Ranking de colaboradores (mais/menos alocados, sem alocação). Linha: escalas por dia/semana/mês (toggle).
- **Conteúdos** — Cards por `tipos_conteudo` com programas, pessoas, escalas, horas, ocorrências, férias, licenças. Pizza (distribuição equipe) + barras comparativas (horas por conteúdo).
- **Planejamento** — Capacidade (disponível/alocado/livre + %) por dia/semana/mês. **Mapa de cobertura**: programas onde só 1 pessoa atua = alto risco; 2 = médio; 3+ = baixo. Calendário de férias futuras + lista de licenças/ausências programadas.

### Detalhes técnicos

- Cálculo de horas: `hora_fim - hora_inicio` por escala com `status='Trabalhando'`. Horas disponíveis = `pessoas ativas × 8h × dias úteis no período` (configurável, começa em 8h).
- Cores e tokens semânticos via `src/styles.css` (sem cores hardcoded). Gráficos com `recharts` (já no projeto via shadcn `chart.tsx`).
- Queries novas em `src/lib/queries.ts`: `feriasQuery(from,to)`, `licencasQuery(from,to)`. `ocorrenciasQuery` já existe.
- Subagentes em paralelo para acelerar: (a) migração + queries, (b) layout/filtros/sidebar, (c) cada dashboard. Dashboards compartilham `KpiCard`, `DashboardSection`, `useGestaoData()` em `src/components/gestao/`.
- Nada nas rotas existentes (`/`, `/pessoas`, `/programas`, etc.) é tocado.

### Fora do escopo (mencionado no PRD como “futuro”)

- Exportação para Excel dos dashboards (a infra `export-excel.ts` existe; adiciono botão depois se quiser).
- Cadastro de Férias/Licenças com formulário completo: começo com CRUD mínimo de Ocorrências (parte do Dashboard 2). Posso estender em iteração seguinte.

Confirma para eu implementar?