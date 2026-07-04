
CREATE TABLE public.performance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL CHECK (tipo IN ('performance','incidente','reconhecimento')),
  nota_artistico SMALLINT CHECK (nota_artistico BETWEEN 0 AND 10),
  nota_tecnico SMALLINT CHECK (nota_tecnico BETWEEN 0 AND 10),
  nota_comportamento SMALLINT CHECK (nota_comportamento BETWEEN 0 AND 10),
  recognition_tag TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX performance_records_pessoa_idx ON public.performance_records(pessoa_id);
CREATE INDEX performance_records_data_idx ON public.performance_records(data DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_records TO anon;
GRANT ALL ON public.performance_records TO service_role;

ALTER TABLE public.performance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read performance" ON public.performance_records FOR SELECT USING (true);
CREATE POLICY "public write performance" ON public.performance_records FOR INSERT WITH CHECK (true);
CREATE POLICY "public update performance" ON public.performance_records FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete performance" ON public.performance_records FOR DELETE USING (true);

CREATE TRIGGER performance_records_set_updated_at
BEFORE UPDATE ON public.performance_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
