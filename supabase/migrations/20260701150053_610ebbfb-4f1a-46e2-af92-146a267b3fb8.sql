ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS vacation_status text CHECK (vacation_status IN ('em_dia','pendente','vencida')),
  ADD COLUMN IF NOT EXISTS vacation_control_start date,
  ADD COLUMN IF NOT EXISTS pending_vacation_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_vacation_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_setup_notes text;