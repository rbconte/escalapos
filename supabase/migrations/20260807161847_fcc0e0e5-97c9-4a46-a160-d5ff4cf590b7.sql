CREATE TABLE public.situacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#64748b',
  ordem integer NOT NULL DEFAULT 0,
  especial boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.situacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.situacoes TO anon;
GRANT ALL ON public.situacoes TO service_role;

ALTER TABLE public.situacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public manage situacoes" ON public.situacoes FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER situacoes_set_updated_at BEFORE UPDATE ON public.situacoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.situacoes (nome, cor, ordem, especial) VALUES
  ('Trabalhando', '#16a34a', 0, false),
  ('Folga', '#94a3b8', 1, true),
  ('Folga Aniversário', '#ec4899', 2, true),
  ('Folga Domingo', '#f97316', 3, true),
  ('Folga Semanal', '#f59e0b', 4, true),
  ('Licença', '#ef4444', 5, true),
  ('Férias', '#0ea5e9', 6, true),
  ('Treinamento', '#a855f7', 7, true),
  ('Banco de Horas', '#f59e0b', 8, true),
  ('Afastamento', '#64748b', 9, true),
  ('Outros', '#475569', 10, true);