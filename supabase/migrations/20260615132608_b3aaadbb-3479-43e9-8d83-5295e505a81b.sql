
CREATE TABLE public.programa_necessidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programa_id, dia_semana)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_necessidades TO anon, authenticated;
GRANT ALL ON public.programa_necessidades TO service_role;

ALTER TABLE public.programa_necessidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public manage programa_necessidades"
  ON public.programa_necessidades
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER programa_necessidades_set_updated_at
  BEFORE UPDATE ON public.programa_necessidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
