# Refactor do Módulo de Férias — Gestão por Período Aquisitivo

## Objetivo
Migrar o módulo de férias de "saldo único por colaborador" para "múltiplos períodos aquisitivos por colaborador", cada um com seu próprio ciclo, saldo e status. Preservar UI existente, corrigir sincronização com Escala e Planejamento Macro.

---

## 1. Modelo de dados

**Nova tabela `ferias_periodos`** (períodos aquisitivos por pessoa):
- `pessoa_id`, `numero` (1, 2, 3…)
- `inicio_aquisitivo`, `fim_aquisitivo`, `data_expiracao`
- `dias_direito` (default 30), `dias_vendidos` (abono já quitado no período)
- `status` computado (Accruing | Available | Partially Used | Scheduled | Completed | Expiring Soon | Overdue)
- `origem` (`gerado` | `setup_inicial`) — para preservar setup atual

**Alteração em `ferias`** (agendamentos):
- Adicionar `periodo_id` (FK → `ferias_periodos.id`) para vincular cada agendamento a um período específico.
- Manter colunas atuais (`data_inicio`, `data_fim`, `dias_gozo`, `dias_abono`, `tipo_programacao`, `status`, `observacao`, `periodo_aquisitivo_inicio/fim`).

**Função SQL `gerar_periodos_aquisitivos(pessoa_id)`**:
- Cria períodos desde `data_contratacao` (ou `vacation_control_start`) até hoje + 1 ano.
- Mapeia `pending_vacation_days` / `overdue_vacation_days` (setup inicial) para o período correspondente.

**Trigger** em `ferias` (insert/update/delete) → invalida cache via `updated_at` no `pessoas` e permite refetch coordenado no client.

## 2. Lógica de domínio (`src/lib/ferias.ts`)

Novos tipos e helpers, preservando os atuais:
- `PeriodoFerias` (com `usados`, `vendidos`, `agendados`, `restantes`, `status`).
- `calcularPeriodos(pessoa, ferias, hoje)` → array de períodos com métricas.
- `statusDoPeriodo(p, hoje)` → um dos 7 status.
- `alertasDoPeriodo(p)` → alertas por período (`overdue`, `expira em 60d`, `expira em 30d`, `sem agendamento`).
- Manter `calcularSaldo` (soma agregada dos períodos) para compatibilidade.

## 3. UI — `/ferias`

**Dashboard** (substitui cards atuais):
- Colaboradores em férias hoje
- Colaboradores com férias vencidas
- Períodos aquisitivos vencidos
- Vencendo em 60 dias / em 30 dias
- Colaboradores sem férias programadas
- Dias disponíveis / programados / vendidos
- Mantém "Configuração pendente" (setup inicial)

**Aba Colaboradores** — nova visão por período:
- Card/linha expansível por colaborador com lista de períodos:
  - `2024/2025 • 30 direito • 0 usados • 30 restantes • 🔴 Vencida`
  - `2025/2026 • 30 direito • 20 agendados • 10 vendidos • 🟡 Agendada`
  - `2026/2027 • Adquirindo • 18 dias acumulados`
- Ação "Programar" abre dialog já com dropdown de período.

**Dialog Programar Férias**:
- Novo campo obrigatório: **Período aquisitivo** (dropdown com períodos disponíveis, default = mais antigo com saldo).
- Validação por período (não pelo total): gozo + abono ≤ restantes do período; abono acumulado do período ≤ 10.
- Warning (não bloqueia) se houver conflito com `escalas` ou `programa_necessidades`.

**Timeline / Calendário anual**:
- Cada bloco mostra: dias de gozo, dias vendidos, período (`2025/2026`), status.

## 4. Sincronização (correção crítica)

Fonte única = `ferias`. Ao criar/editar/excluir:
- `queryClient.invalidateQueries` em `["ferias"]`, `["escalas"]`, `["programa_necessidades"]`, `["gestao"]`.
- Atualizar `src/lib/gestao/metricas.ts` para considerar `data_inicio..data_fim` das férias (apenas dias de gozo, não abono/vendidos) como indisponíveis na cobertura.
- Escala Operacional e Planejamento Macro passam a consultar `ferias` diretamente para marcar ausência.

## 5. Alertas

Alertas gerados por período, não por colaborador:
- 🔴 Período vencido
- 🟡 Vence em ≤ 60 dias sem agendamento
- 🟠 Sem férias agendadas em nenhum período disponível
Exibidos em badges no dashboard, lista e cadastro.

## 6. Validação (só avisa, não bloqueia)

Ao salvar programação:
- Conflito com `escalas` do período
- Conflito com `programa_necessidades` (cobertura)
- Sobreposição com outra `ferias` do mesmo colaborador

Todos como warnings com "Deseja continuar?".

## 7. Compatibilidade

- Manter API pública de `calcularSaldo` e componentes existentes que a consomem.
- Setup inicial (`vacation_status`, `pending_vacation_days`, `overdue_vacation_days`) continua funcionando — mapeado para o período correspondente ao gerar.
- Sem duplicar registros: `ferias_periodos` é gerado sob demanda a partir de `data_contratacao`; `ferias` mantém agendamentos.

## Ordem de execução
1. Migration: `ferias_periodos` + coluna `periodo_id` em `ferias` + função de geração.
2. Helpers em `ferias.ts` (novos tipos, `calcularPeriodos`).
3. Refactor do `/ferias` (dashboard, aba colaboradores, dialog com dropdown de período).
4. Timeline/calendário com blocos ampliados.
5. Sync: invalidations + atualização de `metricas.ts`.
6. Alertas por período.

## Fora do escopo
- Notificações por e-mail, workflow de aprovação, auditoria, exportação dedicada.
