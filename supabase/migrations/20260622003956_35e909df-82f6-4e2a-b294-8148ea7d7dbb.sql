
-- pessoas
ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS matricula text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS data_contratacao date,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS email_corporativo text,
  ADD COLUMN IF NOT EXISTS email_pessoal text,
  ADD COLUMN IF NOT EXISTS contato_emergencia text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS jornada_padrao text;

CREATE UNIQUE INDEX IF NOT EXISTS pessoas_matricula_unique
  ON public.pessoas (matricula)
  WHERE matricula IS NOT NULL;

-- ferias
ALTER TABLE public.ferias
  ADD COLUMN IF NOT EXISTS dias_gozo integer,
  ADD COLUMN IF NOT EXISTS dias_abono integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_programacao text NOT NULL DEFAULT 'Integrais',
  ADD COLUMN IF NOT EXISTS periodo_aquisitivo_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_aquisitivo_fim date;

-- updated_at trigger for ferias (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ferias_set_updated_at'
  ) THEN
    CREATE TRIGGER ferias_set_updated_at
      BEFORE UPDATE ON public.ferias
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
