# Evolução: Gestão de Pessoas + Plano de Férias

## Escopo
Expandir cadastro de pessoas, criar módulo de Plano de Férias como fonte única, com sincronização automática com Escala Operacional e Planejamento Macro, incluindo abono pecuniário, alertas e dashboard.

## 1. Banco de dados (migrations)

**Tabela `pessoas` — novos campos:**
- `matricula` (text, único)
- `position` (text) — cargo
- `data_contratacao` (date)
- `telefone`, `email_corporativo`, `email_pessoal` (text)
- `contato_emergencia` (text)
- `endereco` (text)
- `jornada_padrao` (text: '6h' | '8h' | '9h')
- Ampliar `status`: `Ativo | Férias | Licença | Afastado | Desligado`

**Tabela `ferias` — evoluir (hoje só tem início/fim/status/observação):**
- `dias_gozo` (int)
- `dias_abono` (int, default 0)
- `tipo_programacao` (text: 'Integrais' | 'Ferias+Abono' | 'Fracionadas' | 'Fracionadas+Abono')
- `periodo_aquisitivo_inicio` (date) — base para cálculo
- `periodo_aquisitivo_fim` (date)
- Manter `data_inicio`, `data_fim`, `status`

**Função de cálculo (SQL):**
- `calcular_saldo_ferias(pessoa_id)` retorna períodos aquisitivos com dias de direito, programados, gozados, abonados e saldo, usando `data_contratacao`.

## 2. Domínio & queries (`src/lib/`)
- Atualizar tipos `Pessoa` e `Ferias` em `domain.ts`.
- Em `queries.ts`: novos hooks `usePessoaCompleta`, `useSaldoFerias(pessoaId)`, `useFeriasProgramadas`, `useAlertasFerias`, mutations `createFerias`, `updateFerias`, `deleteFerias`.
- Helpers: `calcularPeriodoAquisitivo(dataContratacao, hoje)`, `calcularSaldo(direito, programados, gozados, abonados)`, `validarAbono(gozo, abono, saldo)`.

## 3. Cadastro de Pessoas (`src/routes/pessoas.tsx`)
- Form expandido com abas: **Dados Pessoais**, **Dados Operacionais**.
- Filtros: nome, matrícula, função, cargo, status, data de contratação (range).
- Tabela com novas colunas principais (matrícula, função, cargo, jornada, status).

## 4. Módulo Plano de Férias (novo)

**Sidebar:** novo item "Plano de Férias" → `/ferias`.

**Rotas:**
- `/ferias` — dashboard + lista (tabs)
- `/ferias/calendario` — mapa anual

### 4.1 Dashboard (`/ferias`)
Cards:
- Em férias hoje
- Programadas nos próximos 30 dias
- Vencendo em 60 dias
- Vencendo em 30 dias
- Vencidas
- Dias abonados no período (ano atual)
- Saldo total da equipe

### 4.2 Lista por colaborador
Tabela: nome, função, contratação, período aquisitivo, direito, programados, gozados, abonados, saldo, status, alertas (badges).
Ação "Programar férias" → dialog.

### 4.3 Dialog de programação
- Seleção do tipo de programação.
- Opção 1: data início + data fim.
- Opção 2: data início + qtd de dias (calcula fim).
- Campos: dias de gozo, dias de abono (até 10/período).
- Validação: gozo + abono ≤ saldo (mensagem exata do PRD).
- Validação operacional: se houver `escalas` ou `programa_necessidades`/alocações no período → confirma "Deseja continuar?" (não bloqueia).

### 4.4 Calendário anual (`/ferias/calendario`)
Grade meses × pessoas, blocos coloridos por período. Identifica concentração.

## 5. Sincronização global
- **Fonte única:** tabela `ferias`.
- `Escala Operacional` e `Planejamento Macro` consultam `ferias` para marcar dias gozados (não os abonados) como indisponíveis.
- Dias gozados:
  - Pessoa não aparece como disponível na Escala.
  - Cobertura por produto recalcula déficit (necessidade − disponíveis).
  - Planejamento Macro mostra ausência no período.
- Dias abonados: não impactam escala/cobertura.
- Trigger ou função: ao inserir/alterar férias, invalidar caches de queries relacionadas no client (via `queryClient.invalidateQueries`).

## 6. Alertas
Função utilitária `getAlertasFerias(pessoa)`:
- 60 dias para vencer + sem programação → warning
- 30 dias para vencer + sem programação → crítico
- Vencidas → prioritário
Exibir em badges no cadastro, lista de férias e dashboard.

## 7. Indicadores de cobertura
- Atualizar `metricas.ts` / Gestão > Operação para considerar férias gozadas no cálculo de disponíveis.
- Exibir "Déficit operacional" quando disponíveis < necessidade.

## Ordem de execução
1. Migration (pessoas + ferias + função de cálculo).
2. Tipos e queries.
3. Cadastro de pessoas expandido.
4. Módulo Plano de Férias (dashboard + lista + dialog).
5. Calendário anual.
6. Integração com Escala e Planejamento Macro (cobertura/déficit).
7. Alertas globais.

## Fora do escopo
- Notificações por e-mail.
- Workflow de aprovação de férias.
- Histórico/auditoria de alterações.
- Exportação específica do Plano de Férias (pode reaproveitar export existente em fase futura).
