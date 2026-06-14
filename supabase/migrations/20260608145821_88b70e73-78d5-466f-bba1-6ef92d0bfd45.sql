
-- FUNCOES
CREATE TABLE public.funcoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcoes TO anon, authenticated;
GRANT ALL ON public.funcoes TO service_role;
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage funcoes" ON public.funcoes FOR ALL USING (true) WITH CHECK (true);

-- PROGRAMAS
CREATE TABLE public.programas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  sigla TEXT,
  cor TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programas TO anon, authenticated;
GRANT ALL ON public.programas TO service_role;
ALTER TABLE public.programas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage programas" ON public.programas FOR ALL USING (true) WITH CHECK (true);

-- ILHAS
CREATE TABLE public.ilhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ilhas TO anon, authenticated;
GRANT ALL ON public.ilhas TO service_role;
ALTER TABLE public.ilhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage ilhas" ON public.ilhas FOR ALL USING (true) WITH CHECK (true);

-- PESSOAS
CREATE TABLE public.pessoas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  funcao_id UUID REFERENCES public.funcoes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pessoas TO anon, authenticated;
GRANT ALL ON public.pessoas TO service_role;
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage pessoas" ON public.pessoas FOR ALL USING (true) WITH CHECK (true);

-- ESCALAS
CREATE TABLE public.escalas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  programa_id UUID REFERENCES public.programas(id) ON DELETE SET NULL,
  ilha_id UUID REFERENCES public.ilhas(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  modalidade TEXT NOT NULL DEFAULT 'TV',
  status TEXT NOT NULL DEFAULT 'Trabalhando',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalas TO anon, authenticated;
GRANT ALL ON public.escalas TO service_role;
ALTER TABLE public.escalas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage escalas" ON public.escalas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_escalas_data ON public.escalas(data);
CREATE INDEX idx_escalas_pessoa ON public.escalas(pessoa_id);
