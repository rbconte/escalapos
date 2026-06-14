
CREATE TABLE public.ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'Programada',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias TO anon, authenticated;
GRANT ALL ON public.ferias TO service_role;
ALTER TABLE public.ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage ferias" ON public.ferias FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licencas TO anon, authenticated;
GRANT ALL ON public.licencas TO service_role;
ALTER TABLE public.licencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage licencas" ON public.licencas FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_ferias_updated_at BEFORE UPDATE ON public.ferias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_licencas_updated_at BEFORE UPDATE ON public.licencas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ferias_pessoa ON public.ferias(pessoa_id);
CREATE INDEX idx_ferias_range ON public.ferias(data_inicio, data_fim);
CREATE INDEX idx_licencas_pessoa ON public.licencas(pessoa_id);
CREATE INDEX idx_licencas_range ON public.licencas(data_inicio, data_fim);
