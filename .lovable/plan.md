# Plan — Island Map + Work Distribution

Two new modules that share data but stay independent. Both follow the existing UI language: `PageShell`, shadcn tables/dialogs, TanStack Query loaders, `AppSidebar` entries, Portuguese labels consistent with the app.

## 1. Database (single migration)

New tables in `public`:

- **`ilha_planejamentos`** (Island Map — strategic blocks)
  - `ilha_id` → `ilhas.id`
  - `produto` text (name; color derived from a hash or optional `cor` hex)
  - `cor` text (nullable, chosen from `PROGRAMA_CORES`)
  - `data_inicio`, `data_fim` (date)
  - `hora_inicio`, `hora_fim` (time)
  - `area` text nullable (for the Area filter)
  - `notas` text nullable
  - standard id/created_at/updated_at + `set_updated_at` trigger

- **`distribuicao_trabalho`** (Work Distribution — daily assignments)
  - `data` date
  - `ilha_id` → `ilhas.id`
  - `produto` text
  - `programa_id` → `programas.id` nullable
  - `retranca` text nullable (Assignment)
  - `parceiro_conteudo` text nullable
  - `pessoa_id` → `pessoas.id` nullable (internal professional)
  - `hora_inicio`, `hora_fim` (time)
  - `status` text (`Planejado`, `Em Andamento`, `Concluído`, `Cancelado`)
  - `notas` text nullable

Grants: `authenticated` full CRUD, `service_role` all, `anon` SELECT (matches existing tables' open pattern in this project). RLS enabled with permissive "Allow all" policies matching the current project convention (all other tables use a single open policy).

## 2. Files

**New route files** (auto-registered by TanStack Router):
- `src/routes/mapa-ilhas.tsx` — Island Map Gantt view + create/edit dialog
- `src/routes/distribuicao.tsx` — Work Distribution table + dashboard + dialog

**New lib files:**
- `src/lib/mapa-ilhas.ts` — types, query options, color helpers, overlap detection
- `src/lib/distribuicao.ts` — types, query options, conflict detection, planning lookup

**Modified:**
- `src/components/app-sidebar.tsx` — add two entries under "Operacional" (icons: `Map`, `ClipboardList`)
- `src/integrations/supabase/types.ts` — regenerated after migration

## 3. Island Map UI (`/mapa-ilhas`)

- `PageShell` header with title "Mapa de Ilhas" and actions: zoom toggle (Diário / Semanal / Mensal / Personalizado), date navigation, "Novo Planejamento" button.
- Filters bar: Produto (autocomplete from existing planejamentos), Área, Ilha (multi), intervalo de datas.
- **Gantt grid**: rows = Ilhas (filtered), columns = days in the selected range. Blocks rendered as absolute-positioned bars spanning `data_inicio → data_fim`, colored by product, with product name inside and tooltip (product, dates, times, notes). Overlapping blocks stack vertically inside the row with a small ⚠ badge.
- Click a block → edit dialog. Empty cell click → create dialog prefilled with island/date.
- Dialog fields: Ilha (select), Produto (text + color), Data Início/Fim, Hora Início/Fim, Área, Notas. On save: warn (toast) if overlap exists but never block.

## 4. Work Distribution UI (`/distribuicao`)

- `PageShell` header: title "Distribuição de Trabalho", date picker (default: today), "Nova Atribuição" button.
- **Dashboard row** (KPI cards using existing `Card` styling):
  - Atribuições Ativas, Ilhas Ocupadas, Ilhas Disponíveis, Profissionais Ativos, Conflitos Operacionais, Em Andamento.
- **View switch** (Tabs): Tabela / Por Ilha / Por Profissional / Por Programa.
- **Table view**: shadcn Table with columns per spec, sortable headers, search input, filters (Ilha, Status, Programa). Status pill uses colored badge. Row click → edit dialog. Inline quick actions (edit/delete).
- **Grouped views**: same rows collapsed under group headers.
- **Dialog** — Nova/Editar Atribuição:
  - Data, Ilha (select) → on change, look up `ilha_planejamentos` for that date. If a plan exists, show a suggestion banner: "Planejamento: {produto} {hora_inicio}-{hora_fim}" with a "Preencher automaticamente" button (fills Produto/hora fields). User can ignore.
  - Fields: Produto, Programa (select), Retranca, Parceiro de Conteúdo, Profissional Interno (pessoas select), Hora Início/Fim, Status, Notas.
  - On save: if selected Produto/horário diverge from plan → toast warning only. Never block.
- **Conflict detection** for KPI: same pessoa_id with overlapping times on same date, or same ilha with overlapping times.

## 5. Shared behavior

- Both modules use TanStack Query loader pattern (`ensureQueryData` + `useSuspenseQuery`), same as existing `ferias.tsx` / `performance.tsx`.
- Consistent Portuguese labels, `PageShell`, shadcn components, `PROGRAMA_CORES`, `STATUS_META`-style badges.
- No changes to existing modules beyond sidebar registration.

## Technical notes

- Overlap detection: pure client-side on already-fetched rows (small dataset).
- Planning lookup on assignment: query `ilha_planejamentos` where `ilha_id = ?` AND `data BETWEEN data_inicio AND data_fim`, sorted by hora_inicio.
- Color per product: if `cor` unset, hash product name → index into `PROGRAMA_CORES`.
- All timestamps as `date` + `time` (no timezone quirks).
- RLS: match project convention (single permissive policy per table) — this project has no auth surface for end-users; every other table uses the same open pattern.
