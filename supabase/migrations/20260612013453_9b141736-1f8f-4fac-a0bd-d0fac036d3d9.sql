CREATE TABLE public.ocorrencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  data date NOT NULL,
  descricao text NOT NULL,
  valor_encontrado text,
  valor_exigido text,
  status text NOT NULL DEFAULT 'Aberta',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocorrencias TO anon, authenticated;
GRANT ALL ON public.ocorrencias TO service_role;

ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public manage ocorrencias"
  ON public.ocorrencias
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ocorrencias_pessoa ON public.ocorrencias(pessoa_id);
CREATE INDEX idx_ocorrencias_data ON public.ocorrencias(data);